# Portkey CA Agent Skills

> AI Agent toolkit for [Portkey Wallet](https://portkey.finance) on the [aelf](https://aelf.com) blockchain — Email registration, login, transfers, guardian management, and generic contract calls.

[中文文档](./README.zh-CN.md)
[![Unit Tests](https://github.com/Portkey-Wallet/ca-agent-skills/actions/workflows/test.yml/badge.svg)](https://github.com/Portkey-Wallet/ca-agent-skills/actions/workflows/test.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://Portkey-Wallet.github.io/ca-agent-skills/coverage.json)](https://Portkey-Wallet.github.io/ca-agent-skills/coverage.json)

## Architecture

```
ca-agent-skills/
├── index.ts                    # SDK entry — direct import for LangChain / LlamaIndex
├── src/
│   ├── core/                   # Pure business logic (no I/O side effects)
│   │   ├── account.ts          # checkAccount, getGuardianList, getHolderInfo, getChainInfo
│   │   ├── auth.ts             # sendVerificationCode, verifyCode, registerWallet, recoverWallet
│   │   ├── assets.ts           # getTokenBalance, getTokenList, getNftCollections, getNftItems, getTokenPrice
│   │   ├── transfer.ts         # sameChainTransfer, crossChainTransfer, recoverStuckTransfer
│   │   ├── guardian.ts         # addGuardian, removeGuardian
│   │   ├── contract.ts         # managerForwardCall, callContractViewMethod
│   │   └── keystore.ts         # Encrypted wallet persistence (save, unlock, lock)
│   └── mcp/
│       └── server.ts           # MCP adapter — for Claude Desktop, Cursor, GPT, etc.
├── portkey_query_skill.ts      # CLI adapter — query commands
├── portkey_auth_skill.ts       # CLI adapter — registration & login commands
├── portkey_tx_skill.ts         # CLI adapter — transfer & guardian commands
├── cli-helpers.ts              # CLI output helpers
├── bin/
│   └── setup.ts                # One-command setup for AI platforms
├── lib/
│   ├── config.ts               # Network config, env overrides
│   ├── types.ts                # TypeScript interfaces & enums
│   ├── aelf-client.ts          # aelf-sdk wrapper (wallet, contract, signing)
│   └── http.ts                 # HTTP client for Portkey backend API
└── __tests__/                  # Unit / Integration / E2E tests
```

**Core + Adapters pattern:** Three adapters (MCP, CLI, SDK) call the same Core functions — zero duplicated logic.

## Features

| # | Category | Capability | MCP Tool | CLI Command | SDK Function |
|---|----------|-----------|----------|-------------|--------------|
| 1 | Account | Check email registration | `portkey_check_account` | `check-account` | `checkAccount` |
| 2 | Account | Get guardian list | `portkey_get_guardian_list` | `guardian-list` | `getGuardianList` |
| 3 | Account | Get CA holder info | `portkey_get_holder_info` | `holder-info` | `getHolderInfo` |
| 4 | Account | Get chain info | `portkey_get_chain_info` | `chain-info` | `getChainInfo` |
| 5 | Auth | Get verifier server | `portkey_get_verifier` | `get-verifier` | `getVerifierServer` |
| 6 | Auth | Send verification code | `portkey_send_code` | `send-code` | `sendVerificationCode` |
| 7 | Auth | Verify code | `portkey_verify_code` | `verify-code` | `verifyCode` |
| 8 | Auth | Register wallet | `portkey_register` | `register` | `registerWallet` |
| 9 | Auth | Recover wallet (login) | `portkey_recover` | `recover` | `recoverWallet` |
| 10 | Auth | Check status | `portkey_check_status` | `check-status` | `checkRegisterOrRecoveryStatus` |
| 11 | Assets | Token balance | `portkey_balance` | `balance` | `getTokenBalance` |
| 12 | Assets | Token list | `portkey_token_list` | `token-list` | `getTokenList` |
| 13 | Assets | NFT collections | `portkey_nft_collections` | `nft-collections` | `getNftCollections` |
| 14 | Assets | NFT items | `portkey_nft_items` | `nft-items` | `getNftItems` |
| 15 | Assets | Token price | `portkey_token_price` | `token-price` | `getTokenPrice` |
| 16 | Transfer | Same-chain transfer | `portkey_transfer` | `transfer` | `sameChainTransfer` |
| 17 | Transfer | Cross-chain transfer | `portkey_cross_chain_transfer` | `cross-chain-transfer` | `crossChainTransfer` |
| 18 | Transfer | Transaction result | `portkey_tx_result` | `tx-result` | `getTransactionResult` |
| 19 | Transfer | Recover stuck transfer | `portkey_recover_stuck_transfer` | `recover-stuck-transfer` | `recoverStuckTransfer` |
| 20 | Guardian | Add guardian | `portkey_add_guardian` | `add-guardian` | `addGuardian` |
| 21 | Guardian | Remove guardian | `portkey_remove_guardian` | `remove-guardian` | `removeGuardian` |
| 22 | Contract | ManagerForwardCall | `portkey_forward_call` | `forward-call` | `managerForwardCall` |
| 23 | Contract | View method call | `portkey_view_call` | `view-call` | `callContractViewMethod` |
| 24 | Wallet | Create wallet | `portkey_create_wallet` | `create-wallet` | `createWallet` |
| 25 | Wallet | Save keystore | `portkey_save_keystore` | `save-keystore` | `saveKeystore` |
| 26 | Wallet | Unlock wallet | `portkey_unlock` | `unlock` | `unlockWallet` |
| 27 | Wallet | Lock wallet | `portkey_lock` | `lock` | `lockWallet` |
| 28 | Wallet | Wallet status | `portkey_wallet_status` | `wallet-status` | `getWalletStatus` |

## Wallet Persistence (Keystore)

Manager private keys are encrypted and stored locally using aelf-sdk's keystore scheme (scrypt + AES-128-CTR).

**Storage location:** `~/.portkey/ca/{network}.keystore.json`

### First-time setup (after registration/recovery)

```bash
# AI flow: create_wallet → register → check_status → save_keystore(password)
# The wallet is auto-unlocked after saving.
```

### New conversation

```bash
# AI calls portkey_wallet_status to check if keystore exists
# If locked, asks user for password → portkey_unlock(password)
# Write operations now work automatically
```

### Manual CLI usage

```bash
# Save keystore
bun run portkey_auth_skill.ts save-keystore \
  --password "your-password" \
  --private-key "hex-key" \
  --mnemonic "word1 word2 ..." \
  --ca-hash "xxx" --ca-address "ELF_xxx_AELF"

# Unlock
bun run portkey_auth_skill.ts unlock --password "your-password"

# Check status
bun run portkey_auth_skill.ts wallet-status

# Lock
bun run portkey_auth_skill.ts lock
```

### How it works

1. **Save** — encrypts the Manager private key + mnemonic with a user-provided password, writes to `~/.portkey/ca/`
2. **Unlock** — decrypts the keystore, loads the wallet into memory for the current process
3. **Lock** — clears the private key from memory
4. **Write operations** — automatically use the unlocked wallet; falls back to `PORTKEY_PRIVATE_KEY` env var if no keystore is unlocked

## Prerequisites

- [Bun](https://bun.sh) >= 1.0
- An aelf wallet private key or an unlocked keystore (for write operations only)

## Quick Start

### 1. Install

```bash
bun add @portkey/ca-agent-skills

# Or clone locally
git clone https://github.com/AwakenFinance/ca-agent-skills.git
cd ca-agent-skills
bun install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env — add your PORTKEY_PRIVATE_KEY (only for write operations)
```

### 3. One-Command Setup

```bash
# Claude Desktop
bun run bin/setup.ts claude

# Cursor (project-level)
bun run bin/setup.ts cursor

# Cursor (global)
bun run bin/setup.ts cursor --global

# OpenClaw — output config to stdout
bun run bin/setup.ts openclaw

# OpenClaw — merge into existing config
bun run bin/setup.ts openclaw --config-path ./my-openclaw.json

# Check status (Claude, Cursor, OpenClaw)
bun run bin/setup.ts list

# Remove
bun run bin/setup.ts uninstall claude
bun run bin/setup.ts uninstall cursor
bun run bin/setup.ts uninstall openclaw --config-path ./my-openclaw.json
```

## Usage

### MCP (Claude Desktop / Cursor)

Add to your MCP config (`mcp-config.example.json`):

```json
{
  "mcpServers": {
    "ca-agent-skills": {
      "command": "bun",
      "args": ["run", "/path/to/ca-agent-skills/src/mcp/server.ts"],
      "env": {
        "PORTKEY_PRIVATE_KEY": "your_private_key_here",
        "PORTKEY_NETWORK": "mainnet"
      }
    }
  }
}
```

### OpenClaw

The `openclaw.json` in the project root defines 13 CLI-based tools for OpenClaw. Use `bun run bin/setup.ts openclaw` to generate or merge the config.

### CLI

```bash
# Check if email is registered
bun run portkey_query_skill.ts check-account --email user@example.com

# Get chain info
bun run portkey_query_skill.ts chain-info

# Create wallet
bun run portkey_auth_skill.ts create-wallet

# Transfer tokens (requires PORTKEY_PRIVATE_KEY env)
bun run portkey_tx_skill.ts transfer --ca-hash xxx --token-contract xxx --symbol ELF --to xxx --amount 100000000 --chain-id AELF
```

### SDK

```typescript
import { getConfig, checkAccount, createWallet, getTokenBalance } from '@portkey/ca-agent-skills';

const config = getConfig({ network: 'mainnet' });

// Check account
const account = await checkAccount(config, { email: 'user@example.com' });

// Create wallet
const wallet = createWallet();

// Get balance
const balance = await getTokenBalance(config, {
  caAddress: 'xxx',
  chainId: 'AELF',
  symbol: 'ELF',
});
```

## Network

| Network | Chain IDs | API URL |
|---------|-----------|---------|
| mainnet (default) | AELF, tDVV | `https://aa-portkey.portkey.finance` |
| testnet | AELF, tDVW | `https://aa-portkey-test.portkey.finance` |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORTKEY_PRIVATE_KEY` | Fallback | — | Manager wallet private key (fallback if keystore not unlocked) |
| `PORTKEY_NETWORK` | No | `mainnet` | `mainnet` or `testnet` |
| `PORTKEY_API_URL` | No | Per network | Override API endpoint |
| `PORTKEY_GRAPHQL_URL` | No | Per network | Override GraphQL endpoint |

## Testing

```bash
bun test                    # All tests
bun run test:unit           # Unit tests only
bun run test:integration    # Integration (requires network)
bun run test:e2e            # E2E (requires private key)
```

## Security

- Never commit your `.env` file (git-ignored by default)
- Private keys are only needed for write operations (transfer, guardian management, contract calls)
- **Keystore encryption**: Manager private keys are encrypted with scrypt (N=8192) + AES-128-CTR via aelf-sdk's keystore module. Files are stored with `0600` permissions.
- **In-memory lifecycle**: private keys exist in memory only while unlocked; `portkey_lock` clears them immediately
- When using MCP, the keystore password only exists in the AI conversation context — it is never written to disk
- `PORTKEY_PRIVATE_KEY` env var is supported as a fallback but keystore is the recommended approach

## License

MIT
