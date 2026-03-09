import type { NetworkType, PortkeyConfig, NetworkDefaults } from './types.js';

// ---------------------------------------------------------------------------
// Network defaults
// ---------------------------------------------------------------------------

const NETWORK_DEFAULTS: Record<NetworkType, NetworkDefaults> = {
  mainnet: {
    apiUrl: 'https://aa-portkey.portkey.finance',
    eoaApiUrl: 'https://eoa-portkey.portkey.finance',
    graphqlUrl: 'https://indexer-api.aefinder.io/api/app/graphql/portkey',
    eoaFallbackEnabled: true,
    eoaFallbackRetryCount: 2,
    eoaFallbackRetryDelayMs: 200,
  },
  testnet: {
    apiUrl: 'https://aa-portkey-test.portkey.finance',
    eoaApiUrl: 'https://eoa-portkey-test.portkey.finance',
    graphqlUrl: 'https://test-indexer-api.aefinder.io/api/app/graphql/portkey',
    eoaFallbackEnabled: true,
    eoaFallbackRetryCount: 2,
    eoaFallbackRetryDelayMs: 200,
  },
};

// ---------------------------------------------------------------------------
// Config builder
// ---------------------------------------------------------------------------

/**
 * Build a PortkeyConfig with the following priority (high -> low):
 *   1. Function parameter `override`
 *   2. CLI arguments (handled by the caller)
 *   3. MCP env block (handled by the caller)
 *   4. Environment variables:
 *      PORTKEY_NETWORK, PORTKEY_API_URL, PORTKEY_EOA_API_URL, PORTKEY_GRAPHQL_URL,
 *      PORTKEY_EOA_FALLBACK_ENABLED, PORTKEY_EOA_FALLBACK_RETRY_COUNT, PORTKEY_EOA_FALLBACK_RETRY_DELAY_MS
 *   5. Code defaults (mainnet)
 */
export function getConfig(override?: Partial<PortkeyConfig> & { network?: NetworkType }): PortkeyConfig {
  const network: NetworkType =
    override?.network || (process.env.PORTKEY_NETWORK as NetworkType) || 'mainnet';

  const defaults = NETWORK_DEFAULTS[network];
  if (!defaults) {
    throw new Error(`Unknown network: ${network}. Expected "mainnet" or "testnet".`);
  }

  return {
    network,
    apiUrl: override?.apiUrl || process.env.PORTKEY_API_URL || defaults.apiUrl,
    eoaApiUrl: override?.eoaApiUrl || process.env.PORTKEY_EOA_API_URL || defaults.eoaApiUrl,
    graphqlUrl: override?.graphqlUrl || process.env.PORTKEY_GRAPHQL_URL || defaults.graphqlUrl,
    eoaFallbackEnabled: parseBooleanEnv(
      override?.eoaFallbackEnabled,
      process.env.PORTKEY_EOA_FALLBACK_ENABLED,
      defaults.eoaFallbackEnabled,
    ),
    eoaFallbackRetryCount: parsePositiveIntEnv(
      override?.eoaFallbackRetryCount,
      process.env.PORTKEY_EOA_FALLBACK_RETRY_COUNT,
      defaults.eoaFallbackRetryCount,
      'PORTKEY_EOA_FALLBACK_RETRY_COUNT',
    ),
    eoaFallbackRetryDelayMs: parsePositiveIntEnv(
      override?.eoaFallbackRetryDelayMs,
      process.env.PORTKEY_EOA_FALLBACK_RETRY_DELAY_MS,
      defaults.eoaFallbackRetryDelayMs,
      'PORTKEY_EOA_FALLBACK_RETRY_DELAY_MS',
    ),
  };
}

export { NETWORK_DEFAULTS };

function parseBooleanEnv(
  overrideValue: boolean | undefined,
  envValue: string | undefined,
  defaultValue: boolean,
): boolean {
  if (typeof overrideValue === 'boolean') return overrideValue;
  if (envValue === undefined) return defaultValue;
  const normalized = envValue.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`Invalid boolean value "${envValue}" for EOA fallback flag`);
}

function parsePositiveIntEnv(
  overrideValue: number | undefined,
  envValue: string | undefined,
  defaultValue: number,
  envName: string,
): number {
  if (overrideValue !== undefined) {
    if (Number.isInteger(overrideValue) && overrideValue >= 1) return overrideValue;
    throw new Error(`${envName} must be an integer >= 1`);
  }

  if (envValue === undefined) return defaultValue;
  const parsed = Number(envValue);
  if (Number.isInteger(parsed) && parsed >= 1) return parsed;
  throw new Error(`${envName} must be an integer >= 1, got "${envValue}"`);
}
