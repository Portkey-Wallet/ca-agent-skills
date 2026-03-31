import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { coreMockState, installCoreModuleMocks, resetCoreMockState } from './core-mock-state';

installCoreModuleMocks();

let managerSync: typeof import('../../src/core/manager-sync.js');
let account: typeof import('../../src/core/account.js');

beforeAll(async () => {
  account = await import('../../src/core/account.js');
  managerSync = await import('../../src/core/manager-sync.js');
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
            endPoint: 'https://rpc-aelf',
            caContractAddress: 'CA_AELF',
            defaultToken: { address: 'TOKEN_AELF', decimals: 8 },
          },
          {
            chainId: 'tDVV',
            endPoint: 'https://rpc-tdvv',
            caContractAddress: 'CA_TDVV',
            defaultToken: { address: 'TOKEN_TDVV', decimals: 8 },
          },
        ],
      };
    }
    return {};
  };
});

const config = {
  apiUrl: 'https://api',
  eoaApiUrl: 'https://eoa-api',
  graphqlUrl: 'https://gql',
  network: 'mainnet' as const,
  eoaFallbackEnabled: true,
  eoaFallbackRetryCount: 2,
  eoaFallbackRetryDelayMs: 200,
};

describe('core/manager-sync', () => {
  test('checkManagerSyncState returns ready when target holder exists and manager is present', async () => {
    coreMockState.callViewMethodImpl = async (
      rpcUrl: string,
      contractAddress: string,
      method: string,
      payload: any,
    ) => {
      expect(payload.caHash).toBe('hash');
      if (rpcUrl === 'https://rpc-aelf' && contractAddress === 'CA_AELF' && method === 'GetHolderInfo') {
        return {
          caHash: 'hash',
          caAddress: 'ELF_ca_AELF',
          managerInfos: [{ address: 'ELF_manager', extraData: '' }],
          guardianList: { guardians: [] },
        };
      }
      if (rpcUrl === 'https://rpc-tdvv' && contractAddress === 'CA_TDVV' && method === 'GetHolderInfo') {
        return {
          caHash: 'hash',
          caAddress: 'ELF_ca_tDVV',
          managerInfos: [{ address: 'ELF_manager', extraData: '' }],
          guardianList: { guardians: [] },
        };
      }
      throw new Error(`Unexpected view call ${rpcUrl} ${contractAddress}.${method}`);
    };

    const result = await managerSync.checkManagerSyncState(config, {
      caHash: 'hash',
      chainId: 'tDVV',
      originChainId: 'AELF',
      managerAddress: 'ELF_manager',
    });

    expect(result.state).toBe('ready');
    expect(result.isOriginHolderReady).toBe(true);
    expect(result.isTargetHolderReady).toBe(true);
    expect(result.isManagerSynced).toBe(true);
    expect(result.caAddress).toBe('ELF_ca_tDVV');
  });

  test('checkManagerSyncState returns manager_unsynced when target holder exists but manager is missing', async () => {
    coreMockState.callViewMethodImpl = async (
      rpcUrl: string,
      contractAddress: string,
      method: string,
    ) => {
      if (rpcUrl === 'https://rpc-aelf' && contractAddress === 'CA_AELF' && method === 'GetHolderInfo') {
        return {
          caHash: 'hash',
          caAddress: 'ELF_ca_AELF',
          managerInfos: [{ address: 'ELF_manager', extraData: '' }],
          guardianList: { guardians: [] },
        };
      }
      if (rpcUrl === 'https://rpc-tdvv' && contractAddress === 'CA_TDVV' && method === 'GetHolderInfo') {
        return {
          caHash: 'hash',
          caAddress: 'ELF_ca_tDVV',
          managerInfos: [{ address: 'ELF_other_manager', extraData: '' }],
          guardianList: { guardians: [] },
        };
      }
      throw new Error(`Unexpected view call ${rpcUrl} ${contractAddress}.${method}`);
    };

    const result = await managerSync.checkManagerSyncState(config, {
      caHash: 'hash',
      chainId: 'tDVV',
      originChainId: 'AELF',
      managerAddress: 'ELF_manager',
    });

    expect(result.state).toBe('manager_unsynced');
    expect(result.isOriginHolderReady).toBe(true);
    expect(result.isTargetHolderReady).toBe(true);
    expect(result.isManagerSynced).toBe(false);
    expect(managerSync.formatManagerSyncError(result)).toContain('Target-chain holder is ready on tDVV');
    expect(managerSync.formatManagerSyncError(result)).toContain('Current target-chain managers: ELF_other_manager');
  });

  test('checkManagerSyncState returns target_holder_syncing when origin holder exists but target holder is missing', async () => {
    coreMockState.callViewMethodImpl = async (
      rpcUrl: string,
      contractAddress: string,
      method: string,
    ) => {
      if (rpcUrl === 'https://rpc-tdvv' && contractAddress === 'CA_TDVV' && method === 'GetHolderInfo') {
        throw new Error('Holder not found for caHash: hash');
      }
      if (rpcUrl === 'https://rpc-aelf' && contractAddress === 'CA_AELF' && method === 'GetHolderInfo') {
        return {
          caHash: 'hash',
          caAddress: 'ELF_ca_AELF',
          managerInfos: [{ address: 'ELF_manager', extraData: '' }],
          guardianList: { guardians: [] },
        };
      }
      throw new Error(`Unexpected view call ${rpcUrl} ${contractAddress}.${method}`);
    };

    const result = await managerSync.checkManagerSyncState(config, {
      caHash: 'hash',
      chainId: 'tDVV',
      originChainId: 'AELF',
      managerAddress: 'ELF_manager',
    });

    expect(result.state).toBe('target_holder_syncing');
    expect(result.isOriginHolderReady).toBe(true);
    expect(result.isTargetHolderReady).toBe(false);
    expect(result.originCaAddress).toBe('ELF_ca_AELF');
    expect(managerSync.formatManagerSyncError(result)).toContain('Origin-chain holder is already ready on AELF');
  });

  test('checkManagerSyncState also treats tDVV -> AELF holder lag as target_holder_syncing', async () => {
    coreMockState.callViewMethodImpl = async (
      rpcUrl: string,
      contractAddress: string,
      method: string,
    ) => {
      if (rpcUrl === 'https://rpc-aelf' && contractAddress === 'CA_AELF' && method === 'GetHolderInfo') {
        throw new Error('Holder not found for caHash: hash');
      }
      if (rpcUrl === 'https://rpc-tdvv' && contractAddress === 'CA_TDVV' && method === 'GetHolderInfo') {
        return {
          caHash: 'hash',
          caAddress: 'ELF_ca_tDVV',
          managerInfos: [{ address: 'ELF_manager', extraData: '' }],
          guardianList: { guardians: [] },
        };
      }
      throw new Error(`Unexpected view call ${rpcUrl} ${contractAddress}.${method}`);
    };

    const result = await managerSync.checkManagerSyncState(config, {
      caHash: 'hash',
      chainId: 'AELF',
      originChainId: 'tDVV',
      managerAddress: 'ELF_manager',
    });

    expect(result.state).toBe('target_holder_syncing');
    expect(result.originChainId).toBe('tDVV');
    expect(result.targetChainId).toBe('AELF');
    expect(result.originCaAddress).toBe('ELF_ca_tDVV');
  });

  test('checkManagerSyncState returns origin_holder_missing when both origin and target holders are missing', async () => {
    coreMockState.callViewMethodImpl = async () => {
      throw new Error('Holder not found for caHash: hash');
    };

    const result = await managerSync.checkManagerSyncState(config, {
      caHash: 'hash',
      chainId: 'tDVV',
      originChainId: 'AELF',
      managerAddress: 'ELF_manager',
    });

    expect(result.state).toBe('origin_holder_missing');
    expect(result.isOriginHolderReady).toBe(false);
    expect(result.isTargetHolderReady).toBe(false);
    expect(managerSync.formatManagerSyncError(result)).toContain('It was also not found on origin chain AELF');
  });

  test('same-chain holder missing is not treated as cross-chain syncing', async () => {
    coreMockState.callViewMethodImpl = async () => {
      throw new Error('Holder not found for caHash: hash');
    };

    const result = await managerSync.checkManagerSyncState(config, {
      caHash: 'hash',
      chainId: 'tDVV',
      managerAddress: 'ELF_manager',
    });

    expect(result.state).toBe('origin_holder_missing');
    expect(result.reason).toContain('no originChainId was provided');
  });

  test('waitTargetChainReady polls through syncing states until ready', async () => {
    let targetChecks = 0;
    coreMockState.callViewMethodImpl = async (
      rpcUrl: string,
      contractAddress: string,
      method: string,
    ) => {
      if (rpcUrl === 'https://rpc-aelf' && contractAddress === 'CA_AELF' && method === 'GetHolderInfo') {
        return {
          caHash: 'hash',
          caAddress: 'ELF_ca_AELF',
          managerInfos: [{ address: 'ELF_manager', extraData: '' }],
          guardianList: { guardians: [] },
        };
      }
      if (rpcUrl === 'https://rpc-tdvv' && contractAddress === 'CA_TDVV' && method === 'GetHolderInfo') {
        targetChecks += 1;
        if (targetChecks === 1) {
          throw new Error('Holder not found for caHash: hash');
        }
        if (targetChecks === 2) {
          return {
            caHash: 'hash',
            caAddress: 'ELF_ca_tDVV',
            managerInfos: [{ address: 'ELF_other_manager', extraData: '' }],
            guardianList: { guardians: [] },
          };
        }
        return {
          caHash: 'hash',
          caAddress: 'ELF_ca_tDVV',
          managerInfos: [{ address: 'ELF_manager', extraData: '' }],
          guardianList: { guardians: [] },
        };
      }
      throw new Error(`Unexpected view call ${rpcUrl} ${contractAddress}.${method}`);
    };

    const result = await managerSync.waitTargetChainReady(config, {
      caHash: 'hash',
      originChainId: 'AELF',
      targetChainId: 'tDVV',
      managerAddress: 'ELF_manager',
      maxChecks: 4,
      delayMs: 0,
    });

    expect(result.ready).toBe(true);
    expect(result.state).toBe('ready');
    expect(result.attempts).toBe(3);
  });

  test('waitTargetChainReady stops immediately when origin holder is also missing', async () => {
    coreMockState.callViewMethodImpl = async () => {
      throw new Error('Holder not found for caHash: hash');
    };

    const result = await managerSync.waitTargetChainReady(config, {
      caHash: 'hash',
      originChainId: 'AELF',
      targetChainId: 'tDVV',
      managerAddress: 'ELF_manager',
      maxChecks: 5,
      delayMs: 0,
    });

    expect(result.ready).toBe(false);
    expect(result.state).toBe('origin_holder_missing');
    expect(result.attempts).toBe(1);
  });

  test('waitTargetChainReady validates maxChecks and delayMs', async () => {
    await expect(
      managerSync.waitTargetChainReady(config, {
        caHash: 'hash',
        originChainId: 'AELF',
        targetChainId: 'tDVV',
        managerAddress: 'ELF_manager',
        maxChecks: 0,
        delayMs: 0,
      }),
    ).rejects.toThrow('maxChecks must be a positive integer');

    await expect(
      managerSync.waitTargetChainReady(config, {
        caHash: 'hash',
        originChainId: 'AELF',
        targetChainId: 'tDVV',
        managerAddress: 'ELF_manager',
        maxChecks: 1,
        delayMs: -1,
      }),
    ).rejects.toThrow('delayMs must be a non-negative integer');
  });
});
