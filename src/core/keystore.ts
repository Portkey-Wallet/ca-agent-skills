/**
 * Keystore management for CA wallet Manager private keys.
 *
 * Encrypts the Manager private key + mnemonic using aelf-sdk's keystore
 * module (scrypt KDF + AES-128-CTR) and persists to ~/.portkey-ca/.
 *
 * Provides unlock/lock lifecycle for in-memory wallet state.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getKeystore, unlockKeystore } from 'aelf-sdk/src/util/keyStore.js';
import { getWalletByPrivateKey, type AElfWallet } from '../../lib/aelf-client.js';
import type { ChainId } from '../../lib/types.js';
import {
  getActiveWalletProfile,
  setActiveWalletProfile,
  type ActiveWalletProfile,
  type SignerContextInput,
  type SignerProvider,
} from '../../lib/wallet-context.js';
import {
  SIGNER_ERROR_CODES,
  formatSignerError,
} from '../../lib/signer-error-codes.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KEYSTORE_DIR = path.join(os.homedir(), '.portkey', 'ca');
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
const ALLOWED_NETWORKS = ['mainnet', 'testnet'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CaKeystoreFile {
  /** CA hash from Portkey */
  caHash: string;
  /** CA address (e.g. ELF_xxx_AELF) */
  caAddress: string;
  /** Login email associated with this local CA profile */
  loginEmail?: string;
  /** Origin chain where CA was created */
  originChainId: ChainId;
  /** aelf-sdk standard keystore object (encrypted) */
  keystore: Record<string, unknown>;
}

export interface UnlockedWalletState {
  wallet: AElfWallet;
  caHash: string;
  caAddress: string;
  loginEmail?: string;
  originChainId: ChainId;
  network: string;
  keystorePath: string;
}

export interface WalletStatus {
  /** Whether a keystore file exists on disk */
  exists: boolean;
  /** Whether the wallet is currently unlocked in memory */
  unlocked: boolean;
  /** CA address (available even when locked, read from keystore metadata) */
  caAddress: string | null;
  /** CA hash */
  caHash: string | null;
  /** Login email associated with this local CA profile */
  loginEmail: string | null;
  /** Manager address (only available when unlocked) */
  managerAddress: string | null;
  /** Network */
  network: string;
}

export interface WalletProfileSummary {
  loginEmail: string | null;
  network: string;
  caAddress: string | null;
  caHash: string | null;
  keystoreFile: string;
  isActive: boolean;
}

export interface SaveKeystoreParams {
  /** Password to encrypt the keystore */
  password: string;
  /** Manager private key (hex) */
  privateKey: string;
  /** Manager mnemonic */
  mnemonic: string;
  /** CA hash */
  caHash: string;
  /** CA address */
  caAddress: string;
  /** Origin chain ID */
  originChainId: ChainId;
  /** Network (mainnet/testnet) */
  network: string;
  /** Login email associated with the CA account */
  loginEmail?: string;
}

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

let unlockedState: UnlockedWalletState | null = null;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Validate and get the keystore file path for a given network. */
export function getKeystorePath(network: string, loginEmail?: string): string {
  if (!ALLOWED_NETWORKS.includes(network)) {
    throw new Error(
      `Invalid network "${network}". Allowed values: ${ALLOWED_NETWORKS.join(', ')}`,
    );
  }
  const normalizedLoginEmail = normalizeLoginEmail(loginEmail);
  if (!normalizedLoginEmail) {
    return path.join(KEYSTORE_DIR, `${network}.keystore.json`);
  }
  return path.join(
    KEYSTORE_DIR,
    network,
    `${encodeURIComponent(normalizedLoginEmail)}.keystore.json`,
  );
}

function normalizeLoginEmail(loginEmail?: string): string | undefined {
  const normalized = typeof loginEmail === 'string'
    ? loginEmail.trim().toLowerCase()
    : '';
  return normalized || undefined;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: DIR_MODE });
  }
  try {
    fs.chmodSync(dirPath, DIR_MODE);
  } catch {
    // Ignore permission errors for externally managed parent dirs in tests.
  }
}

/** Ensure the keystore directory exists with proper permissions. */
function ensureKeystoreDir(filePath: string): void {
  ensureDir(KEYSTORE_DIR);
  ensureDir(path.dirname(filePath));
}

function readKeystoreFile(filePath: string): CaKeystoreFile {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as CaKeystoreFile;
}

function readKeystoreMetadata(filePath: string): {
  caAddress: string | null;
  caHash: string | null;
  loginEmail: string | null;
} {
  try {
    const fileContent = readKeystoreFile(filePath);
    return {
      caAddress: fileContent.caAddress || null,
      caHash: fileContent.caHash || null,
      loginEmail: fileContent.loginEmail || null,
    };
  } catch {
    return {
      caAddress: null,
      caHash: null,
      loginEmail: null,
    };
  }
}

