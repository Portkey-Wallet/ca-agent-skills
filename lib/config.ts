import type { NetworkType, PortkeyConfig, NetworkDefaults } from './types.js';

// ---------------------------------------------------------------------------
// Network defaults
// ---------------------------------------------------------------------------

const NETWORK_DEFAULTS: Record<NetworkType, NetworkDefaults> = {
  mainnet: {
    apiUrl: 'https://aa-portkey.portkey.finance',
    graphqlUrl: 'https://indexer-api.aefinder.io/api/app/graphql/portkey',
  },
  testnet: {
    apiUrl: 'https://aa-portkey-test.portkey.finance',
    graphqlUrl: 'https://test-indexer-api.aefinder.io/api/app/graphql/portkey',
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
 *   4. Environment variables: PORTKEY_NETWORK, PORTKEY_API_URL, PORTKEY_GRAPHQL_URL
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
    graphqlUrl: override?.graphqlUrl || process.env.PORTKEY_GRAPHQL_URL || defaults.graphqlUrl,
  };
}

export { NETWORK_DEFAULTS };
