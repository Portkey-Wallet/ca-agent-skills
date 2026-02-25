import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  MockHttpError,
  coreMockState,
  installCoreModuleMocks,
  resetCoreMockState,
} from './core-mock-state';

installCoreModuleMocks();

let account: typeof import('../../src/core/account.js');

beforeAll(async () => {
  account = await import('../../src/core/account.js');
});

beforeEach(() => {
  resetCoreMockState();
  account.clearChainInfoCache();
});

describe('core/account', () => {
  test('checkAccount returns registered when originChainId exists', async () => {
    coreMockState.httpGetImpl = async () => ({ originChainId: 'AELF' });

    const result = await account.checkAccount(
      { apiUrl: 'https://api', graphqlUrl: 'https://gql', network: 'mainnet' },
      { email: 'a@b.com' },
    );

    expect(result).toEqual({ isRegistered: true, originChainId: 'AELF' });
    expect(coreMockState.httpCalls[0]?.path).toBe('/api/app/account/registerInfo');
  });

  test('checkAccount returns not registered on empty payload', async () => {
    coreMockState.httpGetImpl = async () => ({ originChainId: null });

    const result = await account.checkAccount(
      { apiUrl: 'https://api', graphqlUrl: 'https://gql', network: 'mainnet' },
      { email: 'a@b.com' },
    );

    expect(result).toEqual({ isRegistered: false, originChainId: null });
  });

  test('checkAccount handles HttpError 404/3002 as not registered', async () => {
    coreMockState.httpGetImpl = async () => {
      throw new MockHttpError(404, 'Not Found', JSON.stringify({ code: '3002' }));
    };

    const result = await account.checkAccount(
      { apiUrl: 'https://api', graphqlUrl: 'https://gql', network: 'mainnet' },
      { email: 'x@y.com' },
    );

    expect(result).toEqual({ isRegistered: false, originChainId: null });
  });

  test('checkAccount handles legacy message fallback', async () => {
    coreMockState.httpGetImpl = async () => {
      throw new Error('account not exist 3002');
    };

    const result = await account.checkAccount(
      { apiUrl: 'https://api', graphqlUrl: 'https://gql', network: 'mainnet' },
      { email: 'x@y.com' },
    );

    expect(result).toEqual({ isRegistered: false, originChainId: null });
  });

  test('checkAccount throws for unknown errors', async () => {
    coreMockState.httpGetImpl = async () => {
      throw new Error('boom');
    };

    await expect(
      account.checkAccount(
        { apiUrl: 'https://api', graphqlUrl: 'https://gql', network: 'mainnet' },
        { email: 'x@y.com' },
      ),
    ).rejects.toThrow('boom');
  });

  test('getGuardianList normalizes guardianList.guardians response', async () => {
    coreMockState.httpGetImpl = async () => ({
      guardianList: { guardians: [{ guardianIdentifier: 'a@b.com', type: 'Email' }] },
      caHash: 'hash',
      caAddress: 'ELF_abc_AELF',
      createChainId: 'AELF',
    });

    const result = await account.getGuardianList(
      { apiUrl: 'https://api', graphqlUrl: 'https://gql', network: 'mainnet' },
      { identifier: 'a@b.com' },
    );

    expect(result.guardians.length).toBe(1);
    expect(result.caHash).toBe('hash');
    expect(result.createChainId).toBe('AELF');
  });

  test('getGuardianList supports guardianAccounts legacy format', async () => {
    coreMockState.httpGetImpl = async () => ({
      guardianAccounts: [{ guardianIdentifier: 'legacy@b.com', type: 'Email' }],
    });

    const result = await account.getGuardianList(
      { apiUrl: 'https://api', graphqlUrl: 'https://gql', network: 'mainnet' },
      { identifier: 'legacy@b.com', chainId: 'AELF' },
    );

    expect(result.guardians[0]?.guardianIdentifier).toBe('legacy@b.com');
  });

  test('getChainInfo caches by apiUrl and clearChainInfoCache resets cache', async () => {
    let times = 0;
    coreMockState.httpGetImpl = async (path: string) => {
      if (path === '/api/app/search/chainsinfoindex') {
        times += 1;
        return {
          items: [
            {
              chainId: 'AELF',
              endPoint: 'https://rpc',
              caContractAddress: 'CA',
              defaultToken: { address: 'TOKEN', decimals: 8 },
            },
          ],
        };
      }
      return {};
    };

    const config = {
      apiUrl: 'https://api',
      graphqlUrl: 'https://gql',
      network: 'mainnet' as const,
    };

    await account.getChainInfo(config);
    await account.getChainInfo(config);
    expect(times).toBe(1);

    account.clearChainInfoCache();
    await account.getChainInfo(config);
    expect(times).toBe(2);
  });

  test('getChainInfoByChainId throws when not found', async () => {
    coreMockState.httpGetImpl = async () => ({
      items: [
        {
          chainId: 'AELF',
          endPoint: 'https://rpc',
          caContractAddress: 'CA',
          defaultToken: { address: 'TOKEN', decimals: 8 },
        },
      ],
    });

    await expect(
      account.getChainInfoByChainId(
        { apiUrl: 'https://api', graphqlUrl: 'https://gql', network: 'mainnet' },
        'tDVV',
      ),
    ).rejects.toThrow('not found');
  });

  test('getHolderInfo resolves chain and returns on-chain holder info', async () => {
    coreMockState.httpGetImpl = async () => ({
      items: [
        {
          chainId: 'AELF',
          endPoint: 'https://rpc.aelf',
          caContractAddress: 'CA_CONTRACT',
          defaultToken: { address: 'TOKEN', decimals: 8 },
        },
      ],
    });

    coreMockState.callViewMethodImpl = async (
      rpcUrl: string,
      contractAddress: string,
      method: string,
      payload: any,
    ) => {
      expect(rpcUrl).toBe('https://rpc.aelf');
      expect(contractAddress).toBe('CA_CONTRACT');
      expect(method).toBe('GetHolderInfo');
      expect(payload.caHash).toBe('CA_HASH');
      return { caHash: 'CA_HASH', caAddress: 'ELF_addr_AELF' };
    };

    const result = await account.getHolderInfo(
      { apiUrl: 'https://api', graphqlUrl: 'https://gql', network: 'mainnet' },
      { chainId: 'AELF', caHash: 'CA_HASH' },
    );

    expect(result.caHash).toBe('CA_HASH');
  });

  test('getHolderInfo throws when holder does not exist', async () => {
    coreMockState.httpGetImpl = async () => ({
      items: [
        {
          chainId: 'AELF',
          endPoint: 'https://rpc.aelf',
          caContractAddress: 'CA_CONTRACT',
          defaultToken: { address: 'TOKEN', decimals: 8 },
        },
      ],
    });
    coreMockState.callViewMethodImpl = async () => ({ caHash: '' });

    await expect(
      account.getHolderInfo(
        { apiUrl: 'https://api', graphqlUrl: 'https://gql', network: 'mainnet' },
        { chainId: 'AELF', caHash: 'MISSING_HASH' },
      ),
    ).rejects.toThrow('Holder not found');
  });
});