function getRequestedKeystorePath(network: string, loginEmail?: string): string {
  return getKeystorePath(network, loginEmail);
}

function isSamePath(left?: string, right?: string): boolean {
  return Boolean(left && right && path.resolve(left) === path.resolve(right));
}

function getActiveKeystorePath(): string | undefined {
  const unlocked = unlockedState?.keystorePath;
  if (unlocked) return unlocked;
  const active = getActiveWalletProfile();
  return active?.source === 'ca-keystore' ? active.keystoreFile : undefined;
}

function loadWalletProfileSummary(
  network: string,
  keystoreFile: string,
): WalletProfileSummary {
  const metadata = readKeystoreMetadata(keystoreFile);
  return {
    loginEmail: metadata.loginEmail,
    network,
    caAddress: metadata.caAddress,
    caHash: metadata.caHash,
    keystoreFile,
    isActive: isSamePath(getActiveKeystorePath(), keystoreFile),
  };
}

function listProfileKeystoreFiles(network: string): string[] {
  const profileDir = path.join(KEYSTORE_DIR, network);
  if (!fs.existsSync(profileDir)) return [];

  return fs.readdirSync(profileDir)
    .filter((fileName) => fileName.endsWith('.keystore.json'))
    .map((fileName) => path.join(profileDir, fileName));
}

// ---------------------------------------------------------------------------
// Save keystore
// ---------------------------------------------------------------------------

/**
 * Encrypt and save the Manager wallet to a keystore file.
 * Also auto-unlocks the wallet in memory after saving.
 *
 * @returns Summary of what was saved
 */
export function saveKeystore(params: SaveKeystoreParams): {
  message: string;
  keystorePath: string;
  caAddress: string;
  managerAddress: string;
} {
  const {
    password,
    privateKey,
    mnemonic,
    caHash,
    caAddress,
    originChainId,
    network,
    loginEmail,
  } = params;

  if (!password) throw new Error('password is required');
  if (!privateKey) throw new Error('privateKey is required');
  if (!mnemonic) throw new Error('mnemonic is required');
  if (!caHash) throw new Error('caHash is required');
  if (!caAddress) throw new Error('caAddress is required');
  if (!network) throw new Error('network is required');

  // Use aelf-sdk's getKeystore to encrypt
  const wallet = getWalletByPrivateKey(privateKey);
  const keystoreObj = getKeystore(
    { privateKey, mnemonic, address: wallet.address },
    password,
  );

  // Build the file content with CA metadata
  const fileContent: CaKeystoreFile = {
    caHash,
    caAddress,
    loginEmail: normalizeLoginEmail(loginEmail),
    originChainId: originChainId || 'AELF',
    keystore: keystoreObj as unknown as Record<string, unknown>,
  };

  // Write to disk
  const filePath = getKeystorePath(network, loginEmail);
  ensureKeystoreDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2), {
    mode: FILE_MODE,
  });

  // Auto-unlock after save
  unlockedState = {
    wallet,
    caHash,
    caAddress,
    loginEmail: fileContent.loginEmail,
    originChainId: originChainId || 'AELF',
    network,
    keystorePath: filePath,
  };

  setActiveWalletProfile(
    {
      walletType: 'CA',
      source: 'ca-keystore',
      network,
      caHash,
      caAddress,
      loginEmail: fileContent.loginEmail,
      address: wallet.address,
      keystoreFile: filePath,
    },
    {
      skill: 'portkey-ca',
      version: process.env.npm_package_version || '0.0.0',
    },
  );

  return {
    message: `Keystore saved and wallet unlocked. Path: ${filePath}`,
    keystorePath: filePath,
    caAddress,
    managerAddress: wallet.address,
  };
}

// ---------------------------------------------------------------------------
// Unlock / Lock
// ---------------------------------------------------------------------------

/**
 * Unlock the keystore with a password. Loads the decrypted wallet into memory.
 *
 * @returns Wallet info (no sensitive data like privateKey exposed)
 */
