import { beforeAll, describe, expect, it } from 'bun:test';

let createWallet: typeof import('../../lib/aelf-client.js').createWallet;
let getWalletByPrivateKey: typeof import('../../lib/aelf-client.js').getWalletByPrivateKey;
let clearCaches: typeof import('../../lib/aelf-client.js').clearCaches;

beforeAll(async () => {
  // Load the real module instance even when other tests mock '../../lib/aelf-client.js'.
  const real = await import('../../lib/aelf-client.js?real');
  createWallet = real.createWallet;
  getWalletByPrivateKey = real.getWalletByPrivateKey;
  clearCaches = real.clearCaches;
});

describe('lib/aelf-client', () => {
  describe('createWallet', () => {
    it('should create a new wallet with address and privateKey', () => {
      const wallet = createWallet();
      expect(wallet.address).toBeDefined();
      expect(typeof wallet.address).toBe('string');
      expect(wallet.address.length).toBeGreaterThan(0);
      expect(wallet.privateKey).toBeDefined();
      expect(typeof wallet.privateKey).toBe('string');
      expect(wallet.privateKey.length).toBe(64); // hex string, 32 bytes
    });

    it('should create wallets with unique addresses', () => {
      const w1 = createWallet();
      const w2 = createWallet();
      expect(w1.address).not.toBe(w2.address);
      expect(w1.privateKey).not.toBe(w2.privateKey);
    });

    it('should include mnemonic', () => {
      const wallet = createWallet();
      expect(wallet.mnemonic).toBeDefined();
      expect(typeof wallet.mnemonic).toBe('string');
      // BIP39 mnemonic is 12 words
      const words = wallet.mnemonic!.split(' ');
      expect(words.length).toBe(12);
    });
  });

  describe('getWalletByPrivateKey', () => {
    it('should restore a wallet from private key', () => {
      const original = createWallet();
      const restored = getWalletByPrivateKey(original.privateKey);
      expect(restored.address).toBe(original.address);
      expect(restored.privateKey).toBe(original.privateKey);
    });

    it('should return a wallet even with short key (aelf-sdk pads it)', () => {
      // aelf-sdk does not throw on short keys — it zero-pads them
      const wallet = getWalletByPrivateKey('abc123');
      expect(wallet.address).toBeDefined();
    });
  });

  describe('clearCaches', () => {
    it('should not throw', () => {
      expect(() => clearCaches()).not.toThrow();
    });
  });
});
