// ============================================================================
// @portkey-wallet/ca-agent-skills — SDK Entry
//
// Pure re-exports. Zero logic.
// ============================================================================

// --- Config ---
export { getConfig, NETWORK_DEFAULTS } from './lib/config.js';

// --- Types ---
export type {
  NetworkType,
  PortkeyConfig,
  ChainId,
  ChainInfo,
  DefaultToken,
  LoginType,
  GuardianItem,
  VerifierItem,
  OperationType,
  WalletInfo,
  HolderInfo,
  ManagerInfo,
  // Verification
  SendVerificationCodeParams,
  SendVerificationCodeResult,
  VerifyCodeParams,
  VerifyCodeResult,
  // Registration & Recovery
  RegisterParams,
  RecoverParams,
  ApprovedGuardian,
  RegisterOrRecoverResult,
  StatusCheckType,
  StatusCheckResult,
  // Assets
  CaAddressInfo,
  TokenBalanceParams,
  TokenBalanceResult,
  TokenListParams,
  TokenListResult,
  TokenItem,
  NftCollectionParams,
  NftCollectionResult,
  NftCollectionItem,
  NftItemParams,
  NftItemResult,
  NftItem,
  TokenPriceParams,
  TokenPriceItem,
  // Transfer
  TransferParams,
  CrossChainTransferParams,
  TransferResult,
  // Guardian management
  GuardianToAdd,
  GuardianToRemove,
  AddGuardianParams,
  RemoveGuardianParams,
  GuardianVerificationInfo,
  // Contract
  ManagerForwardCallParams,
  ViewMethodParams,
  TransactionResultParams,
  TransactionResult,
} from './lib/types.js';

export { getApprovalCount } from './lib/types.js';

// --- Wallet helpers ---
export { createWallet, getWalletByPrivateKey } from './lib/aelf-client.js';

// --- Core: Account ---
export {
  checkAccount,
  getGuardianList,
  getHolderInfo,
  getChainInfo,
  getChainInfoByChainId,
} from './src/core/account.js';

// --- Core: Assets ---
export {
  getTokenBalance,
  getTokenList,
  getNftCollections,
  getNftItems,
  getTokenPrice,
} from './src/core/assets.js';

// --- Core: Contract ---
export {
  callContractViewMethod,
  callCaViewMethod,
  managerForwardCall,
  managerForwardCallWithKey,
} from './src/core/contract.js';

// --- Core: Auth (Phase 2) ---
export {
  getVerifierServer,
  sendVerificationCode,
  verifyCode,
  registerWallet,
  recoverWallet,
  checkRegisterOrRecoveryStatus,
} from './src/core/auth.js';

// --- Core: Transfer (Phase 3) ---
export {
  sameChainTransfer,
  crossChainTransfer,
  getTransactionResult,
} from './src/core/transfer.js';

// --- Core: Guardian (Phase 3) ---
export {
  addGuardian,
  removeGuardian,
} from './src/core/guardian.js';
