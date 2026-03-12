import { getWalletByPrivateKey } from '../../lib/aelf-client.js';
import { getActiveWalletProfile } from '../../lib/wallet-context.js';
import {
  SIGNER_ERROR_CODES,
  formatSignerError,
} from '../../lib/signer-error-codes.js';
import { getUnlockedWallet, unlockWallet } from '../core/keystore.js';

// Wallet accessor: unlocked keystore > env var fallback > active context
export function requireWallet(): ReturnType<typeof getWalletByPrivateKey> {
  const unlocked = getUnlockedWallet();
  if (unlocked) return unlocked.wallet;

  const pk = process.env.PORTKEY_PRIVATE_KEY;
  if (pk) return getWalletByPrivateKey(pk);

  const active = getActiveWalletProfile();
  if (active?.walletType === 'CA' && active.source === 'ca-keystore') {
    const password = process.env.PORTKEY_CA_KEYSTORE_PASSWORD;
    if (!password) {
      throw new Error(
        formatSignerError(
          SIGNER_ERROR_CODES.PASSWORD_REQUIRED,
          'active CA context found. Set PORTKEY_CA_KEYSTORE_PASSWORD or run portkey_unlock first.',
        ),
      );
    }
    try {
      const network = active.network || 'mainnet';
      unlockWallet(password, network, active.loginEmail);
      const nowUnlocked = getUnlockedWallet();
      if (nowUnlocked) return nowUnlocked.wallet;
    } catch (error) {
      throw new Error(
        formatSignerError(
          SIGNER_ERROR_CODES.CONTEXT_INVALID,
          `failed to unlock active CA context (${error instanceof Error ? error.message : String(error)})`,
        ),
      );
    }
  }

  throw new Error(
    formatSignerError(
      SIGNER_ERROR_CODES.CONTEXT_NOT_FOUND,
      'wallet not available. Use portkey_unlock, or set PORTKEY_PRIVATE_KEY, or set active wallet + PORTKEY_CA_KEYSTORE_PASSWORD.',
    ),
  );
}
