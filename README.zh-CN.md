# Portkey CA Agent Skills

> [Portkey Wallet](https://portkey.finance) 的 AI Agent 工具包，基于 [aelf](https://aelf.com) 区块链 — 支持 Email 注册/登录、转账、Guardian 管理和通用合约调用。

[English](./README.md)

## 架构

```
ca-agent-skills/
├── index.ts                    # SDK 入口 — 供 LangChain / LlamaIndex 直接 import
├── src/
│   ├── core/                   # 纯业务逻辑（无副作用）
│   │   ├── account.ts          # 账户查询
│   │   ├── auth.ts             # 注册/登录/验证
│   │   ├── assets.ts           # 资产查询（Token、NFT、价格）
│   │   ├── transfer.ts         # 同链/跨链转账
│   │   ├── guardian.ts         # Guardian 管理
│   │   └── contract.ts         # 通用合约调用（ManagerForwardCall）
│   └── mcp/
│       └── server.ts           # MCP 适配器 — Claude Desktop / Cursor / GPT
├── portkey_query_skill.ts      # CLI — 查询命令
├── portkey_auth_skill.ts       # CLI — 注册/登录命令
├── portkey_tx_skill.ts         # CLI — 交易/Guardian 命令
├── bin/setup.ts                # 一键配置工具
└── lib/                        # 基础设施（config、types、aelf-sdk 封装、HTTP 客户端）
```

**核心模式：** 三个适配器（MCP / CLI / SDK）调用同一套 Core 函数，零重复逻辑。

## 功能清单

| # | 分类 | 功能 | MCP Tool | SDK 函数 |
|---|------|------|----------|----------|
| 1 | 账户 | 检查 Email 是否注册 | `portkey_check_account` | `checkAccount` |
| 2 | 账户 | 获取 Guardian 列表 | `portkey_get_guardian_list` | `getGuardianList` |
| 3 | 账户 | 获取 CA Holder 信息 | `portkey_get_holder_info` | `getHolderInfo` |
| 4 | 账户 | 获取链信息 | `portkey_get_chain_info` | `getChainInfo` |
| 5 | 验证 | 获取 Verifier | `portkey_get_verifier` | `getVerifierServer` |
| 6 | 验证 | 发送验证码 | `portkey_send_code` | `sendVerificationCode` |
| 7 | 验证 | 校验验证码 | `portkey_verify_code` | `verifyCode` |
| 8 | 注册 | 注册 CA 钱包 | `portkey_register` | `registerWallet` |
| 9 | 登录 | 恢复/登录 CA 钱包 | `portkey_recover` | `recoverWallet` |
| 10 | 状态 | 查询注册/恢复状态 | `portkey_check_status` | `checkRegisterOrRecoveryStatus` |
| 11 | 资产 | 查询 Token 余额 | `portkey_balance` | `getTokenBalance` |
| 12 | 资产 | Token 列表 | `portkey_token_list` | `getTokenList` |
| 13 | 资产 | NFT 集合 | `portkey_nft_collections` | `getNftCollections` |
| 14 | 资产 | NFT 项目 | `portkey_nft_items` | `getNftItems` |
| 15 | 资产 | Token 价格 | `portkey_token_price` | `getTokenPrice` |
| 16 | 转账 | 同链转账 | `portkey_transfer` | `sameChainTransfer` |
| 17 | 转账 | 跨链转账 | `portkey_cross_chain_transfer` | `crossChainTransfer` |
| 18 | 转账 | 查询交易结果 | `portkey_tx_result` | `getTransactionResult` |
| 19 | Guardian | 添加 Guardian | `portkey_add_guardian` | `addGuardian` |
| 20 | Guardian | 移除 Guardian | `portkey_remove_guardian` | `removeGuardian` |
| 21 | 合约 | 通用 ManagerForwardCall | `portkey_forward_call` | `managerForwardCall` |
| 22 | 合约 | 只读合约调用 | `portkey_view_call` | `callContractViewMethod` |
| 23 | 钱包 | 创建钱包 | `portkey_create_wallet` | `createWallet` |

## 前置条件

- [Bun](https://bun.sh) >= 1.0
- aelf 钱包私钥（仅写操作需要）

## 快速开始

```bash
# 安装
bun add @portkey-wallet/ca-agent-skills

# 配置
cp .env.example .env
# 编辑 .env，添加 PORTKEY_PRIVATE_KEY（仅写操作需要）

# 一键配置到 AI 平台
bun run bin/setup.ts claude          # Claude Desktop
bun run bin/setup.ts cursor          # Cursor（项目级）
bun run bin/setup.ts cursor --global # Cursor（全局）
bun run bin/setup.ts openclaw        # OpenClaw — 输出配置到 stdout
bun run bin/setup.ts openclaw --config-path ./my-openclaw.json  # 合并到已有配置

# 查看配置状态（Claude / Cursor / OpenClaw）
bun run bin/setup.ts list

# 卸载
bun run bin/setup.ts uninstall claude
bun run bin/setup.ts uninstall cursor
bun run bin/setup.ts uninstall openclaw --config-path ./my-openclaw.json
```

## SDK 使用示例

```typescript
import { getConfig, checkAccount, createWallet, getTokenBalance } from '@portkey-wallet/ca-agent-skills';

const config = getConfig({ network: 'mainnet' });

// 检查账户
const account = await checkAccount(config, { email: 'user@example.com' });
console.log(account.isRegistered, account.originChainId);

// 创建钱包
const wallet = createWallet();
console.log(wallet.address, wallet.privateKey);

// 查询余额
const balance = await getTokenBalance(config, {
  caAddress: 'xxx',
  chainId: 'AELF',
  symbol: 'ELF',
});
```

## 注册流程示例（Email）

```typescript
import {
  getConfig, createWallet, getVerifierServer,
  sendVerificationCode, verifyCode, registerWallet,
  checkRegisterOrRecoveryStatus, OperationType,
} from '@portkey-wallet/ca-agent-skills';

const config = getConfig({ network: 'mainnet' });

// 1. 获取 Verifier
const verifier = await getVerifierServer(config);

// 2. 发送验证码（注意：mainnet 已废弃 Register(0)，统一使用 CommunityRecovery(1)）
const { verifierSessionId } = await sendVerificationCode(config, {
  email: 'user@example.com',
  verifierId: verifier.id,
  chainId: 'AELF',
  operationType: OperationType.CreateCAHolder, // 注册用 1，登录用 SocialRecovery(2)
});

// 3. 用户输入验证码后校验
const { signature, verificationDoc } = await verifyCode(config, {
  email: 'user@example.com',
  verificationCode: '123456',
  verifierId: verifier.id,
  verifierSessionId,
  chainId: 'AELF',
  operationType: OperationType.CreateCAHolder,
});

// 4. 创建 Manager 钱包
const wallet = createWallet();

// 5. 提交注册
const { sessionId } = await registerWallet(config, {
  email: 'user@example.com',
  manager: wallet.address,
  verifierId: verifier.id,
  verificationDoc,
  signature,
  chainId: 'AELF',
});

// 6. 轮询状态
let status;
do {
  await new Promise(r => setTimeout(r, 3000));
  status = await checkRegisterOrRecoveryStatus(config, { sessionId, type: 'register' });
} while (status.status === 'pending');

console.log('CA Address:', status.caAddress);
console.log('CA Hash:', status.caHash);
```

## 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `PORTKEY_PRIVATE_KEY` | 写操作需要 | — | Manager 钱包私钥 |
| `PORTKEY_NETWORK` | 否 | `mainnet` | `mainnet` 或 `testnet` |
| `PORTKEY_API_URL` | 否 | 按网络 | 覆盖 API 地址 |
| `PORTKEY_GRAPHQL_URL` | 否 | 按网络 | 覆盖 GraphQL 地址 |

## 测试

```bash
bun test                    # 全部测试
bun run test:unit           # 单元测试
bun run test:integration    # 集成测试（需要网络）
bun run test:e2e            # E2E 测试（需要私钥）
```

## 安全

- `.env` 文件已默认 git-ignore，不要提交
- 私钥仅写操作需要（转账、Guardian 管理、合约调用）
- MCP 模式下，私钥通过 `env` 块传递，不会通过网络传输

## License

MIT
