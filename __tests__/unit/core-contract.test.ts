import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { coreMockState, installCoreModuleMocks, resetCoreMockState } from './core-mock-state';

installCoreModuleMocks();

let contract: typeof import('../../src/core/contract.js');
let account: typeof import('../../src/core/account.js');

beforeAll(async () => {
  account = await import('../../src/core/account.js');
  contract = await import('../../src/core/contract.js');
});

beforeEach(() => {
  resetCoreMockState();
  account.clearChainInfoCache();
  coreMockState.httpGetImpl = async (path: string) => {
    if (path === '/api/app/search/chainsinfoindex') {
      return {
        items: [
          {
            chainId: 'AELF',
            endPoint: 'https://rpc',
            caContractAddress: 'CA_CONTRACT',
            defaultToken: { address: 'TOKEN', decimals: 8 },
          },
        ],
      };
    }
    return {};
  };
});

const config = {
  apiUrl: 'https://api',
  graphqlUrl: 'https://gql',
  network: 'mainnet' as const,
};

describe('core/contract', () => {
  test('callContractViewMethod validates required params', async () => {
    await expect(
      contract.callContractViewMethod(config, {
        rpcUrl: '',
        contractAddress: 'c',
        methodName: 'Get',
      } as any),
    ).rejects.toThrow('rpcUrl is required');

    await expect(
      contract.callContractViewMethod(config, {
        rpcUrl: 'https://rpc',
        contractAddress: '',
        methodName: 'Get',
      } as any),
    ).rejects.toThrow('contractAddress is required');

    await expect(
      contract.callContractViewMethod(config, {
        rpcUrl: 'https://rpc',
        contractAddress: 'c',
        methodName: '',
      } as any),
    ).rejects.toThrow('methodName is required');
  });

  test('callContractViewMethod delegates to aelf client', async () => {
    coreMockState.callViewMethodImpl = async (rpcUrl: string, address: string, method: string, payload: any) => {
      expect(rpcUrl).toBe('https://rpc');
      expect(address).toBe('TOKEN');
      expect(method).toBe('GetBalance');
      expect(payload.symbol).toBe('ELF');
      return { balance: '100' };
    };

    const result = await contract.callContractViewMethod(config, {
      rpcUrl: 'https://rpc',
      contractAddress: 'TOKEN',
      methodName: 'GetBalance',
      params: { symbol: 'ELF' },
    });

    expect((result as any).balance).toBe('100');
  });

  test('callCaViewMethod resolves chain info automatically', async () => {
    coreMockState.callViewMethodImpl = async (rpcUrl: string, address: string, method: string) => {
      expect(rpcUrl).toBe('https://rpc');
      expect(address).toBe('CA_CONTRACT');
      expect(method).toBe('GetHolderInfo');
      return { caHash: 'hash' };
    };

    const result = await contract.callCaViewMethod(config, 'AELF', 'GetHolderInfo', {
      caHash: 'hash',
    });

    expect((result as any).caHash).toBe('hash');
  });

  test('managerForwardCall encodes params then calls CA contract', async () => {
    const wallet = { address: 'ELF_wallet', privateKey: 'pk' } as any;

    coreMockState.encodeManagerForwardCallParamsImpl = async (rpcUrl: string, payload: any) => {
      expect(rpcUrl).toBe('https://rpc');
      expect(payload.methodName).toBe('Transfer');
      return { encodedInput: '0xencoded' };
    };

    coreMockState.callSendMethodImpl = async (
      rpcUrl: string,
      caContractAddress: string,
      _wallet: any,
      method: string,
      encoded: any,
    ) => {
      expect(rpcUrl).toBe('https://rpc');
      expect(caContractAddress).toBe('CA_CONTRACT');
      expect(method).toBe('ManagerForwardCall');
      expect(encoded.encodedInput).toBe('0xencoded');
      return { transactionId: 'tx-forward', data: { Status: 'MINED' } };
    };

    const result = await contract.managerForwardCall(config, wallet, {
      caHash: 'hash',
      contractAddress: 'TOKEN',
      methodName: 'Transfer',
      args: { to: 'ELF_to', symbol: 'ELF', amount: '1' },
      chainId: 'AELF',
    });

    expect(result.transactionId).toBe('tx-forward');
  });

  test('managerForwardCallWithKey builds wallet and forwards call', async () => {
    coreMockState.getWalletByPrivateKeyImpl = (privateKey: string) => {
      expect(privateKey).toBe('raw-pk');
      return { address: 'ELF_wallet_2', privateKey };
    };

    coreMockState.callSendMethodImpl = async () => ({
      transactionId: 'tx-key',
      data: { Status: 'MINED' },
    });

    const result = await contract.managerForwardCallWithKey(config, 'raw-pk', {
      caHash: 'hash',
      contractAddress: 'TOKEN',
      methodName: 'Transfer',
      args: { to: 'ELF_to', symbol: 'ELF', amount: '1' },
      chainId: 'AELF',
    });

    expect(result.transactionId).toBe('tx-key');
  });

  test('managerForwardCall throws for missing required params', async () => {
    const wallet = { address: 'ELF_wallet', privateKey: 'pk' } as any;

    await expect(
      contract.managerForwardCall(config, wallet, {
        caHash: '',
        contractAddress: 'TOKEN',
        methodName: 'Transfer',
        args: {},
        chainId: 'AELF',
      } as any),
    ).rejects.toThrow('caHash is required');
  });
});
