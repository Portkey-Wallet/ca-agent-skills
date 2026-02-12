import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getConfig, NETWORK_DEFAULTS } from '../../lib/config';

describe('lib/config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env
    process.env = { ...originalEnv };
  });

  it('should return mainnet config by default', () => {
    delete process.env.PORTKEY_NETWORK;
    delete process.env.PORTKEY_API_URL;

    const config = getConfig();
    expect(config.network).toBe('mainnet');
    expect(config.apiUrl).toBe(NETWORK_DEFAULTS.mainnet.apiUrl);
    expect(config.graphqlUrl).toBe(NETWORK_DEFAULTS.mainnet.graphqlUrl);
  });

  it('should return testnet config when network override is testnet', () => {
    const config = getConfig({ network: 'testnet' });
    expect(config.network).toBe('testnet');
    expect(config.apiUrl).toBe(NETWORK_DEFAULTS.testnet.apiUrl);
  });

  it('should respect PORTKEY_NETWORK env variable', () => {
    process.env.PORTKEY_NETWORK = 'testnet';
    const config = getConfig();
    expect(config.network).toBe('testnet');
    expect(config.apiUrl).toBe(NETWORK_DEFAULTS.testnet.apiUrl);
  });

  it('should prioritize function params over env variables', () => {
    process.env.PORTKEY_NETWORK = 'testnet';
    const config = getConfig({ network: 'mainnet' });
    expect(config.network).toBe('mainnet');
  });

  it('should allow apiUrl override via env', () => {
    process.env.PORTKEY_API_URL = 'https://custom-api.example.com';
    const config = getConfig();
    expect(config.apiUrl).toBe('https://custom-api.example.com');
  });

  it('should allow apiUrl override via params', () => {
    const config = getConfig({ apiUrl: 'https://param-api.example.com' });
    expect(config.apiUrl).toBe('https://param-api.example.com');
  });

  it('should throw on unknown network', () => {
    expect(() => getConfig({ network: 'unknown' as any })).toThrow('Unknown network');
  });

  it('should have correct mainnet defaults', () => {
    expect(NETWORK_DEFAULTS.mainnet.apiUrl).toBe('https://aa-portkey.portkey.finance');
    expect(NETWORK_DEFAULTS.testnet.apiUrl).toBe('https://aa-portkey-test.portkey.finance');
  });
});
