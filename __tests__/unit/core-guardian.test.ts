import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { coreMockState, installCoreModuleMocks, resetCoreMockState } from './core-mock-state';

installCoreModuleMocks();

let guardian: typeof import('../../src/core/guardian.js');
let account: typeof import('../../src/core/account.js');

beforeAll(async () => {
  account = await import('../../src/core/account.js');
  guardian = await import('../../src/core/guardian.js');
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

describe('core/guardian', () => {
  test('addGuardian validates params', async () => {
    await expect(
      guardian.addGuardian(config, wallet, {
        caHash: '',
        chainId: 'AELF',
        guardianToAdd: {
          identifierHash: 'idhash',
          type: 0,
          verificationInfo: {
            id: 'v1',
            signature: 'abcd',
            verificationDoc: 'doc',
          },
        },
        guardiansApproved: [
          {
            type: 0,
            identifierHash: 'approved',
            verifierId: 'v2',
            signature: 'abcd',
            verificationDoc: 'doc2',
          },
        ],
      } as any),
    ).rejects.toThrow('caHash is required');
  });

  test('addGuardian success', async () => {
    coreMockState.callSendMethodImpl = async (_rpc: string, _caContract: string, _wallet: any, method: string) => {
      expect(method).toBe('AddGuardian');
      return { transactionId: 'add-tx', data: { Status: 'MINED' } };
    };

    const result = await guardian.addGuardian(config, wallet, {
      caHash: 'hash',
      chainId: 'AELF',
      guardianToAdd: {
        identifierHash: 'idhash',
        type: 0,
        verificationInfo: {
          id: 'v1',
          signature: 'abcd',
          verificationDoc: 'doc',
        },
      },
      guardiansApproved: [
        {
          type: 0,
          identifierHash: 'approved',
          verifierId: 'v2',
          signature: 'abcd',
          verificationDoc: 'doc2',
        },
      ],
    });

    expect(result).toEqual({ transactionId: 'add-tx', status: 'MINED' });
  });

  test('removeGuardian validates params and success', async () => {
    await expect(
      guardian.removeGuardian(config, wallet, {
        caHash: '',
        chainId: 'AELF',
        guardianToRemove: {
          identifierHash: 'idhash',
          type: 0,
          verificationInfo: { id: 'v1' },
        },
        guardiansApproved: [
          {
            type: 0,
            identifierHash: 'approved',
            verifierId: 'v2',
            signature: 'abcd',
            verificationDoc: 'doc2',
          },
        ],
      } as any),
    ).rejects.toThrow('caHash is required');

    coreMockState.callSendMethodImpl = async (_rpc: string, _caContract: string, _wallet: any, method: string) => {
      expect(method).toBe('RemoveGuardian');
      return { transactionId: 'remove-tx', data: { Status: 'MINED' } };
    };

    const result = await guardian.removeGuardian(config, wallet, {
      caHash: 'hash',
      chainId: 'AELF',
      guardianToRemove: {
        identifierHash: 'idhash',
        type: 0,
        verificationInfo: { id: 'v1' },
      },
      guardiansApproved: [
        {
          type: 0,
          identifierHash: 'approved',
          verifierId: 'v2',
          signature: 'abcd',
          verificationDoc: 'doc2',
        },
      ],
    });

    expect(result).toEqual({ transactionId: 'remove-tx', status: 'MINED' });
  });
});
