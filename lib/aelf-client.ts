import AElf from 'aelf-sdk';
import type { WalletInfo, TransactionResult } from './types.js';

// ---------------------------------------------------------------------------
// Types (aelf-sdk does not ship clean TS types, see ./aelf-sdk.d.ts)
// ---------------------------------------------------------------------------

export interface AElfWallet {
  address: string;
  privateKey: string;
  mnemonic?: string;
  BIP44Path?: string;
  childWallet?: unknown;
  keyPair?: unknown;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AElfInstance = InstanceType<typeof AElf>;
export type AElfContract = Record<string, any>;

// ---------------------------------------------------------------------------
// Instance & contract caches
// ---------------------------------------------------------------------------

const aelfInstanceCache: Record<string, AElfInstance> = {};
const contractCache: Record<string, AElfContract> = {};

// ---------------------------------------------------------------------------
// Wallet helpers
// ---------------------------------------------------------------------------

/** Create a brand-new wallet (manager keypair). */
export function createWallet(): WalletInfo {
  const w = AElf.wallet.createNewWallet();
  return {
    address: w.address,
    privateKey: w.privateKey,
    mnemonic: w.mnemonic,
  };
}

/** Restore a wallet from a private key string. */
export function getWalletByPrivateKey(privateKey: string): AElfWallet {
  return AElf.wallet.getWalletByPrivateKey(privateKey) as AElfWallet;
}

// ---------------------------------------------------------------------------
// AElf instance
// ---------------------------------------------------------------------------

/** Get (or create) an AElf SDK instance for the given RPC URL. */
export function getAelfInstance(rpcUrl: string): AElfInstance {
  if (!aelfInstanceCache[rpcUrl]) {
    aelfInstanceCache[rpcUrl] = new AElf(new AElf.providers.HttpProvider(rpcUrl, 20_000));
  }
  return aelfInstanceCache[rpcUrl];
}

// ---------------------------------------------------------------------------
// Contract instance
// ---------------------------------------------------------------------------

/**
 * Get (or create) a contract instance.
 * - For view-only calls, `wallet` can be any wallet (a default one is fine).
 * - For send calls, `wallet` must be the manager wallet that owns the CA.
 */
export async function getContractInstance(
  rpcUrl: string,
  contractAddress: string,
  wallet: AElfWallet,
): Promise<AElfContract> {
  const key = `${rpcUrl}|${contractAddress}|${wallet.address}`;
  if (!contractCache[key]) {
    const instance = getAelfInstance(rpcUrl);
    contractCache[key] = await instance.chain.contractAt(contractAddress, wallet);
  }
  return contractCache[key];
}

// ---------------------------------------------------------------------------
// Contract call helpers
// ---------------------------------------------------------------------------

/** Call a read-only (view) method on a contract. */
export async function callViewMethod<T = unknown>(
  rpcUrl: string,
  contractAddress: string,
  methodName: string,
  params?: Record<string, unknown>,
): Promise<T> {
  // For view methods, use a deterministic default wallet (no signing needed)
  const defaultWallet = getWalletByPrivateKey(
    'e815acba8fcf085a0b4141060c13b8017a08da37f2eb1d6a5571f9f32e851f25',
  );
  const contract = await getContractInstance(rpcUrl, contractAddress, defaultWallet);

  const method = contract[methodName];
  if (!method || typeof method?.call !== 'function') {
    throw new Error(`Contract method "${methodName}" not found at ${contractAddress}`);
  }

  const result = await method.call(params ?? {});
  if (result && typeof result === 'object' && 'error' in result && result.error) {
    throw new Error(`View call ${methodName} failed: ${JSON.stringify(result.error)}`);
  }
  // aelf-sdk wraps result in { result } or returns directly
  return ((result && typeof result === 'object' && 'result' in result ? result.result : result) ?? result) as T;
}

/** Call a state-changing (send) method on a contract. Returns the TX result. */
export async function callSendMethod(
  rpcUrl: string,
  contractAddress: string,
  wallet: AElfWallet,
  methodName: string,
  params: Record<string, unknown>,
): Promise<{ transactionId: string; data: TransactionResult }> {
  const contract = await getContractInstance(rpcUrl, contractAddress, wallet);

  const method = contract[methodName];
  if (!method || typeof method !== 'function') {
    throw new Error(`Contract method "${methodName}" not found at ${contractAddress}`);
  }

  const sendResult = await method(params);
  const txId = sendResult?.result?.TransactionId || sendResult?.TransactionId;

  if (sendResult && typeof sendResult === 'object' && 'error' in sendResult && sendResult.error) {
    throw new Error(
      `Send call ${methodName} failed: ${JSON.stringify(sendResult.error)}`,
    );
  }

  if (!txId) {
    throw new Error(`Send call ${methodName} did not return a TransactionId`);
  }

  // Wait for TX to be mined, then fetch result
  await sleep(1000);
  const txResult = await getTxResult(rpcUrl, txId);
  return { transactionId: txId, data: txResult };
}

// ---------------------------------------------------------------------------
// ManagerForwardCall parameter encoding
// ---------------------------------------------------------------------------

/**
 * Encode parameters for ManagerForwardCall.
 *
 * ManagerForwardCall expects `args` as protobuf-encoded bytes of the target
 * method's input type. This function:
 * 1. Fetches the target contract's FileDescriptorSet
 * 2. Finds the target method's input protobuf type
 * 3. Encodes the args using that type
 *
 * Returns the full ManagerForwardCall params ready to be sent.
 */
export async function encodeManagerForwardCallParams(
  rpcUrl: string,
  params: {
    caHash: string;
    contractAddress: string;
    methodName: string;
    args: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const instance = getAelfInstance(rpcUrl);

  // Get target contract's protobuf descriptors
  const fds = await instance.chain.getContractFileDescriptorSet(params.contractAddress);
  const root = AElf.pbjs.Root.fromDescriptor(fds, 'proto3');

  // Find the method's input type across all services
  let inputType: unknown = null;
  const cleanMethodName = params.methodName.replace('.', '');

  for (const svc of root.nestedArray) {
    if ((svc as { methods?: Record<string, unknown> }).methods) {
      const service = svc as { methods: Record<string, { resolvedRequestType?: unknown }> };
      const method = service.methods[cleanMethodName];
      if (method?.resolvedRequestType) {
        inputType = method.resolvedRequestType;
        break;
      }
    }
    // Also check nested namespaces
    if ((svc as { nestedArray?: unknown[] }).nestedArray) {
      for (const nested of (svc as { nestedArray: { methods?: Record<string, { resolvedRequestType?: unknown }> }[] }).nestedArray) {
        if (nested.methods?.[cleanMethodName]?.resolvedRequestType) {
          inputType = nested.methods[cleanMethodName].resolvedRequestType;
          break;
        }
      }
    }
  }

  if (!inputType) {
    throw new Error(
      `Method "${params.methodName}" not found in contract ${params.contractAddress}`,
    );
  }

  // Encode args using protobuf
  const type = inputType as {
    fromObject: (obj: unknown) => unknown;
    encode: (msg: unknown) => { finish: () => Uint8Array };
  };

  let input = params.args;
  // Apply aelf-sdk transforms if available
  if (AElf.utils?.transform?.transformMapToArray) {
    input = AElf.utils.transform.transformMapToArray(inputType, input);
  }
  if (AElf.utils?.transform?.transform && AElf.utils?.transform?.INPUT_TRANSFORMERS) {
    input = AElf.utils.transform.transform(
      inputType,
      input,
      AElf.utils.transform.INPUT_TRANSFORMERS,
    );
  }

  const message = type.fromObject(input);
  const encodedArgs = type.encode(message).finish();

  return {
    caHash: params.caHash,
    contractAddress: params.contractAddress,
    methodName: params.methodName,
    args: encodedArgs,
  };
}

// ---------------------------------------------------------------------------
// Transaction result polling
// ---------------------------------------------------------------------------

const TX_RESULT_MAX_RETRIES = 20;
const TX_RESULT_RETRY_DELAY = 1500;

/** Poll for a transaction result until it is mined or fails. */
export async function getTxResult(
  rpcUrl: string,
  txId: string,
  maxRetries = TX_RESULT_MAX_RETRIES,
): Promise<TransactionResult> {
  const instance = getAelfInstance(rpcUrl);

  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await instance.chain.getTxResult(txId);
      if (result.Status === 'MINED' || result.Status === 'FAILED') {
        if (result.Status === 'FAILED') {
          throw new Error(`Transaction ${txId} FAILED: ${result.Error || 'Unknown error'}`);
        }
        return result as TransactionResult;
      }
    } catch (err: unknown) {
      // If the error is our own FAILED error, re-throw
      if (err instanceof Error && err.message.includes('FAILED')) throw err;
      // Otherwise it might be "not found yet", keep retrying
    }
    await sleep(TX_RESULT_RETRY_DELAY);
  }

  throw new Error(`Transaction ${txId} not confirmed after ${maxRetries} retries`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Clear all caches (useful for testing). */
export function clearCaches(): void {
  for (const key of Object.keys(aelfInstanceCache)) delete aelfInstanceCache[key];
  for (const key of Object.keys(contractCache)) delete contractCache[key];
}
