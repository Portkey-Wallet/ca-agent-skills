---
name: "portkey-ca-agent-skills"
description: "Portkey CA wallet registration/auth/guardian/transfer operations for agents."
---

# Portkey CA Agent Skill

## When to use
- Use this skill when you need CA wallet auth, guardian flow, and transaction operations on aelf.

## Capabilities
- Auth operations: verifier, email code, register, recover, status
- Query operations: account, guardian, assets, chain config
- Tx operations: transfer, contract call, approvals, keystore workflows
- Supports SDK, CLI, MCP, and OpenClaw integration from one codebase.

## Safe usage rules
- Never print private keys, mnemonics, or tokens in channel outputs.
- For write operations, require explicit user confirmation and validate parameters before sending transactions.
- Prefer `simulate` or read-only queries first when available.

## Command recipes
- Start MCP server: `bun run mcp`
- Run CLI entry: `bun run portkey_query_skill.ts chain-info`
- Generate OpenClaw config: `bun run build:openclaw`
- Verify OpenClaw config: `bun run build:openclaw:check`
- Run CI coverage gate: `bun run test:coverage:ci`

## Limits / Non-goals
- This skill focuses on domain operations and adapters; it is not a full wallet custody system.
- Do not hardcode environment secrets in source code or docs.
- Avoid bypassing validation for external service calls.
