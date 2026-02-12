import type {
  PortkeyConfig,
  TransferParams,
  CrossChainTransferParams,
  TransferResult,
  TransactionResultParams,
  TransactionResult,
} from '../../lib/types.js';
import {
  getWalletByPrivateKey,
  getTxResult,
  callSendMethod,
  type AElfWallet,
} from '../../lib/aelf-client.js';
import { getChainInfoByChainId } from './account.js';
import { managerForwardCall } from './contract.js';

// ============================================================================
// sameChainTransfer
// ============================================================================

/**
 * Transfer tokens on the same chain via ManagerForwardCall.
 *
 * Flow:
 *   Manager signs → CA contract.ManagerForwardCall → Token contract.Transfer
 *
 * The recipient sees the transfer coming from the CA address.
 */
export async function sameChainTransfer(
  config: PortkeyConfig,
  wallet: AElfWallet,
  params: TransferParams,
): Promise<TransferResult> {
  if (!params.caHash) throw new Error('caHash is required');
  if (!params.tokenContractAddress) throw new Error('tokenContractAddress is required');
  if (!params.symbol) throw new Error('symbol is required');
  if (!params.to) throw new Error('to address is required');
  if (!params.amount) throw new Error('amount is required');
  if (!params.chainId) throw new Error('chainId is required');

  const result = await managerForwardCall(config, wallet, {
    caHash: params.caHash,
    contractAddress: params.tokenContractAddress,
    methodName: 'Transfer',
    args: {
      symbol: params.symbol,
      to: params.to,
      amount: params.amount,
      memo: params.memo || '',
    },
    chainId: params.chainId,
  });

  return {
    transactionId: result.transactionId,
    status: result.data.Status,
  };
}

// ============================================================================
// crossChainTransfer
// ============================================================================

/**
 * Transfer tokens cross-chain. This is a two-step process:
 *
 * Step 1: Transfer tokens to the manager address itself (via ManagerForwardCall)
 * Step 2: Manager calls CrossChainTransfer on the token contract directly
 *
 * The cross-chain bridge handles moving the tokens to the target chain.
 */
export async function crossChainTransfer(
  config: PortkeyConfig,
  wallet: AElfWallet,
  params: CrossChainTransferParams,
): Promise<TransferResult> {
  if (!params.caHash) throw new Error('caHash is required');
  if (!params.tokenContractAddress) throw new Error('tokenContractAddress is required');
  if (!params.symbol) throw new Error('symbol is required');
  if (!params.to) throw new Error('to address is required');
  if (!params.amount) throw new Error('amount is required');
  if (!params.chainId) throw new Error('source chainId is required');
  if (!params.toChainId) throw new Error('toChainId is required');

  const chainInfo = await getChainInfoByChainId(config, params.chainId);

  // Step 1: Transfer tokens to manager address (so manager can call CrossChainTransfer)
  const step1Result = await managerForwardCall(config, wallet, {
    caHash: params.caHash,
    contractAddress: params.tokenContractAddress,
    methodName: 'Transfer',
    args: {
      symbol: params.symbol,
      to: wallet.address,
      amount: params.amount,
      memo: params.memo || '',
    },
    chainId: params.chainId,
  });

  if (step1Result.data.Status !== 'MINED') {
    throw new Error(
      `Cross-chain step 1 failed (transfer to manager): ${step1Result.data.Error || step1Result.data.Status}`,
    );
  }

  // Step 2: Call CrossChainTransfer on the token contract directly
  // (manager now has the tokens, so it can call the token contract directly)
  const crossChainResult = await callSendMethod(
    chainInfo.endPoint,
    params.tokenContractAddress,
    wallet,
    'CrossChainTransfer',
    {
      to: params.to,
      symbol: params.symbol,
      amount: params.amount,
      memo: params.memo || '',
      toChainId: chainIdToNum(params.toChainId),
      issueChainId: params.issueChainId || chainIdToNum(params.chainId),
    },
  );

  return {
    transactionId: crossChainResult.transactionId,
    status: crossChainResult.data.Status,
  };
}

// ============================================================================
// getTransactionResult
// ============================================================================

/**
 * Get the result of a transaction by its ID.
 */
export async function getTransactionResult(
  config: PortkeyConfig,
  params: TransactionResultParams,
): Promise<TransactionResult> {
  if (!params.txId) throw new Error('txId is required');
  if (!params.chainId) throw new Error('chainId is required');

  const chainInfo = await getChainInfoByChainId(config, params.chainId);
  return getTxResult(chainInfo.endPoint, params.txId);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert chain ID string to its numeric representation.
 * 'AELF' → 9992731, 'tDVV' → 1866392, 'tDVW' → 1931928
 * Uses base-58-like encoding that aelf uses internally.
 */
function chainIdToNum(chainId: string): number {
  let result = 0;
  for (let i = 0; i < chainId.length; i++) {
    result += chainId.charCodeAt(i) << (8 * i);
  }
  return result;
}
