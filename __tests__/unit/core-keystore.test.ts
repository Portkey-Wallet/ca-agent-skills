import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createWallet } from '../../lib/aelf-client';

const originalHome = process.env.HOME;
const originalContextPath = process.env.PORTKEY_SKILL_WALLET_CONTEXT_PATH;
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-keystore-home-'));
process.env.HOME = testHome;
process.env.PORTKEY_SKILL_WALLET_CONTEXT_PATH = path.join(
  testHome,
  '.portkey',
  'skill-wallet',
  'context.v1.json',
);

let keystore: typeof import('../../src/core/keystore.js');

beforeAll(async () => {
  keystore = await import('../../src/core/keystore.js');
});

beforeEach(() => {
  keystore.clearKeystoreState();
  const dir = path.join(testHome, '.portkey');
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

afterAll(() => {
  if (originalHome !== undefined) {
    process.env.HOME = originalHome;
  } else {
    delete process.env.HOME;
  }
  if (originalContextPath !== undefined) {
    process.env.PORTKEY_SKILL_WALLET_CONTEXT_PATH = originalContextPath;
  } else {
    delete process.env.PORTKEY_SKILL_WALLET_CONTEXT_PATH;
  }
  fs.rmSync(testHome, { recursive: true, force: true });
});

describe('core/keystore', () => {
  test('getKeystorePath validates network', () => {
    expect(() => keystore.getKeystorePath('devnet')).toThrow('Invalid network');
    const mainnetPath = keystore.getKeystorePath('mainnet');
    expect(mainnetPath.endsWith('mainnet.keystore.json')).toBe(true);
    const profilePath = keystore.getKeystorePath('mainnet', 'User@One.com');
    expect(profilePath.endsWith('mainnet/user%40one.com.keystore.json')).toBe(true);
  });

  test('saveKeystore validates required params', () => {
    expect(() =>
      keystore.saveKeystore({
        password: '',
        privateKey: 'pk',
        mnemonic: 'm',
        caHash: 'hash',
        caAddress: 'ELF_ca_tDVV',
        originChainId: 'tDVV',
        network: 'mainnet',
      } as any),
    ).toThrow('password is required');
  });

  test('saveKeystore writes file and auto-unlocks wallet', () => {
    const wallet = createWallet();

    const result = keystore.saveKeystore({
      password: 'secret',
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic!,
      caHash: 'hash',
      caAddress: 'ELF_ca_tDVV',
      originChainId: 'tDVV',
      network: 'mainnet',
    });

    expect(result.caAddress).toBe('ELF_ca_tDVV');
    expect(result.managerAddress).toBe(wallet.address);

    const status = keystore.getWalletStatus('mainnet');
    expect(status.exists).toBe(true);
    expect(status.unlocked).toBe(true);
    expect(status.caHash).toBe('hash');
    expect(status.caAddress).toBe('ELF_ca_tDVV');

    const active = keystore.getActiveWallet();
    expect(active?.walletType).toBe('CA');
    expect(active?.source).toBe('ca-keystore');
    expect(active?.caHash).toBe('hash');
    expect(active?.caAddress).toBe('ELF_ca_tDVV');
  });

  test('saveKeystore with loginEmail writes profile-specific keystore without overwriting others', () => {
    const first = createWallet();
    const second = createWallet();

    const firstResult = keystore.saveKeystore({
      password: 'secret',
      privateKey: first.privateKey,
      mnemonic: first.mnemonic!,
      caHash: 'hash_first_email',
      caAddress: 'ELF_ca_first_email_tDVV',
      loginEmail: 'first@example.com',
      originChainId: 'tDVV',
      network: 'mainnet',
    });
    const secondResult = keystore.saveKeystore({
      password: 'secret',
      privateKey: second.privateKey,
      mnemonic: second.mnemonic!,
      caHash: 'hash_second_email',
      caAddress: 'ELF_ca_second_email_tDVV',
      loginEmail: 'second@example.com',
      originChainId: 'tDVV',
      network: 'mainnet',
    });

    expect(firstResult.keystorePath).not.toBe(secondResult.keystorePath);
    expect(fs.existsSync(firstResult.keystorePath)).toBe(true);
    expect(fs.existsSync(secondResult.keystorePath)).toBe(true);

    const profiles = keystore.listWalletProfiles('mainnet');
    expect(profiles.map((item) => item.loginEmail)).toContain('first@example.com');
    expect(profiles.map((item) => item.loginEmail)).toContain('second@example.com');

    const active = keystore.getActiveWallet();
    expect(active?.loginEmail).toBe('second@example.com');
  });

  test('unlockWallet throws when file does not exist', () => {
    keystore.clearKeystoreState();
    const path = keystore.getKeystorePath('mainnet');
    if (fs.existsSync(path)) fs.rmSync(path, { force: true });
    expect(() => keystore.unlockWallet('secret', 'mainnet')).toThrow('No keystore found');
  });

  test('unlockWallet decrypts wallet and lockWallet clears memory', () => {
    const wallet = createWallet();

    keystore.saveKeystore({
      password: 'secret',
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic!,
      caHash: 'hash2',
      caAddress: 'ELF_ca2_tDVV',
      originChainId: 'tDVV',
      network: 'mainnet',
    });

    keystore.lockWallet();
    expect(keystore.getUnlockedWallet()).toBeNull();

    const unlocked = keystore.unlockWallet('secret', 'mainnet');
    expect(unlocked.caHash).toBe('hash2');
    expect(unlocked.caAddress).toBe('ELF_ca2_tDVV');

    expect(keystore.getUnlockedWallet()).not.toBeNull();
    keystore.lockWallet();
    expect(keystore.getUnlockedWallet()).toBeNull();
  });

  test('unlockWallet and getWalletStatus target the requested loginEmail profile', () => {
    const first = createWallet();
    const second = createWallet();

    keystore.saveKeystore({
      password: 'secret',
      privateKey: first.privateKey,
      mnemonic: first.mnemonic!,
      caHash: 'hash_first_lookup',
      caAddress: 'ELF_ca_first_lookup_tDVV',
      loginEmail: 'first@example.com',
      originChainId: 'tDVV',
      network: 'mainnet',
    });
    keystore.saveKeystore({
      password: 'secret',
      privateKey: second.privateKey,
      mnemonic: second.mnemonic!,
      caHash: 'hash_second_lookup',
      caAddress: 'ELF_ca_second_lookup_tDVV',
      loginEmail: 'second@example.com',
      originChainId: 'tDVV',
      network: 'mainnet',
    });

    keystore.lockWallet();

    const unlocked = keystore.unlockWallet('secret', 'mainnet', 'first@example.com');
    expect(unlocked.caHash).toBe('hash_first_lookup');
    expect(unlocked.loginEmail).toBe('first@example.com');

    const firstStatus = keystore.getWalletStatus('mainnet', 'first@example.com');
    const secondStatus = keystore.getWalletStatus('mainnet', 'second@example.com');
    expect(firstStatus.unlocked).toBe(true);
    expect(firstStatus.caHash).toBe('hash_first_lookup');
    expect(firstStatus.loginEmail).toBe('first@example.com');
    expect(secondStatus.unlocked).toBe(false);
    expect(secondStatus.caHash).toBe('hash_second_lookup');
  });

  test('unlockWallet can target an explicit keystoreFile without loginEmail', () => {
    const wallet = createWallet();

    keystore.saveKeystore({
      password: 'secret',
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic!,
      caHash: 'hash_file_locator',
      caAddress: 'ELF_ca_file_locator_tDVV',
      loginEmail: 'locator@example.com',
      originChainId: 'tDVV',
      network: 'mainnet',
    });
    keystore.lockWallet();

    const profilePath = keystore.getKeystorePath('mainnet', 'locator@example.com');
    const unlocked = keystore.unlockWallet('secret', 'mainnet', undefined, profilePath);

    expect(unlocked.caHash).toBe('hash_file_locator');
    expect(unlocked.managerAddress).toBe(wallet.address);
  });

  test('getWalletStatus without loginEmail only checks the legacy path', () => {
    const wallet = createWallet();

    keystore.saveKeystore({
      password: 'secret',
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic!,
      caHash: 'hash_profile_only',
      caAddress: 'ELF_ca_profile_only_tDVV',
      loginEmail: 'profile-only@example.com',
      originChainId: 'tDVV',
      network: 'mainnet',
    });

    const legacyStatus = keystore.getWalletStatus('mainnet');
    const targetedStatus = keystore.getWalletStatus('mainnet', 'profile-only@example.com');

    expect(legacyStatus.loginEmail).not.toBe('profile-only@example.com');
    expect(legacyStatus.caHash).not.toBe('hash_profile_only');
    expect(targetedStatus.exists).toBe(true);
    expect(targetedStatus.loginEmail).toBe('profile-only@example.com');
    expect(targetedStatus.caHash).toBe('hash_profile_only');
  });

  test('createSignerFromCaWallet works with unlocked wallet and env fallback', () => {
    const fallbackPrivateKey = createWallet().privateKey;
    process.env.PORTKEY_PRIVATE_KEY = fallbackPrivateKey;
    process.env.PORTKEY_CA_HASH = 'env_hash';
    process.env.PORTKEY_CA_ADDRESS = 'ELF_env_tDVV';

    const fallbackSigner = keystore.createSignerFromCaWallet();
    expect(fallbackSigner).toBeTruthy();

    const wallet = createWallet();
    keystore.saveKeystore({
      password: 'secret',
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic!,
      caHash: 'hash3',
      caAddress: 'ELF_ca3_tDVV',
      originChainId: 'tDVV',
      network: 'mainnet',
    });

    const signer = keystore.createSignerFromCaWallet();
    expect(signer).toBeTruthy();

    delete process.env.PORTKEY_PRIVATE_KEY;
    delete process.env.PORTKEY_CA_HASH;
    delete process.env.PORTKEY_CA_ADDRESS;
  });

  test('getWalletStatus tolerates malformed keystore file', () => {
    const malformedPath = keystore.getKeystorePath('mainnet');
    fs.mkdirSync(path.dirname(malformedPath), { recursive: true });
    fs.writeFileSync(malformedPath, 'not-json');

    const status = keystore.getWalletStatus('mainnet');
    expect(status.exists).toBe(true);
    expect(status.caAddress).toBeNull();
    expect(status.caHash).toBeNull();
    expect(status.loginEmail).toBeNull();
  });

  test('resolveSignerContext reads active CA keystore with password env', () => {
    const wallet = createWallet();
    keystore.saveKeystore({
      password: 'secret',
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic!,
      caHash: 'hash_ctx',
      caAddress: 'ELF_ctx_tDVV',
      loginEmail: 'ctx@example.com',
      originChainId: 'tDVV',
      network: 'mainnet',
    });
    keystore.lockWallet();

    process.env.PORTKEY_CA_KEYSTORE_PASSWORD = 'secret';
    const resolved = keystore.resolveSignerContext({ signerMode: 'context' });
    expect(resolved.provider).toBe('context');
    expect(resolved.signer.address).toBe('ELF_ctx_tDVV');
    delete process.env.PORTKEY_CA_KEYSTORE_PASSWORD;
  });

  test('resolveSignerContext daemon mode returns not implemented', () => {
    expect(() =>
      keystore.resolveSignerContext({ signerMode: 'daemon' }),
    ).toThrow('SIGNER_DAEMON_NOT_IMPLEMENTED');
  });

  test('resolveSignerContext auto mode falls back to env when context is missing', () => {
    process.env.PORTKEY_PRIVATE_KEY = createWallet().privateKey;
    process.env.PORTKEY_CA_HASH = 'env_hash_auto';
    process.env.PORTKEY_CA_ADDRESS = 'ELF_env_auto_tDVV';
    const resolved = keystore.resolveSignerContext({ signerMode: 'auto' });
    expect(resolved.provider).toBe('env');
    delete process.env.PORTKEY_PRIVATE_KEY;
    delete process.env.PORTKEY_CA_HASH;
    delete process.env.PORTKEY_CA_ADDRESS;
  });

  test('resolveSignerContext auto mode returns context password error when env is unavailable', () => {
    const wallet = createWallet();
    keystore.saveKeystore({
      password: 'secret',
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic!,
      caHash: 'hash_need_pwd',
      caAddress: 'ELF_need_pwd_tDVV',
      originChainId: 'tDVV',
      network: 'mainnet',
    });
    keystore.lockWallet();
    delete process.env.PORTKEY_PRIVATE_KEY;
    delete process.env.PORTKEY_CA_HASH;
    delete process.env.PORTKEY_CA_ADDRESS;
    delete process.env.PORTKEY_CA_KEYSTORE_PASSWORD;

    expect(() => keystore.resolveSignerContext({ signerMode: 'auto' })).toThrow(
      'SIGNER_PASSWORD_REQUIRED',
    );
  });

  test('legacy keystore still unlocks and reports status without loginEmail', () => {
    const wallet = createWallet();

    keystore.saveKeystore({
      password: 'secret',
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic!,
      caHash: 'hash_legacy',
      caAddress: 'ELF_ca_legacy_tDVV',
      originChainId: 'tDVV',
      network: 'mainnet',
    });
    keystore.lockWallet();

    const unlocked = keystore.unlockWallet('secret', 'mainnet');
    expect(unlocked.caHash).toBe('hash_legacy');

    const status = keystore.getWalletStatus('mainnet');
    expect(status.exists).toBe(true);
    expect(status.unlocked).toBe(true);
    expect(status.caHash).toBe('hash_legacy');
  });
});
