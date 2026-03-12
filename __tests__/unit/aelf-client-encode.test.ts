import { beforeAll, describe, expect, it, mock } from 'bun:test';

type MockResolvedType = {
  fromObject: (obj: unknown) => unknown;
  encode: (msg: unknown) => { finish: () => Uint8Array };
};

const resolvedType: MockResolvedType = {
  fromObject: (obj: unknown) => obj,
  encode: () => ({ finish: () => new Uint8Array([1, 2, 3]) }),
};

const methodRecord: { requestType: string; resolvedRequestType?: MockResolvedType } = {
  requestType: '.aelf.Hash',
};

const root = {
  nestedArray: [
    {
      name: 'RewardClaimContract',
      methods: {
        ClaimByPortkeyToCa: methodRecord,
      },
    },
  ],
  resolveAll() {
    methodRecord.resolvedRequestType = resolvedType;
    return this;
  },
};

class MockAElf {
  chain = {
    getContractFileDescriptorSet: async () => ({ mocked: true }),
  };

  currentProvider = { host: 'https://rpc.example' };

  static providers = {
    HttpProvider: class {
      constructor(_host: string, _timeout?: number) {}
    },
  };

  static wallet = {
    createNewWallet: () => ({
      address: 'ELF_mock_wallet',
      privateKey: 'a'.repeat(64),
      mnemonic: 'm1 m2 m3 m4 m5 m6 m7 m8 m9 m10 m11 m12',
    }),
    getWalletByPrivateKey: (privateKey: string) => ({
      address: 'ELF_mock_wallet',
      privateKey,
    }),
  };

  static pbjs = {
    Root: {
      fromDescriptor: () => root,
    },
  };

  static utils = {};

  constructor(_provider: unknown) {}
}

let encodeManagerForwardCallParams: typeof import('../../lib/aelf-client.js').encodeManagerForwardCallParams;

beforeAll(async () => {
  mock.module('aelf-sdk', () => ({
    default: MockAElf,
  }));

  const realModulePath = '../../lib/aelf-client.js?encode-manager-forward-call';
  ({ encodeManagerForwardCallParams } = await import(realModulePath));
});

describe('lib/aelf-client encodeManagerForwardCallParams', () => {
  it('resolves descriptor methods before reading resolvedRequestType', async () => {
    const result = await encodeManagerForwardCallParams('https://rpc.example', {
      caHash: 'hash',
      contractAddress: 'reward',
      methodName: 'ClaimByPortkeyToCa',
      args: { value: Buffer.from('11'.repeat(32), 'hex') },
    });

    expect(methodRecord.resolvedRequestType).toBe(resolvedType);
    expect(result.args).toEqual(new Uint8Array([1, 2, 3]));
  });
});