export function unlockWallet(
  password: string,
  network: string,
  loginEmail?: string,
): {
  message: string;
  caAddress: string;
  caHash: string;
  managerAddress: string;
  originChainId: ChainId;
  loginEmail: string | null;
} {
  if (!password) throw new Error('password is required');

  const filePath = getRequestedKeystorePath(network, loginEmail);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `No keystore found for network "${network}"` +
      `${loginEmail ? ` and loginEmail "${normalizeLoginEmail(loginEmail)}"` : ''}. ` +
      `Expected at: ${filePath}. Use portkey_save_keystore first.`,
    );
  }

  const fileContent = readKeystoreFile(filePath);

  // Use aelf-sdk's unlockKeystore to decrypt
  const decrypted = unlockKeystore(fileContent.keystore, password);

  if (!decrypted || !decrypted.privateKey) {
    throw new Error('Failed to decrypt keystore. Wrong password?');
  }

  const wallet = getWalletByPrivateKey(decrypted.privateKey);

  unlockedState = {
    wallet,
    caHash: fileContent.caHash,
    caAddress: fileContent.caAddress,
    loginEmail: fileContent.loginEmail,
    originChainId: fileContent.originChainId,
    network,
    keystorePath: filePath,
  };

  setActiveWalletProfile(
    {
      walletType: 'CA',
      source: 'ca-keystore',
      network,
      caHash: fileContent.caHash,
      caAddress: fileContent.caAddress,
      loginEmail: fileContent.loginEmail,
      address: wallet.address,
      keystoreFile: filePath,
    },
    {
      skill: 'portkey-ca',
      version: process.env.npm_package_version || '0.0.0',
    },
  );

  return {
    message: 'Wallet unlocked successfully.',
    caAddress: fileContent.caAddress,
    caHash: fileContent.caHash,
    managerAddress: wallet.address,
    originChainId: fileContent.originChainId,
    loginEmail: fileContent.loginEmail || null,
  };
}

/**
 * Lock the wallet — clear the in-memory private key.
 */
export function lockWallet(): { message: string } {
  unlockedState = null;
  return { message: 'Wallet locked. Private key cleared from memory.' };
}

// ---------------------------------------------------------------------------
// Status & accessors
// ---------------------------------------------------------------------------

/**
 * Get the current wallet status for a given network.
 * Readable even when locked (reads CA metadata from keystore file).
 */
export function getWalletStatus(network: string, loginEmail?: string): WalletStatus {
  const filePath = getRequestedKeystorePath(network, loginEmail);
  const exists = fs.existsSync(filePath);
  const unlocked = unlockedState !== null && isSamePath(unlockedState.keystorePath, filePath);
  const metadata = exists
    ? readKeystoreMetadata(filePath)
    : { caAddress: null, caHash: null, loginEmail: null };

  return {
    exists,
    unlocked,
    caAddress: metadata.caAddress,
    caHash: metadata.caHash,
    loginEmail: metadata.loginEmail,
    managerAddress: unlocked ? unlockedState!.wallet.address : null,
    network,
  };
}

/**
 * Get the currently unlocked wallet state.
 * Returns null if no wallet is unlocked.
 *
 * Used by write operations (transfer, guardian, forward call) to get the wallet.
 */
export function getUnlockedWallet(): UnlockedWalletState | null {
  return unlockedState;
}

/**
 * Clear unlocked state (for testing).
 */
export function clearKeystoreState(): void {
  unlockedState = null;
}

export function listWalletProfiles(network?: string): WalletProfileSummary[] {
  const networks = network ? [network] : ALLOWED_NETWORKS;
  const profiles: WalletProfileSummary[] = [];

  for (const currentNetwork of networks) {
    if (!ALLOWED_NETWORKS.includes(currentNetwork)) {
      throw new Error(
        `Invalid network "${currentNetwork}". Allowed values: ${ALLOWED_NETWORKS.join(', ')}`,
      );
    }

    const legacyPath = getKeystorePath(currentNetwork);
    if (fs.existsSync(legacyPath)) {
      profiles.push(loadWalletProfileSummary(currentNetwork, legacyPath));
    }

    for (const profilePath of listProfileKeystoreFiles(currentNetwork)) {
      profiles.push(loadWalletProfileSummary(currentNetwork, profilePath));
    }
  }

  return profiles.sort((left, right) => {
    const networkCompare = left.network.localeCompare(right.network);
    if (networkCompare !== 0) return networkCompare;
    const emailCompare = (left.loginEmail || '').localeCompare(right.loginEmail || '');
    if (emailCompare !== 0) return emailCompare;
    return left.keystoreFile.localeCompare(right.keystoreFile);
  });
}

export function getWalletProfileByLoginEmail(
  network: string,
  loginEmail: string,
): WalletProfileSummary | null {
  const filePath = getKeystorePath(network, loginEmail);
  if (!fs.existsSync(filePath)) return null;
  return loadWalletProfileSummary(network, filePath);
}

// ---------------------------------------------------------------------------
// AelfSigner bridge — create signer for use with DApp skills
// ---------------------------------------------------------------------------

import { createCaSigner, createSignerFromEnv, type AelfSigner } from '@portkey/aelf-signer';

