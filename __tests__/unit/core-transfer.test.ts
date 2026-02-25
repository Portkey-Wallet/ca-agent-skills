import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { coreMockState, installCoreModuleMocks, resetCoreMockState } from './core-mock-state';

installCoreModuleMocks();

let transfer: typeof import('../../src/core/transfer.js');
let account: typeof import('../../src/core/account.js');

beforeAll(async () => {
  account = await import('../../src/core/account.js');
  transfer = await import('../../src/core/transfer.js');
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
            caContractAddress: 'CA',
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

const wallet = { address: 'ELF_wallet', privateKey: 'pk' } as any;

describe('core/transfer', () => {
  test('sameChainTransfer validates params and returns tx info', async () => {
    await expect(
      transfer.sameChainTransfer(config, wallet, {
        caHash: '',
        tokenContractAddress: 'TOKEN',
        symbol: 'ELF',
        to: 'ELF_to',
        amount: '1',
        chainId: 'AELF',
      } as any),
    ).rejects.toThrow('caHash is required');

    coreMockState.callSendMethodImpl = async (
      _rpc: string,
      _caContract: string,
      _wallet: any,
      method: string,
    ) => {
      expect(method).toBe('ManagerForwardCall');
      return { transactionId: 'same-tx', data: { Status: 'MINED' } };
    };

    const result = await transfer.sameChainTransfer(config, wallet, {
      caHash: 'hash',
      tokenContractAddress: 'TOKEN',
      symbol: 'ELF',
      to: 'ELF_to',
      amount: '1',
      chainId: 'AELF',
      memo: 'memo',
    });

    expect(result).toEqual({ transactionId: 'same-tx', status: 'MINED' });
  });

  test('crossChainTransfer throws when step1 is not mined', async () => {
    coreMockState.callSendMethodImpl = async (
      _rpc: string,
      _caContract: string,
      _wallet: any,
      method: string,
    ) => {
      if (method === 'ManagerForwardCall') {
        return { transactionId: 'step1', data: { Status: 'FAILED', Error: 'insufficient' } };
      }
      return { transactionId: 'step2', data: { Status: 'MINED' } };
    };

    await expect(
      transfer.crossChainTransfer(config, wallet, {
        caHash: 'hash',
        tokenContractAddress: 'TOKEN',
        symbol: 'ELF',
        to: 'ELF_to',
        amount: '1',
        chainId: 'AELF',
        toChainId: 'tDVV',
      }),
    ).rejects.toThrow('Cross-chain step 1 failed');
  });

  test('crossChainTransfer throws recovery message when step2 fails', async () => {
    coreMockState.callSendMethodImpl = async (
      _rpc: string,
      _caContract: string,
      _wallet: any,
      method: string,
    ) => {
      if (method === 'ManagerForwardCall') {
        return { transactionId: 'step1-success', data: { Status: 'MINED' } };
      }
      throw new Error('rpc timeout');
    };

    await expect(
      transfer.crossChainTransfer(config, wallet, {
        caHash: 'hash',
        tokenContractAddress: 'TOKEN',
        symbol: 'ELF',
        to: 'ELF_to',
        amount: '100',
        chainId: 'AELF',
        toChainId: 'tDVV',
      }),
    ).rejects.toThrow('RECOVERY NEEDED');
  });

  test('crossChainTransfer succeeds', async () => {
    coreMockState.callSendMethodImpl = async (
      _rpc: string,
      _contract: string,
      _wallet: any,
      method: string,
    ) => {
      if (method === 'ManagerForwardCall') {
        return { transactionId: 'step1', data: { Status: 'MINED' } };
      }
      expect(method).toBe('CrossChainTransfer');
      return { transactionId: 'step2', data: { Status: 'MINED' } };
    };

    const result = await transfer.crossChainTransfer(config, wallet, {
      caHash: 'hash',
      tokenContractAddress: 'TOKEN',
      symbol: 'ELF',
      to: 'ELF_to',
      amount: '100',
      chainId: 'AELF',
      toChainId: 'tDVV',
      issueChainId: 9992731,
    });

    expect(result.transactionId).toBe('step2');
  });

  test('recoverStuckTransfer sends token back to CA', async () => {
    coreMockState.callSendMethodImpl = async (_rpc: string, _contract: string, _wallet: any, method: string, payload: any) => {
      expect(method).toBe('Transfer');
      expect(payload.to).toBe('ELF_ca_AELF');
      return { transactionId: 'recover-tx', data: { Status: 'MINED' } };
    };

    const result = await transfer.recoverStuckTransfer(config, wallet, {
      tokenContractAddress: 'TOKEN',
      symbol: 'ELF',
      amount: '100',
      caAddress: 'ELF_ca_AELF',
      chainId: 'AELF',
    });

    expect(result).toEqual({ transactionId: 'recover-tx', status: 'MINED' });
  });

  test('getTransactionResult validates params and queries tx result', async () => {
    await expect(
      transfer.getTransactionResult(config, { txId: '', chainId: 'AELF' } as any),
    ).rejects.toThrow('txId is required');

    coreMockState.getTxResultImpl = async (_rpc: string, txId: string) => {
      expect(txId).toBe('abc123');
      return { Status: 'MINED', TransactionId: txId };
    };

    const result = await transfer.getTransactionResult(config, {
      txId: 'abc123',
      chainId: 'AELF',
    });

    expect((result as any).Status).toBe('MINED');
  });
});
