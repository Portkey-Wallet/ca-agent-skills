---
name: "portkey-ca-agent-skills"
version: "1.1.6"
description: "Portkey CA wallet registration/auth/guardian/transfer operations for agents."
activation:
  keywords:
    - ca
    - guardian
    - recovery
    - register
    - auth
    - ca hash
    - portkey
  exclude_keywords:
    - mnemonic
    - import private key
    - eoa
    - wallet create
    - dex
  tags:
    - wallet
    - ca
    - guardian
    - aelf
  max_context_tokens: 1800
---

# Portkey CA Agent Skill

## When to use
- Use this skill when you need CA wallet auth, guardian flow, and transaction operations on aelf.
- Default to this skill for CA identity, guardian, recovery, register, and CA transfer workflows.

## Capabilities
- Auth operations: verifier, email code, register, recover, status
- Query operations: account, guardian, assets, chain config
- Tx operations: transfer, contract call, approvals, keystore workflows
- Shared wallet context: auto-set active CA profile for cross-skill signer resolution
- Supports SDK, CLI, MCP, OpenClaw, and IronClaw integration from one codebase.

## Safe usage rules
- Never print private keys, mnemonics, or tokens in channel outputs.
- For write operations, require explicit user confirmation and validate parameters before sending transactions.
- Prefer `simulate` or read-only queries first when available.

## Command recipes
- Start MCP server: `bun run mcp`
- Run CLI entry: `bun run portkey_query_skill.ts chain-info`
- Read active wallet context: `portkey_get_active_wallet`
- Set active wallet context: `portkey_set_active_wallet`
- Install into IronClaw: `bun run setup ironclaw`
- Generate OpenClaw config: `bun run build:openclaw`
- Verify OpenClaw config: `bun run build:openclaw:check`
- Run CI coverage gate: `bun run test:coverage:ci`

## Limits / Non-goals
- This skill focuses on domain operations and adapters; it is not a full wallet custody system.
- Do not hardcode environment secrets in source code or docs.
- Avoid bypassing validation for external service calls.
- Do not use this skill for EOA mnemonic/private-key wallet lifecycle flows.
