#!/usr/bin/env bun
import { Command } from 'commander';
import { getConfig } from './lib/config.js';
import { outputSuccess, outputError, safeJsonParse } from './cli-helpers.js';
import { createWallet } from './lib/aelf-client.js';
import { saveKeystore, unlockWallet, lockWallet, getWalletStatus } from './src/core/keystore.js';
import {
  getVerifierServer,
  sendVerificationCode,
  verifyCode,
  registerWallet,
  recoverWallet,
  checkRegisterOrRecoveryStatus,
} from './src/core/auth.js';
import { OperationType } from './lib/types.js';

const program = new Command();
program.name('portkey-auth').version('1.0.0').description('Portkey wallet registration & login tools')
  .option('--network <network>', 'mainnet or testnet', 'mainnet');

program.command('get-verifier')
  .description('Get an assigned verifier server')
  .option('--chain-id <chainId>', 'Chain ID', 'AELF')
  .action(async (opts) => {
    try {
      const config = getConfig({ network: program.opts().network });
      outputSuccess(await getVerifierServer(config, { chainId: opts.chainId }));
    } catch (err: any) { outputError(err.message); }
  });

program.command('send-code')
  .description('Send verification code to email')
  .requiredOption('--email <email>', 'Email address')
  .requiredOption('--verifier-id <id>', 'Verifier service ID')
  .option('--chain-id <chainId>', 'Chain ID', 'AELF')
  .option('--operation <type>', 'Operation type: register|recovery', 'register')
  .action(async (opts) => {
    try {
      const config = getConfig({ network: program.opts().network });
      const opMap: Record<string, OperationType> = {
        register: OperationType.CreateCAHolder,
        recovery: OperationType.SocialRecovery,
      };
      outputSuccess(await sendVerificationCode(config, {
        email: opts.email, verifierId: opts.verifierId,
        chainId: opts.chainId, operationType: opMap[opts.operation] ?? OperationType.CreateCAHolder,
      }));
    } catch (err: any) { outputError(err.message); }
  });

program.command('verify-code')
  .description('Verify a 6-digit code')
  .requiredOption('--email <email>', 'Email address')
  .requiredOption('--code <code>', '6-digit verification code')
  .requiredOption('--verifier-id <id>', 'Verifier service ID')
  .requiredOption('--session-id <id>', 'Verifier session ID')
  .option('--chain-id <chainId>', 'Chain ID', 'AELF')
  .option('--operation <type>', 'Operation type: register|recovery', 'register')
  .action(async (opts) => {
    try {
      const config = getConfig({ network: program.opts().network });
      const opMap: Record<string, OperationType> = {
        register: OperationType.CreateCAHolder,
        recovery: OperationType.SocialRecovery,
      };
      outputSuccess(await verifyCode(config, {
        email: opts.email, verificationCode: opts.code,
        verifierId: opts.verifierId, verifierSessionId: opts.sessionId,
        chainId: opts.chainId, operationType: opMap[opts.operation] ?? OperationType.CreateCAHolder,
      }));
    } catch (err: any) { outputError(err.message); }
  });

program.command('create-wallet')
  .description('Create a new manager wallet')
  .action(() => {
    try {
      outputSuccess(createWallet());
    } catch (err: any) { outputError(err.message); }
  });

program.command('register')
  .description('Register a new CA wallet')
  .requiredOption('--email <email>', 'Email address')
  .requiredOption('--manager <addr>', 'Manager wallet address')
  .requiredOption('--verifier-id <id>', 'Verifier service ID')
  .requiredOption('--verification-doc <doc>', 'Verification document')
  .requiredOption('--signature <sig>', 'Verifier signature')
  .option('--chain-id <chainId>', 'Chain ID', 'AELF')
  .action(async (opts) => {
    try {
      const config = getConfig({ network: program.opts().network });
      outputSuccess(await registerWallet(config, {
        email: opts.email, manager: opts.manager,
        verifierId: opts.verifierId, verificationDoc: opts.verificationDoc,
        signature: opts.signature, chainId: opts.chainId,
      }));
    } catch (err: any) { outputError(err.message); }
  });

program.command('recover')
  .description('Recover (login) an existing CA wallet')
  .requiredOption('--email <email>', 'Email address')
  .requiredOption('--manager <addr>', 'New manager wallet address')
  .requiredOption('--guardians-approved <json>', 'JSON array of approved guardians')
  .option('--chain-id <chainId>', 'Chain ID', 'AELF')
  .action(async (opts) => {
    try {
      const config = getConfig({ network: program.opts().network });
      outputSuccess(await recoverWallet(config, {
        email: opts.email, manager: opts.manager,
        guardiansApproved: safeJsonParse(opts.guardiansApproved, 'guardians-approved') as any, chainId: opts.chainId,
      }));
    } catch (err: any) { outputError(err.message); }
  });

program.command('check-status')
  .description('Check registration or recovery status')
  .requiredOption('--session-id <id>', 'Session ID')
  .requiredOption('--type <type>', 'register or recovery')
  .action(async (opts) => {
    try {
      const config = getConfig({ network: program.opts().network });
      outputSuccess(await checkRegisterOrRecoveryStatus(config, {
        sessionId: opts.sessionId, type: opts.type,
      }));
    } catch (err: any) { outputError(err.message); }
  });

program.command('save-keystore')
  .description('Encrypt and save Manager wallet to keystore file')
  .requiredOption('--password <pwd>', 'Password to encrypt')
  .requiredOption('--private-key <key>', 'Manager private key (hex)')
  .requiredOption('--mnemonic <words>', 'Manager mnemonic')
  .requiredOption('--ca-hash <hash>', 'CA hash')
  .requiredOption('--ca-address <addr>', 'CA address')
  .option('--origin-chain-id <chainId>', 'Origin chain ID', 'AELF')
  .action(async (opts) => {
    try {
      outputSuccess(saveKeystore({
        password: opts.password, privateKey: opts.privateKey, mnemonic: opts.mnemonic,
        caHash: opts.caHash, caAddress: opts.caAddress,
        originChainId: opts.originChainId, network: program.opts().network || 'mainnet',
      }));
    } catch (err: any) { outputError(err.message); }
  });

program.command('unlock')
  .description('Unlock the encrypted keystore with a password')
  .requiredOption('--password <pwd>', 'Keystore password')
  .action(async (opts) => {
    try {
      outputSuccess(unlockWallet(opts.password, program.opts().network || 'mainnet'));
    } catch (err: any) { outputError(err.message); }
  });

program.command('lock')
  .description('Lock the wallet (clear private key from memory)')
  .action(async () => {
    try {
      outputSuccess(lockWallet());
    } catch (err: any) { outputError(err.message); }
  });

program.command('wallet-status')
  .description('Check wallet status (keystore exists, unlocked, CA info)')
  .action(async () => {
    try {
      outputSuccess(getWalletStatus(program.opts().network || 'mainnet'));
    } catch (err: any) { outputError(err.message); }
  });

program.parse();
