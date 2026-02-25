import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createWallet } from '../../lib/aelf-client';

const originalHome = process.env.HOME;
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-keystore-home-'));
process.env.HOME = testHome;

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
  fs.rmSync(testHome, { recursive: true, force: true });
});

describe('core/keystore', () => {
  test('getKeystorePath validates network', () => {
    expect(() => keystore.getKeystorePath('devnet')).toThrow('Invalid network');
    const mainnetPath = keystore.getKeystorePath('mainnet');
    expect(mainnetPath.endsWith('mainnet.keystore.json')).toBe(true);
  });

  test('saveKeystore validates required params', () => {
    expect(() =>
      keystore.saveKeystore({
        password: '',
        privateKey: 'pk',
        mnemonic: 'm',
        caHash: 'hash',
        caAddress: 'ELF_ca_AELF',
        originChainId: 'AELF',
        network: 'mainnet',
      } as any),
    ).toThrow('password is required');
  });

  test('saveKeystore writes file and auto-unlocks wallet', () => {
    const wallet = createWallet();

    const result = keystore.saveKeystore({
      password: 'secret',
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic,
      caHash: 'hash',
      caAddress: 'ELF_ca_AELF',
      originChainId: 'AELF',
      network: 'mainnet',
    });

    expect(result.caAddress).toBe('ELF_ca_AELF');
    expect(result.managerAddress).toBe(wallet.address);

    const status = keystore.getWalletStatus('mainnet');
    expect(status.exists).toBe(true);
    expect(status.unlocked).toBe(true);
    expect(status.caHash).toBe('hash');
    expect(status.caAddress).toBe('ELF_ca_AELF');
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
      mnemonic: wallet.mnemonic,
      caHash: 'hash2',
      caAddress: 'ELF_ca2_AELF',
      originChainId: 'AELF',
      network: 'mainnet',
    });

    keystore.lockWallet();
    expect(keystore.getUnlockedWallet()).toBeNull();

    const unlocked = keystore.unlockWallet('secret', 'mainnet');
    expect(unlocked.caHash).toBe('hash2');
    expect(unlocked.caAddress).toBe('ELF_ca2_AELF');

    expect(keystore.getUnlockedWallet()).not.toBeNull();
    keystore.lockWallet();
    expect(keystore.getUnlockedWallet()).toBeNull();
  });

  test('createSignerFromCaWallet works with unlocked wallet and env fallback', () => {
    const fallbackPrivateKey = createWallet().privateKey;
    process.env.PORTKEY_PRIVATE_KEY = fallbackPrivateKey;
    process.env.PORTKEY_CA_HASH = 'env_hash';
    process.env.PORTKEY_CA_ADDRESS = 'ELF_env_AELF';

    const fallbackSigner = keystore.createSignerFromCaWallet();
    expect(fallbackSigner).toBeTruthy();

    const wallet = createWallet();
    keystore.saveKeystore({
      password: 'secret',
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic,
      caHash: 'hash3',
      caAddress: 'ELF_ca3_AELF',
      originChainId: 'AELF',
      network: 'mainnet',
    });

    const signer = keystore.createSignerFromCaWallet();
    expect(signer).toBeTruthy();

    delete process.env.PORTKEY_PRIVATE_KEY;
    delete process.env.PORTKEY_CA_HASH;
    delete process.env.PORTKEY_CA_ADDRESS;
  });

  test('getWalletStatus tolerates malformed keystore file', () => {
    const malformedPath = keystore.getKeystorePath('testnet');
    fs.mkdirSync(path.dirname(malformedPath), { recursive: true });
    fs.writeFileSync(malformedPath, 'not-json');

    const status = keystore.getWalletStatus('testnet');
    expect(status.exists).toBe(true);
    expect(status.caAddress).toBeNull();
    expect(status.caHash).toBeNull();
  });
});
