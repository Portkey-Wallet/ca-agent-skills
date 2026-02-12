declare module 'aelf-sdk' {
  interface HttpProvider {
    new (host: string, timeout?: number): HttpProvider;
  }

  interface WalletModule {
    createNewWallet(): {
      address: string;
      privateKey: string;
      mnemonic: string;
      BIP44Path: string;
      childWallet: unknown;
      keyPair: unknown;
    };
    getWalletByPrivateKey(privateKey: string): {
      address: string;
      privateKey: string;
      keyPair: unknown;
    };
  }

  interface ChainModule {
    contractAt(
      contractAddress: string,
      wallet: { address: string; privateKey?: string },
    ): Promise<Record<string, any>>;
    getTxResult(txId: string): Promise<Record<string, any>>;
    getContractFileDescriptorSet(address: string): Promise<any>;
  }

  interface PbjsModule {
    Root: {
      fromDescriptor(descriptor: any, syntax?: string): any;
    };
  }

  interface UtilsModule {
    transform?: {
      transformMapToArray(type: any, params: any): any;
      transform(type: any, params: any, transformers: any): any;
      INPUT_TRANSFORMERS: any;
    };
  }

  class AElf {
    constructor(provider: HttpProvider);
    chain: ChainModule;
    currentProvider: { host: string };
    static providers: { HttpProvider: new (host: string, timeout?: number) => HttpProvider };
    static wallet: WalletModule;
    static pbjs: PbjsModule;
    static utils: UtilsModule;
  }

  export default AElf;
}
