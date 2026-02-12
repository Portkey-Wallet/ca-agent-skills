#!/usr/bin/env bun
import { Command } from 'commander';
import { getConfig } from './lib/config.js';
import { outputSuccess, outputError } from './cli-helpers.js';
import { getWalletByPrivateKey } from './lib/aelf-client.js';
import { sameChainTransfer, crossChainTransfer } from './src/core/transfer.js';
import { addGuardian, removeGuardian } from './src/core/guardian.js';
import { managerForwardCallWithKey } from './src/core/contract.js';

const program = new Command();
program.name('portkey-tx').version('1.0.0').description('Portkey wallet transaction & guardian tools')
  .option('--network <network>', 'mainnet or testnet', 'mainnet');

function requirePrivateKey(): string {
  const pk = process.env.PORTKEY_PRIVATE_KEY;
  if (!pk) {
    outputError('PORTKEY_PRIVATE_KEY environment variable is required for write operations');
  }
  return pk!;
}

program.command('transfer')
  .description('Transfer tokens on the same chain')
  .requiredOption('--ca-hash <hash>', 'CA hash')
  .requiredOption('--token-contract <addr>', 'Token contract address')
  .requiredOption('--symbol <symbol>', 'Token symbol')
  .requiredOption('--to <addr>', 'Recipient address')
  .requiredOption('--amount <amount>', 'Amount in smallest unit')
  .option('--memo <memo>', 'Transfer memo')
  .requiredOption('--chain-id <chainId>', 'Chain ID')
  .action(async (opts) => {
    try {
      const pk = requirePrivateKey();
      const config = getConfig({ network: program.opts().network });
      const wallet = getWalletByPrivateKey(pk);
      outputSuccess(await sameChainTransfer(config, wallet, {
        caHash: opts.caHash, tokenContractAddress: opts.tokenContract,
        symbol: opts.symbol, to: opts.to, amount: opts.amount,
        memo: opts.memo, chainId: opts.chainId,
      }));
    } catch (err: any) { outputError(err.message); }
  });

program.command('cross-chain-transfer')
  .description('Transfer tokens cross-chain')
  .requiredOption('--ca-hash <hash>', 'CA hash')
  .requiredOption('--token-contract <addr>', 'Token contract address')
  .requiredOption('--symbol <symbol>', 'Token symbol')
  .requiredOption('--to <addr>', 'Recipient address')
  .requiredOption('--amount <amount>', 'Amount in smallest unit')
  .requiredOption('--chain-id <chainId>', 'Source chain ID')
  .requiredOption('--to-chain-id <chainId>', 'Target chain ID')
  .action(async (opts) => {
    try {
      const pk = requirePrivateKey();
      const config = getConfig({ network: program.opts().network });
      const wallet = getWalletByPrivateKey(pk);
      outputSuccess(await crossChainTransfer(config, wallet, {
        caHash: opts.caHash, tokenContractAddress: opts.tokenContract,
        symbol: opts.symbol, to: opts.to, amount: opts.amount,
        chainId: opts.chainId, toChainId: opts.toChainId,
      }));
    } catch (err: any) { outputError(err.message); }
  });

program.command('add-guardian')
  .description('Add a guardian to a CA wallet')
  .requiredOption('--ca-hash <hash>', 'CA hash')
  .requiredOption('--guardian-to-add <json>', 'JSON guardian to add')
  .requiredOption('--guardians-approved <json>', 'JSON array of approved guardians')
  .requiredOption('--chain-id <chainId>', 'Chain ID')
  .action(async (opts) => {
    try {
      const pk = requirePrivateKey();
      const config = getConfig({ network: program.opts().network });
      const wallet = getWalletByPrivateKey(pk);
      outputSuccess(await addGuardian(config, wallet, {
        caHash: opts.caHash,
        guardianToAdd: JSON.parse(opts.guardianToAdd),
        guardiansApproved: JSON.parse(opts.guardiansApproved),
        chainId: opts.chainId,
      }));
    } catch (err: any) { outputError(err.message); }
  });

program.command('remove-guardian')
  .description('Remove a guardian from a CA wallet')
  .requiredOption('--ca-hash <hash>', 'CA hash')
  .requiredOption('--guardian-to-remove <json>', 'JSON guardian to remove')
  .requiredOption('--guardians-approved <json>', 'JSON array of approved guardians')
  .requiredOption('--chain-id <chainId>', 'Chain ID')
  .action(async (opts) => {
    try {
      const pk = requirePrivateKey();
      const config = getConfig({ network: program.opts().network });
      const wallet = getWalletByPrivateKey(pk);
      outputSuccess(await removeGuardian(config, wallet, {
        caHash: opts.caHash,
        guardianToRemove: JSON.parse(opts.guardianToRemove),
        guardiansApproved: JSON.parse(opts.guardiansApproved),
        chainId: opts.chainId,
      }));
    } catch (err: any) { outputError(err.message); }
  });

program.command('forward-call')
  .description('Generic ManagerForwardCall to any contract')
  .requiredOption('--ca-hash <hash>', 'CA hash')
  .requiredOption('--contract-address <addr>', 'Target contract address')
  .requiredOption('--method-name <name>', 'Target method name')
  .requiredOption('--args <json>', 'JSON method arguments')
  .requiredOption('--chain-id <chainId>', 'Chain ID')
  .action(async (opts) => {
    try {
      const pk = requirePrivateKey();
      const config = getConfig({ network: program.opts().network });
      outputSuccess(await managerForwardCallWithKey(config, pk, {
        caHash: opts.caHash, contractAddress: opts.contractAddress,
        methodName: opts.methodName, args: JSON.parse(opts.args), chainId: opts.chainId,
      }));
    } catch (err: any) { outputError(err.message); }
  });

program.parse();