/**
 * Create an AelfSigner (CaSigner) from the current CA wallet state.
 *
 * Resolution order:
 *   1. Unlocked keystore in memory → CaSigner
 *   2. Environment variables (PORTKEY_PRIVATE_KEY + PORTKEY_CA_HASH + PORTKEY_CA_ADDRESS) → auto-detect
 *
 * The returned signer can be used with awaken-agent-skills / eforest-agent-skills
 * to execute DApp operations (swap, liquidity, token creation, etc.) using the
 * Portkey CA wallet.
 */
export function createSignerFromCaWallet(): AelfSigner {
  const unlocked = getUnlockedWallet();
  if (unlocked) {
    return createCaSigner({
      managerPrivateKey: unlocked.wallet.privateKey,
      caHash: unlocked.caHash,
      caAddress: unlocked.caAddress,
    });
  }
  // Fallback to env-based detection
  return createSignerFromEnv();
}

function readKeystoreProfileSigner(input: SignerContextInput): AelfSigner {
  const profile = getActiveWalletProfile();
  if (!profile || profile.walletType !== 'CA' || profile.source !== 'ca-keystore') {
    throw new Error(
      formatSignerError(
        SIGNER_ERROR_CODES.CONTEXT_NOT_FOUND,
        'no active CA keystore profile',
      ),
    );
  }
  const keystorePath = profile.keystoreFile || getKeystorePath(
    profile.network || 'mainnet',
    profile.loginEmail,
  );
  if (!fs.existsSync(keystorePath)) {
    throw new Error(
      formatSignerError(
        SIGNER_ERROR_CODES.CONTEXT_INVALID,
        `keystore file not found: ${keystorePath}`,
      ),
    );
  }
  const password = input.password || process.env.PORTKEY_CA_KEYSTORE_PASSWORD;
  if (!password) {
    throw new Error(
      formatSignerError(
        SIGNER_ERROR_CODES.PASSWORD_REQUIRED,
        'password is required for active CA keystore (set PORTKEY_CA_KEYSTORE_PASSWORD or pass password)',
      ),
    );
  }

  const fileContent = readKeystoreFile(keystorePath);
  const decrypted = unlockKeystore(fileContent.keystore, password);
  if (!decrypted?.privateKey) {
    throw new Error(
      formatSignerError(
        SIGNER_ERROR_CODES.CONTEXT_INVALID,
        'failed to decrypt active CA keystore',
      ),
    );
  }
  return createCaSigner({
    managerPrivateKey: decrypted.privateKey,
    caHash: fileContent.caHash || profile.caHash || '',
    caAddress: fileContent.caAddress || profile.caAddress || '',
  });
}

export function resolveSignerContext(input: SignerContextInput = {}): {
  signer: AelfSigner;
  provider: SignerProvider;
  warnings: string[];
} {
  const mode = input.signerMode || 'auto';
  const warnings: string[] = [];
  let contextError: unknown = null;

  if (mode === 'daemon') {
    throw new Error(
      formatSignerError(
        SIGNER_ERROR_CODES.DAEMON_NOT_IMPLEMENTED,
        'daemon provider is reserved for future release',
      ),
    );
  }

  if (mode === 'explicit' || mode === 'auto') {
    if (input.privateKey && input.walletType === 'CA' && input.caHash && input.caAddress) {
      return {
        signer: createCaSigner({
          managerPrivateKey: input.privateKey,
          caHash: input.caHash,
          caAddress: input.caAddress,
        }),
        provider: 'explicit',
        warnings,
      };
    }
  }

  if (mode === 'context' || mode === 'auto') {
    try {
      const signer = readKeystoreProfileSigner(input);
      return { signer, provider: 'context', warnings };
    } catch (error) {
      contextError = error;
      if (mode === 'context') throw error;
    }
  }

  if (mode === 'env' || mode === 'auto') {
    try {
      return {
        signer: createSignerFromEnv(),
        provider: 'env',
        warnings,
      };
    } catch (error) {
      if (mode === 'env') throw error;
    }
  }

  if (contextError) {
    throw contextError;
  }

  throw new Error(
    formatSignerError(
      SIGNER_ERROR_CODES.CONTEXT_NOT_FOUND,
      'no signer available from explicit/context/env',
    ),
  );
}

export function getActiveWallet(): ActiveWalletProfile | null {
  return getActiveWalletProfile();
}

export function setActiveWallet(input: {
  walletType: 'EOA' | 'CA';
  source: 'eoa-local' | 'ca-keystore' | 'env';
  network?: string;
  address?: string;
  loginEmail?: string;
  caAddress?: string;
  caHash?: string;
  walletFile?: string;
  keystoreFile?: string;
}) {
  return setActiveWalletProfile(input, {
    skill: 'portkey-ca',
    version: process.env.npm_package_version || '0.0.0',
  });
}
