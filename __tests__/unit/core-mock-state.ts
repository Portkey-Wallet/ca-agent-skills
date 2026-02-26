import { mock } from 'bun:test';

export class MockHttpError extends Error {
  statusCode: number;
  errorCode: string | null;
  responseBody: string;

  constructor(statusCode: number, message: string, body = '') {
    super(message);
    this.statusCode = statusCode;
    this.responseBody = body;
    try {
      const parsed = body ? JSON.parse(body) : null;
      this.errorCode = parsed?.code ?? null;
    } catch {
      this.errorCode = null;
    }
  }
}

type CoreMockState = {
  httpCalls: Array<{ method: string; path: string; options?: any }>;
  httpGetImpl: (path: string, options?: any) => Promise<any>;
  httpPostImpl: (path: string, options?: any) => Promise<any>;
  httpPutImpl: (path: string, options?: any) => Promise<any>;
  httpDelImpl: (path: string, options?: any) => Promise<any>;

  createWalletImpl: (...args: any[]) => any;
  getWalletByPrivateKeyImpl: (...args: any[]) => any;
  getAelfInstanceImpl: (...args: any[]) => any;
  getContractInstanceImpl: (...args: any[]) => Promise<any>;
  callViewMethodImpl: (...args: any[]) => Promise<any>;
  callSendMethodImpl: (...args: any[]) => Promise<any>;
  encodeManagerForwardCallParamsImpl: (...args: any[]) => Promise<any>;
  getTxResultImpl: (...args: any[]) => Promise<any>;
};

const defaultState = (): CoreMockState => ({
  httpCalls: [],
  httpGetImpl: async () => ({}),
  httpPostImpl: async () => ({}),
  httpPutImpl: async () => ({}),
  httpDelImpl: async () => ({}),

  createWalletImpl: () => ({
    address: 'ELF_mock_wallet',
    privateKey: 'a'.repeat(64),
    mnemonic: 'm1 m2 m3 m4 m5 m6 m7 m8 m9 m10 m11 m12',
  }),
  getWalletByPrivateKeyImpl: (privateKey: string) => ({ address: 'ELF_mock_wallet', privateKey }),
  getAelfInstanceImpl: () => ({}),
  getContractInstanceImpl: async () => ({}),
  callViewMethodImpl: async () => ({}),
  callSendMethodImpl: async () => ({ transactionId: 'tx-mock', data: { Status: 'MINED' } }),
  encodeManagerForwardCallParamsImpl: async () => ({ encodedInput: '0xmock' }),
  getTxResultImpl: async () => ({ Status: 'MINED' }),
});

const g = globalThis as any;
export const coreMockState: CoreMockState =
  g.__CA_CORE_MOCK_STATE || (g.__CA_CORE_MOCK_STATE = defaultState());

export function resetCoreMockState(): void {
  const d = defaultState();
  coreMockState.httpCalls = d.httpCalls;
  coreMockState.httpGetImpl = d.httpGetImpl;
  coreMockState.httpPostImpl = d.httpPostImpl;
  coreMockState.httpPutImpl = d.httpPutImpl;
  coreMockState.httpDelImpl = d.httpDelImpl;
  coreMockState.createWalletImpl = d.createWalletImpl;
  coreMockState.getWalletByPrivateKeyImpl = d.getWalletByPrivateKeyImpl;
  coreMockState.getAelfInstanceImpl = d.getAelfInstanceImpl;
  coreMockState.getContractInstanceImpl = d.getContractInstanceImpl;
  coreMockState.callViewMethodImpl = d.callViewMethodImpl;
  coreMockState.callSendMethodImpl = d.callSendMethodImpl;
  coreMockState.encodeManagerForwardCallParamsImpl = d.encodeManagerForwardCallParamsImpl;
  coreMockState.getTxResultImpl = d.getTxResultImpl;
}

export function installCoreModuleMocks(): void {
  if (g.__CA_CORE_MOCKS_INSTALLED) return;
  g.__CA_CORE_MOCKS_INSTALLED = true;

  mock.module('../../lib/http.js', () => ({
    createHttpClient: () => ({
      request: async (method: string, path: string, options?: any) => {
        coreMockState.httpCalls.push({ method, path, options });
        const m = method.toUpperCase();
        if (m === 'GET') return coreMockState.httpGetImpl(path, options);
        if (m === 'POST') return coreMockState.httpPostImpl(path, options);
        if (m === 'PUT') return coreMockState.httpPutImpl(path, options);
        if (m === 'DELETE') return coreMockState.httpDelImpl(path, options);
        return {};
      },
      get: async (path: string, options?: any) => {
        coreMockState.httpCalls.push({ method: 'GET', path, options });
        return coreMockState.httpGetImpl(path, options);
      },
      post: async (path: string, options?: any) => {
        coreMockState.httpCalls.push({ method: 'POST', path, options });
        return coreMockState.httpPostImpl(path, options);
      },
      put: async (path: string, options?: any) => {
        coreMockState.httpCalls.push({ method: 'PUT', path, options });
        return coreMockState.httpPutImpl(path, options);
      },
      del: async (path: string, options?: any) => {
        coreMockState.httpCalls.push({ method: 'DELETE', path, options });
        return coreMockState.httpDelImpl(path, options);
      },
    }),
    HttpError: MockHttpError,
    validateRpcUrl: () => {},
  }));

  mock.module('../../lib/aelf-client.js', () => ({
    createWallet: (...args: any[]) => coreMockState.createWalletImpl(...args),
    getWalletByPrivateKey: (...args: any[]) => coreMockState.getWalletByPrivateKeyImpl(...args),
    getAelfInstance: (...args: any[]) => coreMockState.getAelfInstanceImpl(...args),
    getContractInstance: (...args: any[]) => coreMockState.getContractInstanceImpl(...args),
    callViewMethod: (...args: any[]) => coreMockState.callViewMethodImpl(...args),
    callSendMethod: (...args: any[]) => coreMockState.callSendMethodImpl(...args),
    encodeManagerForwardCallParams: (...args: any[]) =>
      coreMockState.encodeManagerForwardCallParamsImpl(...args),
    getTxResult: (...args: any[]) => coreMockState.getTxResultImpl(...args),
    clearCaches: () => {},
  }));
}
