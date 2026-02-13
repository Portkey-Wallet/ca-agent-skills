import type {
  PortkeyConfig,
  ChainId,
  TokenBalanceParams,
  TokenBalanceResult,
  TokenListParams,
  TokenListResult,
  NftCollectionParams,
  NftCollectionResult,
  NftItemParams,
  NftItemResult,
  TokenPriceParams,
  TokenPriceItem,
} from '../../lib/types.js';
import { createHttpClient } from '../../lib/http.js';
import { callViewMethod } from '../../lib/aelf-client.js';
import { getChainInfoByChainId } from './account.js';

// ============================================================================
// getTokenBalance
// ============================================================================

/**
 * Get the balance of a specific token for a CA address on a specific chain.
 *
 * Uses on-chain view call: GetBalance({ symbol, owner })
 */
export async function getTokenBalance(
  config: PortkeyConfig,
  params: TokenBalanceParams,
): Promise<TokenBalanceResult> {
  if (!params.caAddress) throw new Error('caAddress is required');
  if (!params.chainId) throw new Error('chainId is required');
  if (!params.symbol) throw new Error('symbol is required');

  const chainInfo = await getChainInfoByChainId(config, params.chainId);

  // On aelf, ALL fungible tokens (ELF, USDT, etc.) live in the same MultiToken
  // contract. chainInfo.defaultToken.address IS the MultiToken contract address,
  // so this works for any symbol — not just the default token.
  const tokenContractAddress = chainInfo.defaultToken.address;

  const [result, tokenInfo] = await Promise.all([
    callViewMethod<{ symbol: string; owner: string; balance: string }>(
      chainInfo.endPoint,
      tokenContractAddress,
      'GetBalance',
      { symbol: params.symbol, owner: params.caAddress },
    ),
    // Fetch actual token info to get correct decimals (ELF=8, USDT=6, etc.)
    callViewMethod<{ symbol: string; decimals: number }>(
      chainInfo.endPoint,
      tokenContractAddress,
      'GetTokenInfo',
      { symbol: params.symbol },
    ).catch(() => null), // fallback to defaultToken.decimals if GetTokenInfo fails
  ]);

  return {
    symbol: result.symbol || params.symbol,
    balance: result.balance || '0',
    decimals: tokenInfo?.decimals ?? chainInfo.defaultToken.decimals,
    tokenContractAddress,
  };
}

// ============================================================================
// getTokenList
// ============================================================================

/**
 * Get all tokens with balances for the given CA addresses across chains.
 *
 * API: POST /api/app/user/assets/token
 */
export async function getTokenList(
  config: PortkeyConfig,
  params: TokenListParams,
): Promise<TokenListResult> {
  if (!params.caAddressInfos?.length) throw new Error('caAddressInfos is required');

  const http = createHttpClient(config);

  const result = await http.post<TokenListResult>('/api/app/user/assets/token', {
    data: {
      caAddressInfos: params.caAddressInfos,
      skipCount: params.skipCount || 0,
      maxResultCount: params.maxResultCount || 100,
    },
  });

  return result;
}

// ============================================================================
// getNftCollections
// ============================================================================

/**
 * Get NFT collections for the given CA addresses.
 *
 * API: POST /api/app/user/assets/nftCollections
 */
export async function getNftCollections(
  config: PortkeyConfig,
  params: NftCollectionParams,
): Promise<NftCollectionResult> {
  if (!params.caAddressInfos?.length) throw new Error('caAddressInfos is required');

  const http = createHttpClient(config);

  const result = await http.post<NftCollectionResult>('/api/app/user/assets/nftCollections', {
    data: {
      caAddressInfos: params.caAddressInfos,
      skipCount: params.skipCount || 0,
      maxResultCount: params.maxResultCount || 100,
    },
  });

  return result;
}

// ============================================================================
// getNftItems
// ============================================================================

/**
 * Get NFT items within a collection.
 *
 * API: POST /api/app/user/assets/nftItems
 */
export async function getNftItems(
  config: PortkeyConfig,
  params: NftItemParams,
): Promise<NftItemResult> {
  if (!params.caAddressInfos?.length) throw new Error('caAddressInfos is required');
  if (!params.symbol) throw new Error('symbol is required');

  const http = createHttpClient(config);

  const result = await http.post<NftItemResult>('/api/app/user/assets/nftItems', {
    data: {
      caAddressInfos: params.caAddressInfos,
      symbol: params.symbol,
      skipCount: params.skipCount || 0,
      maxResultCount: params.maxResultCount || 100,
    },
  });

  return result;
}

// ============================================================================
// getTokenPrice
// ============================================================================

/**
 * Get token prices in USD.
 *
 * API: GET /api/app/tokens/prices
 */
export async function getTokenPrice(
  config: PortkeyConfig,
  params: TokenPriceParams,
): Promise<TokenPriceItem[]> {
  if (!params.symbols?.length) throw new Error('symbols is required');

  const http = createHttpClient(config);

  const result = await http.get<{ items: TokenPriceItem[] }>('/api/app/tokens/prices', {
    params: { symbols: params.symbols.join(',') },
  });

  return result.items || [];
}
