import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { coreMockState, installCoreModuleMocks, resetCoreMockState } from './core-mock-state';

installCoreModuleMocks();

let assets: typeof import('../../src/core/assets.js');
let account: typeof import('../../src/core/account.js');

beforeAll(async () => {
  account = await import('../../src/core/account.js');
  assets = await import('../../src/core/assets.js');
});

beforeEach(() => {
  resetCoreMockState();
  account.clearChainInfoCache();
});

const config = {
  apiUrl: 'https://api',
  graphqlUrl: 'https://gql',
  network: 'mainnet' as const,
};

describe('core/assets', () => {
  test('getTokenBalance validates required params', async () => {
    await expect(
      assets.getTokenBalance(config, {
        caAddress: '',
        chainId: 'AELF',
        symbol: 'ELF',
      } as any),
    ).rejects.toThrow('caAddress is required');
  });

  test('getTokenBalance returns decimals from GetTokenInfo and fallback to default decimals', async () => {
    coreMockState.httpGetImpl = async (path: string) => {
      if (path === '/api/app/search/chainsinfoindex') {
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

    let tokenInfoFailed = false;
    coreMockState.callViewMethodImpl = async (_rpcUrl: string, _contract: string, method: string) => {
      if (method === 'GetBalance') return { symbol: 'ELF', balance: '1000' };
      if (method === 'GetTokenInfo') {
        if (tokenInfoFailed) throw new Error('token info unavailable');
        return { symbol: 'ELF', decimals: 6 };
      }
      return {};
    };

    const withTokenInfo = await assets.getTokenBalance(config, {
      caAddress: 'ELF_addr_AELF',
      chainId: 'AELF',
      symbol: 'ELF',
    });
    expect(withTokenInfo.decimals).toBe(6);

    tokenInfoFailed = true;
    const fallback = await assets.getTokenBalance(config, {
      caAddress: 'ELF_addr_AELF',
      chainId: 'AELF',
      symbol: 'USDT',
    });
    expect(fallback.decimals).toBe(8);
    expect(fallback.balance).toBe('1000');
  });

  test('getTokenList maps request payload', async () => {
    coreMockState.httpPostImpl = async () => ({ data: [{ symbol: 'ELF' }] });

    const result = await assets.getTokenList(config, {
      caAddressInfos: [{ chainId: 'AELF', caAddress: 'ELF_addr_AELF' }],
      skipCount: 1,
      maxResultCount: 2,
    });

    expect(result.data.length).toBe(1);
    expect(coreMockState.httpCalls[0]?.path).toBe('/api/app/user/assets/token');
  });

  test('getNftCollections and getNftItems validate params and return data', async () => {
    await expect(
      assets.getNftCollections(config, { caAddressInfos: [] as any[] }),
    ).rejects.toThrow('caAddressInfos is required');

    coreMockState.httpPostImpl = async () => ({ data: [{ symbol: 'COLL' }] });
    const coll = await assets.getNftCollections(config, {
      caAddressInfos: [{ chainId: 'AELF', caAddress: 'ELF_addr_AELF' }],
    });
    expect(coll.data.length).toBe(1);

    await expect(
      assets.getNftItems(config, {
        caAddressInfos: [{ chainId: 'AELF', caAddress: 'ELF_addr_AELF' }],
        symbol: '',
      } as any),
    ).rejects.toThrow('symbol is required');

    coreMockState.httpPostImpl = async () => ({ data: [{ tokenId: '1' }] });
    const items = await assets.getNftItems(config, {
      caAddressInfos: [{ chainId: 'AELF', caAddress: 'ELF_addr_AELF' }],
      symbol: 'COLL',
    });
    expect(items.data[0]?.tokenId).toBe('1');
  });

  test('getTokenPrice validates symbols and returns items or empty array', async () => {
    await expect(
      assets.getTokenPrice(config, { symbols: [] }),
    ).rejects.toThrow('symbols is required');

    coreMockState.httpGetImpl = async () => ({ items: [{ symbol: 'ELF', usd: 1 }] });
    const prices = await assets.getTokenPrice(config, { symbols: ['ELF'] });
    expect(prices.length).toBe(1);

    coreMockState.httpGetImpl = async () => ({ items: undefined });
    const empty = await assets.getTokenPrice(config, { symbols: ['USDT'] });
    expect(empty).toEqual([]);
  });
});
