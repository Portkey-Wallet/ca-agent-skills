import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { coreMockState, installCoreModuleMocks, resetCoreMockState } from './core-mock-state';

installCoreModuleMocks();

const originalHome = process.env.HOME;
const originalContextPath = process.env.PORTKEY_SKILL_WALLET_CONTEXT_PATH;
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-auth-session-home-'));
process.env.HOME = testHome;
process.env.PORTKEY_SKILL_WALLET_CONTEXT_PATH = path.join(
  testHome,
  '.portkey',
  'skill-wallet',
  'context.v1.json',
);

let authSession: typeof import('../../src/core/auth-session.js');
let keystore: typeof import('../../src/core/keystore.js');

beforeAll(async () => {
  authSession = await import('../../src/core/auth-session.js');
  keystore = await import('../../src/core/keystore.js');
});

beforeEach(() => {
  resetCoreMockState();
  keystore.clearKeystoreState();
  const portkeyDir = path.join(testHome, '.portkey');
  if (fs.existsSync(portkeyDir)) {
    fs.rmSync(portkeyDir, { recursive: true, force: true });
  }

  coreMockState.httpPostImpl = async (path: string) => {
    if (path === '/api/app/account/recovery/request') {
      return { sessionId: 'recover-session-1' };
    }
    throw new Error(`Unexpected POST path ${path}`);
  };
  coreMockState.httpGetImpl = async (path: string) => {
    if (path === '/api/app/search/accountrecoverindex') {
      return {
        items: [
          {
            recoveryStatus: 'pass',
            caAddress: 'ELF_recovered_tDVV',
            caHash: 'recovered_hash',
          },
        ],
      };
    }
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
    throw new Error(`Unexpected GET path ${path}`);
  };
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

const config = {
  apiUrl: 'https://api.portkey',
  eoaApiUrl: 'https://eoa-api.portkey',
  graphqlUrl: 'https://gql.portkey',
  network: 'mainnet' as const,
  eoaFallbackEnabled: true,
  eoaFallbackRetryCount: 2,
  eoaFallbackRetryDelayMs: 200,
};

describe('core/auth-session', () => {
  test('recoverAndSaveWallet recovers, waits for pass, and persists a reusable keystore', async () => {
    const result = await authSession.recoverAndSaveWallet(config, {
      email: 'clawson@example.com',
      guardiansApproved: [
        {
          type: 0,
          identifier: 'clawson@example.com',
          verifierId: 'v-1',
          verificationDoc: '0,a,b,c,d,2,1866392',
          signature: 'sig',
        },
      ],
      chainId: 'AELF',
      password: 'secret',
      network: 'mainnet',
    });

    expect(result.status).toBe('pass');
    expect(result.sessionId).toBe('recover-session-1');
    expect(result.caAddress).toBe('ELF_recovered_tDVV');
    expect(result.caHash).toBe('recovered_hash');
    expect(fs.existsSync(result.keystorePath)).toBe(true);

    const status = keystore.getWalletStatus('mainnet', 'clawson@example.com');
    expect(status.exists).toBe(true);
    expect(status.unlocked).toBe(true);
    expect(status.caHash).toBe('recovered_hash');
  });

  test('recoverAndSaveWallet can optionally wait for target-chain readiness after saving', async () => {
    coreMockState.callViewMethodImpl = async (
      rpcUrl: string,
      contractAddress: string,
      method: string,
      payload: any,
    ) => {
      expect(payload.caHash).toBe('recovered_hash');
      if (rpcUrl === 'https://rpc-aelf' && contractAddress === 'CA_AELF' && method === 'GetHolderInfo') {
        return {
          caHash: 'recovered_hash',
          caAddress: 'ELF_recovered_AELF',
          managerInfos: [{ address: 'ELF_mock_wallet', extraData: '' }],
          guardianList: { guardians: [] },
        };
      }
      if (rpcUrl === 'https://rpc-tdvv' && contractAddress === 'CA_TDVV' && method === 'GetHolderInfo') {
        return {
          caHash: 'recovered_hash',
          caAddress: 'ELF_recovered_tDVV',
          managerInfos: [{ address: 'ELF_mock_wallet', extraData: '' }],
          guardianList: { guardians: [] },
        };
      }
      throw new Error(`Unexpected view call ${rpcUrl} ${contractAddress}.${method}`);
    };

    const result = await authSession.recoverAndSaveWallet(config, {
      email: 'clawson@example.com',
      guardiansApproved: [
        {
          type: 0,
          identifier: 'clawson@example.com',
          verifierId: 'v-1',
          verificationDoc: '0,a,b,c,d,2,1866392',
          signature: 'sig',
        },
      ],
      chainId: 'AELF',
      password: 'secret',
      network: 'mainnet',
      waitChainId: 'tDVV',
      waitMaxChecks: 2,
      waitDelayMs: 0,
    });

    expect(result.targetChainReady).toBe(true);
    expect(result.targetChainStatus?.state).toBe('ready');
    expect(result.targetChainStatus?.targetChainId).toBe('tDVV');
  });
});
