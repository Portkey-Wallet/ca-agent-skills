#!/usr/bin/env bun
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getConfig } from '../../lib/config.js';
import { createWallet, getWalletByPrivateKey } from '../../lib/aelf-client.js';
import { validateRpcUrl } from '../../lib/http.js';
import { LoginType, OperationType } from '../../lib/types.js';

// Core functions
import { checkAccount, getGuardianList, getHolderInfo, getChainInfo } from '../core/account.js';
import { getTokenBalance, getTokenList, getNftCollections, getNftItems, getTokenPrice } from '../core/assets.js';
import { getVerifierServer, sendVerificationCode, verifyCode, registerWallet, recoverWallet, checkRegisterOrRecoveryStatus } from '../core/auth.js';
import { sameChainTransfer, crossChainTransfer, recoverStuckTransfer, getTransactionResult } from '../core/transfer.js';
import { addGuardian, removeGuardian } from '../core/guardian.js';
import { callContractViewMethod, managerForwardCallWithKey } from '../core/contract.js';
import { saveKeystore, unlockWallet, lockWallet, getWalletStatus, getUnlockedWallet } from '../core/keystore.js';

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'ca-agent-skills',
  version: '1.0.0',
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHAIN_ID = z.enum(['AELF', 'tDVV', 'tDVW']).describe('aelf chain ID');
const NETWORK = z.enum(['mainnet', 'testnet']).default('mainnet').describe('Portkey network');

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text' as const, text: `[ERROR] ${message}` }], isError: true as const };
}

