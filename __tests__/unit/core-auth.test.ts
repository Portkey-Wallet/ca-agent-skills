import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { coreMockState, installCoreModuleMocks, resetCoreMockState } from './core-mock-state';

installCoreModuleMocks();

let auth: typeof import('../../src/core/auth.js');

beforeAll(async () => {
  auth = await import('../../src/core/auth.js');
});

beforeEach(() => {
  resetCoreMockState();
});

const config = {
  apiUrl: 'https://api.portkey',
  graphqlUrl: 'https://gql.portkey',
  network: 'mainnet' as const,
};

describe('core/auth', () => {
  test('getVerifierServer returns verifier item', async () => {
    coreMockState.httpPostImpl = async () => ({ id: 'v1', name: 'Verifier-1' });

    const result = await auth.getVerifierServer(config, { chainId: 'AELF' });
    expect(result.id).toBe('v1');
    expect(coreMockState.httpCalls[0]?.path).toBe('/api/app/account/getVerifierServer');
  });

  test('getVerifierServer throws when verifier not returned', async () => {
    coreMockState.httpPostImpl = async () => ({ id: '' });
    await expect(auth.getVerifierServer(config)).rejects.toThrow('Failed to get verifier server');
  });

  test('sendVerificationCode validates required params', async () => {
    await expect(
      auth.sendVerificationCode(config, {
        email: '',
        verifierId: 'v1',
        chainId: 'AELF',
        operationType: 1,
      } as any),
    ).rejects.toThrow('email is required');
  });

  test('sendVerificationCode returns verifierSessionId', async () => {
    coreMockState.httpPostImpl = async () => ({ verifierSessionId: 'session-1' });

    const result = await auth.sendVerificationCode(config, {
      email: 'u@a.com',
      verifierId: 'v1',
      chainId: 'AELF',
      operationType: 1,
    });

    expect(result.verifierSessionId).toBe('session-1');
  });

  test('verifyCode requires signature + verificationDoc in response', async () => {
    coreMockState.httpPostImpl = async () => ({ signature: '', verificationDoc: '' });

    await expect(
      auth.verifyCode(config, {
        email: 'u@a.com',
        verificationCode: '123456',
        verifierId: 'v1',
        verifierSessionId: 's1',
        chainId: 'AELF',
        operationType: 1,
      }),
    ).rejects.toThrow('Verification failed');
  });

  test('verifyCode success', async () => {
    coreMockState.httpPostImpl = async () => ({ signature: 'sig', verificationDoc: 'doc' });

    const result = await auth.verifyCode(config, {
      email: 'u@a.com',
      verificationCode: '123456',
      verifierId: 'v1',
      verifierSessionId: 's1',
      chainId: 'AELF',
      operationType: 1,
    });

    expect(result.signature).toBe('sig');
    expect(result.verificationDoc).toBe('doc');
  });

  test('registerWallet validates params and success/failure branches', async () => {
    await expect(
      auth.registerWallet(config, {
        email: '',
        manager: 'mgr',
        verifierId: 'v1',
        verificationDoc: 'doc',
        signature: 'sig',
        chainId: 'AELF',
      } as any),
    ).rejects.toThrow('email is required');

    coreMockState.httpPostImpl = async () => ({ sessionId: '' });
    await expect(
      auth.registerWallet(config, {
        email: 'u@a.com',
        manager: 'mgr',
        verifierId: 'v1',
        verificationDoc: 'doc',
        signature: 'sig',
        chainId: 'AELF',
      }),
    ).rejects.toThrow('Registration request failed');

    coreMockState.httpPostImpl = async () => ({ sessionId: 'reg-1' });
    const ok = await auth.registerWallet(config, {
      email: 'u@a.com',
      manager: 'mgr',
      verifierId: 'v1',
      verificationDoc: 'doc',
      signature: 'sig',
      chainId: 'AELF',
    });
    expect(ok.sessionId).toBe('reg-1');
  });

  test('recoverWallet validates params and success/failure branches', async () => {
    await expect(
      auth.recoverWallet(config, {
        email: 'u@a.com',
        manager: 'mgr',
        guardiansApproved: [],
        chainId: 'AELF',
      } as any),
    ).rejects.toThrow('guardiansApproved is required');

    coreMockState.httpPostImpl = async () => ({ sessionId: '' });
    await expect(
      auth.recoverWallet(config, {
        email: 'u@a.com',
        manager: 'mgr',
        chainId: 'AELF',
        guardiansApproved: [
          {
            type: 0,
            identifier: 'u@a.com',
            verifierId: 'v1',
            verificationDoc: 'doc',
            signature: 'sig',
          },
        ],
      }),
    ).rejects.toThrow('Recovery request failed');

    coreMockState.httpPostImpl = async () => ({ sessionId: 'recover-1' });
    const ok = await auth.recoverWallet(config, {
      email: 'u@a.com',
      manager: 'mgr',
      chainId: 'AELF',
      guardiansApproved: [
        {
          type: 0,
          identifier: 'u@a.com',
          verifierId: 'v1',
          verificationDoc: 'doc',
          signature: 'sig',
        },
      ],
    });
    expect(ok.sessionId).toBe('recover-1');
  });

  test('checkRegisterOrRecoveryStatus handles pending/pass/fail', async () => {
    coreMockState.httpGetImpl = async () => ({ items: [] });
    const pending = await auth.checkRegisterOrRecoveryStatus(config, {
      sessionId: 's1',
      type: 'register',
    });
    expect(pending).toEqual({ status: 'pending' });

    coreMockState.httpGetImpl = async () => ({
      items: [{ registerStatus: 'pass', caAddress: 'ELF_addr_AELF', caHash: 'hash1' }],
    });
    const pass = await auth.checkRegisterOrRecoveryStatus(config, {
      sessionId: 's2',
      type: 'register',
    });
    expect(pass.status).toBe('pass');
    expect((pass as any).caHash).toBe('hash1');

    coreMockState.httpGetImpl = async () => ({
      items: [{ recoveryStatus: 'fail', recoveryMessage: 'bad code' }],
    });
    const fail = await auth.checkRegisterOrRecoveryStatus(config, {
      sessionId: 's3',
      type: 'recovery',
    });
    expect(fail).toEqual({ status: 'fail', failMessage: 'bad code' });

    coreMockState.httpGetImpl = async () => ({ items: [{ registerStatus: 'pending' }] });
    const pending2 = await auth.checkRegisterOrRecoveryStatus(config, {
      sessionId: 's4',
      type: 'register',
    });
    expect(pending2).toEqual({ status: 'pending' });
  });
});
