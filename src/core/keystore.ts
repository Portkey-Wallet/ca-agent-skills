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
  /** Origin chain where CA was created */
  originChainId: ChainId;
  /** aelf-sdk standard keystore object (encrypted) */
  keystore: Record<string, unknown>;
}

export interface UnlockedWalletState {
  wallet: AElfWallet;
  caHash: string;
  caAddress: string;
  originChainId: ChainId;
  network: string;
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
  /** Manager address (only available when unlocked) */
  managerAddress: string | null;
  /** Network */
  network: string;
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
}

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

let unlockedState: UnlockedWalletState | null = null;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Validate and get the keystore file path for a given network. */
export function getKeystorePath(network: string): string {
  if (!ALLOWED_NETWORKS.includes(network)) {
    throw new Error(
      `Invalid network "${network}". Allowed values: ${ALLOWED_NETWORKS.join(', ')}`,
    );
  }
  return path.join(KEYSTORE_DIR, `${network}.keystore.json`);
}

/** Ensure the keystore directory exists with proper permissions. */
function ensureKeystoreDir(): void {
  if (!fs.existsSync(KEYSTORE_DIR)) {
    fs.mkdirSync(KEYSTORE_DIR, { recursive: true, mode: DIR_MODE });
  }
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
  const { password, privateKey, mnemonic, caHash, caAddress, originChainId, network } = params;

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
    originChainId: originChainId || 'AELF',
    keystore: keystoreObj as unknown as Record<string, unknown>,
  };

  // Write to disk
  ensureKeystoreDir();
  const filePath = getKeystorePath(network);
  fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2), {
    mode: FILE_MODE,
  });

  // Auto-unlock after save
  unlockedState = {
    wallet,
    caHash,
    caAddress,
    originChainId: originChainId || 'AELF',
    network,
  };

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
): {
  message: string;
  caAddress: string;
  caHash: string;
  managerAddress: string;
  originChainId: ChainId;
} {
  if (!password) throw new Error('password is required');

  const filePath = getKeystorePath(network);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `No keystore found for network "${network}". ` +
      `Expected at: ${filePath}. Use portkey_save_keystore first.`,
    );
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const fileContent: CaKeystoreFile = JSON.parse(raw);

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
    originChainId: fileContent.originChainId,
    network,
  };

  return {
    message: 'Wallet unlocked successfully.',
    caAddress: fileContent.caAddress,
    caHash: fileContent.caHash,
    managerAddress: wallet.address,
    originChainId: fileContent.originChainId,
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
export function getWalletStatus(network: string): WalletStatus {
  const filePath = getKeystorePath(network);
  const exists = fs.existsSync(filePath);
  const unlocked = unlockedState !== null && unlockedState.network === network;

  let caAddress: string | null = null;
  let caHash: string | null = null;

  if (exists) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const fileContent: CaKeystoreFile = JSON.parse(raw);
      caAddress = fileContent.caAddress;
      caHash = fileContent.caHash;
    } catch {
      // File exists but can't be read — treat as no metadata
    }
  }

  return {
    exists,
    unlocked,
    caAddress,
    caHash,
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