/** Parse a JSON string and validate against a zod schema. */
function parseJson<T>(raw: string, schema: z.ZodType<T>, label: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON for ${label}: ${raw.slice(0, 200)}`);
  }
  return schema.parse(parsed);
}

// ---------------------------------------------------------------------------
// Shared zod schemas for JSON string inputs
// ---------------------------------------------------------------------------

const CaAddressInfoSchema = z.array(z.object({
  chainId: z.string(),
  caAddress: z.string(),
}));

const GuardianApprovedSchema = z.array(z.object({
  identifier: z.string().optional(),
  identifierHash: z.string().optional(),
  type: z.union([z.string(), z.number()]).optional(),
  verifierId: z.string(),
  verificationDoc: z.string(),
  signature: z.string(),
}));

const GuardianToAddSchema = z.object({
  identifierHash: z.string(),
  type: z.number(),
  verificationInfo: z.object({
    id: z.string(),
    signature: z.string(),
    verificationDoc: z.string(),
  }),
});

const GuardianToRemoveSchema = z.object({
  identifierHash: z.string(),
  type: z.number(),
  verificationInfo: z.object({
    id: z.string(),
  }),
});

// ---------------------------------------------------------------------------
// Wallet accessor: unlocked keystore > env var fallback
// ---------------------------------------------------------------------------

function requireWallet(): ReturnType<typeof getWalletByPrivateKey> {
  const unlocked = getUnlockedWallet();
  if (unlocked) return unlocked.wallet;
  const pk = process.env.PORTKEY_PRIVATE_KEY;
  if (pk) return getWalletByPrivateKey(pk);
  throw new Error(
    'Wallet not available. Either use portkey_unlock to unlock your keystore, ' +
    'or set the PORTKEY_PRIVATE_KEY environment variable.',
  );
}

// ---------------------------------------------------------------------------
// 1. portkey_check_account
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_check_account',
  {
    description: 'Check if an email address is registered in Portkey. Use when you need to determine whether a user has an existing Portkey CA wallet. Returns isRegistered boolean and originChainId.',
    inputSchema: {
      email: z.string().email().describe('Email address to check'),
      network: NETWORK,
    },
  },
  async ({ email, network }) => {
    try {
      return ok(await checkAccount(getConfig({ network }), { email }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 2. portkey_get_guardian_list
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_get_guardian_list',
  {
    description: 'Get all guardians associated with an account. Use when you need to see which guardians protect a wallet, or to prepare for login/recovery. Returns array of guardians with their types, verifiers, and login status.',
    inputSchema: {
      identifier: z.string().describe('Guardian identifier (email, phone, or social user ID)'),
      chainId: CHAIN_ID.optional().default('AELF'),
      network: NETWORK,
    },
  },
  async ({ identifier, chainId, network }) => {
    try {
      return ok(await getGuardianList(getConfig({ network }), { identifier, chainId }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 3. portkey_get_holder_info
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_get_holder_info',
  {
    description: 'Get CA holder info directly from the blockchain. Use when you need authoritative on-chain data about a wallet including guardian list, manager list, and CA address. Returns HolderInfo with caHash, caAddress, guardians, and managers.',
    inputSchema: {
      caHash: z.string().describe('CA hash identifier'),
      chainId: CHAIN_ID,
      network: NETWORK,
    },
  },
  async ({ caHash, chainId, network }) => {
    try {
      return ok(await getHolderInfo(getConfig({ network }), { caHash, chainId }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 4. portkey_get_chain_info
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_get_chain_info',
  {
    description: 'Get chain configuration info including RPC endpoints, CA contract addresses, and default tokens. Use when you need chain-specific configuration to make contract calls or transfers. Returns array of ChainInfo objects.',
    inputSchema: {
      network: NETWORK,
    },
  },
  async ({ network }) => {
    try {
      return ok(await getChainInfo(getConfig({ network })));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 5. portkey_send_code
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_send_code',
  {
    description: 'Send a verification code to an email address. Use as the first step in registration or login. Requires a verifierId from portkey_get_verifier. Returns verifierSessionId needed for portkey_verify_code.',
    inputSchema: {
      email: z.string().email().describe('Email address to send code to'),
      verifierId: z.string().describe('Verifier service ID from portkey_get_verifier'),
      chainId: CHAIN_ID.default('AELF'),
      operationType: z.enum(['register', 'recovery', 'addGuardian', 'deleteGuardian']).describe('Operation requiring verification'),
      network: NETWORK,
    },
  },
  async ({ email, verifierId, chainId, operationType, network }) => {
    const opMap: Record<string, OperationType> = {
      register: OperationType.CreateCAHolder,
      recovery: OperationType.SocialRecovery,
      addGuardian: OperationType.AddGuardian,
      deleteGuardian: OperationType.RemoveGuardian,
    };
    try {
      return ok(await sendVerificationCode(getConfig({ network }), {
        email, verifierId, chainId, operationType: opMap[operationType],
      }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 6. portkey_verify_code
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_verify_code',
  {
    description: 'Verify a 6-digit code sent to an email. Use after portkey_send_code to complete verification. Returns signature and verificationDoc needed for registration or recovery.',
    inputSchema: {
      email: z.string().email().describe('Email address the code was sent to'),
      verificationCode: z.string().length(6).describe('6-digit verification code'),
      verifierId: z.string().describe('Verifier service ID'),
      verifierSessionId: z.string().describe('Session ID from portkey_send_code'),
      chainId: CHAIN_ID.default('AELF'),
      operationType: z.enum(['register', 'recovery', 'addGuardian', 'deleteGuardian']).describe('Operation type'),
      network: NETWORK,
    },
  },
  async ({ email, verificationCode, verifierId, verifierSessionId, chainId, operationType, network }) => {
    const opMap: Record<string, OperationType> = {
      register: OperationType.CreateCAHolder,
      recovery: OperationType.SocialRecovery,
      addGuardian: OperationType.AddGuardian,
      deleteGuardian: OperationType.RemoveGuardian,
    };
    try {
      return ok(await verifyCode(getConfig({ network }), {
        email, verificationCode, verifierId, verifierSessionId, chainId, operationType: opMap[operationType],
      }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 7. portkey_get_verifier
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_get_verifier',
  {
    description: 'Get an assigned verifier server for verification operations. Use before sending a verification code. Returns verifier id, name, and imageUrl.',
    inputSchema: {
      chainId: CHAIN_ID.optional().default('AELF'),
      network: NETWORK,
    },
  },
  async ({ chainId, network }) => {
    try {
      return ok(await getVerifierServer(getConfig({ network }), { chainId }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 8. portkey_register
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_register',
  {
    description: 'Register a new Portkey CA wallet with email. Use after completing email verification (portkey_verify_code). Requires a manager address from a newly created wallet. Returns sessionId to poll with portkey_check_status.',
    inputSchema: {
      email: z.string().email().describe('Email address'),
      manager: z.string().describe('Manager wallet address (from createWallet)'),
      verifierId: z.string().describe('Verifier service ID'),
      verificationDoc: z.string().describe('Verification document from portkey_verify_code'),
      signature: z.string().describe('Signature from portkey_verify_code'),
      chainId: CHAIN_ID.default('AELF'),
      network: NETWORK,
    },
  },
  async ({ email, manager, verifierId, verificationDoc, signature, chainId, network }) => {
    try {
      return ok(await registerWallet(getConfig({ network }), {
        email, manager, verifierId, verificationDoc, signature, chainId,
      }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 9. portkey_recover
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_recover',
  {
    description: 'Recover (login to) an existing Portkey CA wallet. Use after getting enough guardian approvals. Requires guardian verification signatures. Returns sessionId to poll with portkey_check_status.',
    inputSchema: {
      email: z.string().email().describe('Email address'),
      manager: z.string().describe('New manager wallet address'),
      guardiansApproved: z.string().describe('JSON string of approved guardians array: [{ identifier, identifierHash, type, verifierId, verificationDoc, signature }]'),
      chainId: CHAIN_ID.default('AELF'),
      network: NETWORK,
    },
  },
  async ({ email, manager, guardiansApproved, chainId, network }) => {
    try {
      const parsed = parseJson(guardiansApproved, GuardianApprovedSchema, 'guardiansApproved');
      return ok(await recoverWallet(getConfig({ network }), {
        email, manager, guardiansApproved: parsed, chainId,
      }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 10. portkey_check_status
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_check_status',
  {
    description: 'Check the status of a registration or recovery request. Use after portkey_register or portkey_recover to poll for completion. Returns status (pass/pending/fail), and caAddress + caHash when status is pass.',
    inputSchema: {
      sessionId: z.string().describe('Session ID from register or recover'),
      type: z.enum(['register', 'recovery']).describe('Request type'),
      network: NETWORK,
    },
  },
  async ({ sessionId, type, network }) => {
    try {
      return ok(await checkRegisterOrRecoveryStatus(getConfig({ network }), { sessionId, type }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 11. portkey_balance
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_balance',
  {
    description: 'Query the token balance of a CA address on a specific chain. Use when you need to check how many tokens a wallet holds. Returns symbol, balance (in smallest unit), decimals, and tokenContractAddress.',
    inputSchema: {
      caAddress: z.string().describe('CA address on the chain'),
      chainId: CHAIN_ID,
      symbol: z.string().describe('Token symbol, e.g. ELF'),
      network: NETWORK,
    },
  },
  async ({ caAddress, chainId, symbol, network }) => {
    try {
      return ok(await getTokenBalance(getConfig({ network }), { caAddress, chainId, symbol }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 12. portkey_token_list
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_token_list',
  {
    description: 'Get all tokens with balances for CA addresses across chains. Use to see the full token portfolio of a wallet. Returns array of tokens with balances, prices, and USD values.',
    inputSchema: {
      caAddressInfos: z.string().describe('JSON array of { chainId, caAddress } objects'),
      network: NETWORK,
    },
  },
  async ({ caAddressInfos, network }) => {
    try {
      const parsed = parseJson(caAddressInfos, CaAddressInfoSchema, 'caAddressInfos');
      return ok(await getTokenList(getConfig({ network }), { caAddressInfos: parsed }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 13. portkey_nft_collections
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_nft_collections',
  {
    description: 'Get NFT collections owned by CA addresses. Use to browse NFT holdings. Returns collection names, images, and item counts.',
    inputSchema: {
      caAddressInfos: z.string().describe('JSON array of { chainId, caAddress } objects'),
      network: NETWORK,
    },
  },
  async ({ caAddressInfos, network }) => {
    try {
      const parsed = parseJson(caAddressInfos, CaAddressInfoSchema, 'caAddressInfos');
      return ok(await getNftCollections(getConfig({ network }), { caAddressInfos: parsed }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 14. portkey_nft_items
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_nft_items',
  {
    description: 'Get NFT items within a specific collection. Use to see individual NFTs in a collection. Returns token IDs, images, balances, and metadata.',
    inputSchema: {
      caAddressInfos: z.string().describe('JSON array of { chainId, caAddress } objects'),
      symbol: z.string().describe('Collection symbol'),
      network: NETWORK,
    },
  },
  async ({ caAddressInfos, symbol, network }) => {
    try {
      const parsed = parseJson(caAddressInfos, CaAddressInfoSchema, 'caAddressInfos');
      return ok(await getNftItems(getConfig({ network }), { caAddressInfos: parsed, symbol }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 15. portkey_token_price
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_token_price',
  {
    description: 'Get current token prices in USD. Use to check market prices. Returns array of { symbol, priceInUsd }.',
    inputSchema: {
      symbols: z.string().describe('Comma-separated token symbols, e.g. "ELF,USDT"'),
      network: NETWORK,
    },
  },
  async ({ symbols, network }) => {
    try {
      return ok(await getTokenPrice(getConfig({ network }), { symbols: symbols.split(',').map(s => s.trim()) }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 16. portkey_transfer
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_transfer',
  {
    description: 'Transfer tokens on the same chain. Use when sender and receiver are on the same aelf sidechain. Requires manager private key. Returns transactionId and status.',
    inputSchema: {
      caHash: z.string().describe('CA hash of the sender wallet'),
      tokenContractAddress: z.string().describe('Token contract address on the chain'),
      symbol: z.string().describe('Token symbol, e.g. ELF'),
      to: z.string().describe('Recipient address'),
      amount: z.string().describe('Amount in smallest unit (e.g. 100000000 = 1 ELF)'),
      memo: z.string().optional().describe('Optional transfer memo'),
      chainId: CHAIN_ID,
      network: NETWORK,
    },
  },
  async ({ caHash, tokenContractAddress, symbol, to, amount, memo, chainId, network }) => {
    try {
      const wallet = requireWallet();
      return ok(await sameChainTransfer(getConfig({ network }), wallet, {
        caHash, tokenContractAddress, symbol, to, amount, memo, chainId,
      }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 17. portkey_cross_chain_transfer
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_cross_chain_transfer',
  {
    description: 'Transfer tokens across chains (e.g., AELF to tDVV). Two-step process handled automatically. Requires manager private key. Returns transactionId and status.',
    inputSchema: {
      caHash: z.string().describe('CA hash of the sender wallet'),
      tokenContractAddress: z.string().describe('Token contract address on source chain'),
      symbol: z.string().describe('Token symbol'),
      to: z.string().describe('Recipient address on target chain'),
      amount: z.string().describe('Amount in smallest unit'),
      toChainId: CHAIN_ID.describe('Target chain ID'),
      chainId: CHAIN_ID.describe('Source chain ID'),
      network: NETWORK,
    },
  },
  async ({ caHash, tokenContractAddress, symbol, to, amount, toChainId, chainId, network }) => {
    try {
      const wallet = requireWallet();
      return ok(await crossChainTransfer(getConfig({ network }), wallet, {
        caHash, tokenContractAddress, symbol, to, amount, toChainId, chainId,
      }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 18. portkey_tx_result
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_tx_result',
  {
    description: 'Get the result of a blockchain transaction. Use to check if a transaction was mined successfully. Returns full transaction result including status, logs, and block info.',
    inputSchema: {
      txId: z.string().describe('Transaction ID'),
      chainId: CHAIN_ID,
      network: NETWORK,
    },
  },
  async ({ txId, chainId, network }) => {
    try {
      return ok(await getTransactionResult(getConfig({ network }), { txId, chainId }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 19. portkey_recover_stuck_transfer
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_recover_stuck_transfer',
  {
    description: 'Recover tokens stuck on the Manager address after a failed cross-chain transfer. When crossChainTransfer Step 1 (CA→Manager) succeeds but Step 2 fails, tokens remain on the Manager. This tool transfers them back to the CA address.',
    inputSchema: {
      tokenContractAddress: z.string().describe('Token contract address'),
      symbol: z.string().describe('Token symbol (e.g. ELF)'),
      amount: z.string().describe('Amount in smallest unit'),
      caAddress: z.string().describe('CA address to recover tokens to'),
      chainId: CHAIN_ID,
      memo: z.string().optional().describe('Optional memo'),
      network: NETWORK,
    },
  },
  async ({ tokenContractAddress, symbol, amount, caAddress, chainId, memo, network }) => {
    try {
      const wallet = requireWallet();
      return ok(await recoverStuckTransfer(getConfig({ network }), wallet, {
        tokenContractAddress, symbol, amount, caAddress, chainId, memo,
      }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 20. portkey_add_guardian
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_add_guardian',
  {
    description: 'Add a new guardian to a CA wallet. Requires existing guardian approvals. Use after verifying the new guardian identity and getting approvals from current guardians.',
    inputSchema: {
      caHash: z.string().describe('CA hash'),
      guardianToAdd: z.string().describe('JSON: { identifierHash, type (0=Email), verificationInfo: { id, signature, verificationDoc } }'),
      guardiansApproved: z.string().describe('JSON array of approved guardians'),
      chainId: CHAIN_ID,
      network: NETWORK,
    },
  },
  async ({ caHash, guardianToAdd, guardiansApproved, chainId, network }) => {
    try {
      const wallet = requireWallet();
      return ok(await addGuardian(getConfig({ network }), wallet, {
        caHash,
        guardianToAdd: parseJson(guardianToAdd, GuardianToAddSchema, 'guardianToAdd'),
        guardiansApproved: parseJson(guardiansApproved, GuardianApprovedSchema, 'guardiansApproved'),
        chainId,
      }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 21. portkey_remove_guardian
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_remove_guardian',
  {
    description: 'Remove a guardian from a CA wallet. Requires existing guardian approvals. The guardian must not be the only login guardian.',
    inputSchema: {
      caHash: z.string().describe('CA hash'),
      guardianToRemove: z.string().describe('JSON: { identifierHash, type (0=Email), verificationInfo: { id } }'),
      guardiansApproved: z.string().describe('JSON array of approved guardians'),
      chainId: CHAIN_ID,
      network: NETWORK,
    },
  },
  async ({ caHash, guardianToRemove, guardiansApproved, chainId, network }) => {
    try {
      const wallet = requireWallet();
      return ok(await removeGuardian(getConfig({ network }), wallet, {
        caHash,
        guardianToRemove: parseJson(guardianToRemove, GuardianToRemoveSchema, 'guardianToRemove'),
        guardiansApproved: parseJson(guardiansApproved, GuardianApprovedSchema, 'guardiansApproved'),
        chainId,
      }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 22. portkey_forward_call
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_forward_call',
  {
    description: 'Execute a generic ManagerForwardCall on any contract through the CA wallet. Use for any custom contract interaction. The CA contract forwards the call to the target contract on behalf of the CA address.',
    inputSchema: {
      caHash: z.string().describe('CA hash'),
      contractAddress: z.string().describe('Target contract address'),
      methodName: z.string().describe('Target method name'),
      args: z.string().describe('JSON object of method arguments'),
      chainId: CHAIN_ID,
      network: NETWORK,
    },
  },
  async ({ caHash, contractAddress, methodName, args, chainId, network }) => {
    try {
      const wallet = requireWallet();
      let parsedArgs: Record<string, unknown>;
      try { parsedArgs = JSON.parse(args); } catch { throw new Error(`Invalid JSON for "args": ${args.slice(0, 200)}`); }
      return ok(await managerForwardCallWithKey(getConfig({ network }), wallet.privateKey, {
        caHash, contractAddress, methodName, args: parsedArgs, chainId,
      }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 23. portkey_view_call
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_view_call',
  {
    description: 'Call a read-only (view) method on any contract. Use for querying contract state without signing. No private key needed.',
    inputSchema: {
      rpcUrl: z.string().describe('RPC endpoint URL'),
      contractAddress: z.string().describe('Contract address'),
      methodName: z.string().describe('Method name'),
      params: z.string().optional().describe('JSON object of method parameters'),
      network: NETWORK,
    },
  },
  async ({ rpcUrl, contractAddress, methodName, params, network }) => {
    try {
      validateRpcUrl(rpcUrl);
      let parsedParams: Record<string, unknown> | undefined;
      if (params) { try { parsedParams = JSON.parse(params); } catch { throw new Error(`Invalid JSON for "params": ${params.slice(0, 200)}`); } }
      return ok(await callContractViewMethod(getConfig({ network }), {
        rpcUrl, contractAddress, methodName, params: parsedParams,
      }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// Bonus: portkey_create_wallet
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_create_wallet',
  {
    description: 'Create a new aelf wallet (manager keypair). Use when you need a fresh manager address for registration or recovery. Returns address, privateKey, and mnemonic. IMPORTANT: after registration/recovery succeeds, use portkey_save_keystore to encrypt and persist the wallet.',
  },
  async () => {
    try {
      return ok(createWallet());
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 25. portkey_save_keystore
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_save_keystore',
  {
    description: 'Encrypt and save the Manager wallet to a keystore file (~/.portkey/ca/). Use after registration or recovery is complete. The wallet is auto-unlocked after saving. The user must provide or confirm a password.',
    inputSchema: {
      password: z.string().min(1).describe('Password to encrypt the keystore'),
      privateKey: z.string().describe('Manager private key (hex, from portkey_create_wallet)'),
      mnemonic: z.string().describe('Manager mnemonic (from portkey_create_wallet)'),
      caHash: z.string().describe('CA hash (from portkey_check_status)'),
      caAddress: z.string().describe('CA address (from portkey_check_status)'),
      originChainId: CHAIN_ID.default('AELF').describe('Origin chain ID where CA was created'),
      network: NETWORK,
    },
  },
  async ({ password, privateKey, mnemonic, caHash, caAddress, originChainId, network }) => {
    try {
      return ok(saveKeystore({
        password, privateKey, mnemonic, caHash, caAddress, originChainId, network: network || 'mainnet',
      }));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 26. portkey_unlock
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_unlock',
  {
    description: 'Unlock the encrypted keystore with a password. Loads the Manager wallet into memory for write operations. Use at the start of a new conversation if a keystore exists. Check portkey_wallet_status first to see if unlock is needed.',
    inputSchema: {
      password: z.string().min(1).describe('Keystore password'),
      network: NETWORK,
    },
  },
  async ({ password, network }) => {
    try {
      return ok(unlockWallet(password, network || 'mainnet'));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 27. portkey_lock
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_lock',
  {
    description: 'Lock the wallet — clear the Manager private key from memory. Use when done with write operations for security.',
  },
  async () => {
    try {
      return ok(lockWallet());
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// 28. portkey_wallet_status
// ---------------------------------------------------------------------------
server.registerTool(
  'portkey_wallet_status',
  {
    description: 'Check the wallet status: whether a keystore exists, whether it is unlocked, CA address, and manager address. Use at conversation start to determine if portkey_unlock is needed.',
    inputSchema: {
      network: NETWORK,
    },
  },
  async ({ network }) => {
    try {
      return ok(getWalletStatus(network || 'mainnet'));
    } catch (err) { return fail(err); }
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Portkey MCP Server running on stdio');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
