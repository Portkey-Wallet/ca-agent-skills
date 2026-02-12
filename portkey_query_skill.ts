#!/usr/bin/env bun
import { Command } from 'commander';
import { getConfig } from './lib/config.js';
import { outputSuccess, outputError } from './cli-helpers.js';
import { checkAccount, getGuardianList, getHolderInfo, getChainInfo } from './src/core/account.js';
import { getTokenBalance, getTokenList, getNftCollections, getNftItems, getTokenPrice } from './src/core/assets.js';
import { callContractViewMethod } from './src/core/contract.js';
import { getTransactionResult } from './src/core/transfer.js';

const program = new Command();
program.name('portkey-query').version('1.0.0').description('Portkey wallet query tools')
  .option('--network <network>', 'mainnet or testnet', 'mainnet');

// --- Account ---

program.command('check-account')
  .description('Check if an email is registered')
  .requiredOption('--email <email>', 'Email address')
  .action(async (opts) => {
    try {
      const config = getConfig({ network: program.opts().network });
      outputSuccess(await checkAccount(config, { email: opts.email }));
    } catch (err: any) { outputError(err.message); }
  });

program.command('guardian-list')
  .description('Get guardian list for an account')
  .requiredOption('--identifier <id>', 'Guardian identifier')
  .option('--chain-id <chainId>', 'Chain ID', 'AELF')
  .action(async (opts) => {
    try {
      const config = getConfig({ network: program.opts().network });
      outputSuccess(await getGuardianList(config, { identifier: opts.identifier, chainId: opts.chainId }));
    } catch (err: any) { outputError(err.message); }
  });

program.command('holder-info')
  .description('Get CA holder info from blockchain')
  .requiredOption('--ca-hash <hash>', 'CA hash')
  .requiredOption('--chain-id <chainId>', 'Chain ID')
  .action(async (opts) => {
    try {
      const config = getConfig({ network: program.opts().network });
      outputSuccess(await getHolderInfo(config, { caHash: opts.caHash, chainId: opts.chainId }));
    } catch (err: any) { outputError(err.message); }
  });

program.command('chain-info')
  .description('Get chain configuration info')
  .action(async () => {
    try {
      const config = getConfig({ network: program.opts().network });
      outputSuccess(await getChainInfo(config));
    } catch (err: any) { outputError(err.message); }
  });

// --- Assets ---

program.command('balance')
  .description('Get token balance')
  .requiredOption('--ca-address <addr>', 'CA address')
  .requiredOption('--chain-id <chainId>', 'Chain ID')
  .requiredOption('--symbol <symbol>', 'Token symbol')
  .action(async (opts) => {
    try {
      const config = getConfig({ network: program.opts().network });
      outputSuccess(await getTokenBalance(config, {
        caAddress: opts.caAddress, chainId: opts.chainId, symbol: opts.symbol,
      }));
    } catch (err: any) { outputError(err.message); }
  });

program.command('token-list')
  .description('Get all tokens with balances')
  .requiredOption('--ca-address-infos <json>', 'JSON array of { chainId, caAddress }')
  .action(async (opts) => {
    try {
      const config = getConfig({ network: program.opts().network });
      outputSuccess(await getTokenList(config, { caAddressInfos: JSON.parse(opts.caAddressInfos) }));
    } catch (err: any) { outputError(err.message); }
  });

program.command('nft-collections')
  .description('Get NFT collections')
  .requiredOption('--ca-address-infos <json>', 'JSON array of { chainId, caAddress }')
  .action(async (opts) => {
    try {
      const config = getConfig({ network: program.opts().network });
      outputSuccess(await getNftCollections(config, { caAddressInfos: JSON.parse(opts.caAddressInfos) }));
    } catch (err: any) { outputError(err.message); }
  });

program.command('nft-items')
  .description('Get NFT items in a collection')
  .requiredOption('--ca-address-infos <json>', 'JSON array of { chainId, caAddress }')
  .requiredOption('--symbol <symbol>', 'Collection symbol')
  .action(async (opts) => {
    try {
      const config = getConfig({ network: program.opts().network });
      outputSuccess(await getNftItems(config, {
        caAddressInfos: JSON.parse(opts.caAddressInfos), symbol: opts.symbol,
      }));
    } catch (err: any) { outputError(err.message); }
  });

program.command('token-price')
  .description('Get token prices')
  .requiredOption('--symbols <symbols>', 'Comma-separated token symbols')
  .action(async (opts) => {
    try {
      const config = getConfig({ network: program.opts().network });
      outputSuccess(await getTokenPrice(config, { symbols: opts.symbols.split(',') }));
    } catch (err: any) { outputError(err.message); }
  });

// --- Contract ---

program.command('view-call')
  .description('Call a read-only contract method')
  .requiredOption('--rpc-url <url>', 'RPC endpoint URL')
  .requiredOption('--contract-address <addr>', 'Contract address')
  .requiredOption('--method-name <name>', 'Method name')
  .option('--params <json>', 'JSON parameters')
  .action(async (opts) => {
    try {
      const config = getConfig({ network: program.opts().network });
      outputSuccess(await callContractViewMethod(config, {
        rpcUrl: opts.rpcUrl, contractAddress: opts.contractAddress,
        methodName: opts.methodName, params: opts.params ? JSON.parse(opts.params) : undefined,
      }));
    } catch (err: any) { outputError(err.message); }
  });

program.command('tx-result')
  .description('Get transaction result')
  .requiredOption('--tx-id <id>', 'Transaction ID')
  .requiredOption('--chain-id <chainId>', 'Chain ID')
  .action(async (opts) => {
    try {
      const config = getConfig({ network: program.opts().network });
      outputSuccess(await getTransactionResult(config, { txId: opts.txId, chainId: opts.chainId }));
    } catch (err: any) { outputError(err.message); }
  });

program.parse();
