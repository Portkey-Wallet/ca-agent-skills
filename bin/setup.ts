#!/usr/bin/env bun
import { Command } from 'commander';
import * as fs from 'fs';
import { setupClaude } from './platforms/claude.js';
import { setupCursor } from './platforms/cursor.js';
import { setupOpenClaw } from './platforms/openclaw.js';
import {
  getPlatformPaths,
  readJsonFile,
  writeJsonFile,
  SERVER_NAME,
} from './platforms/utils.js';

const program = new Command();
program
  .name('portkey-setup')
  .version('1.0.0')
  .description('Configure Portkey Agent Skills for AI platforms');

// ---------------------------------------------------------------------------
// claude
// ---------------------------------------------------------------------------
program
  .command('claude')
  .description('Setup for Claude Desktop')
  .option('--config-path <path>', 'Custom config file path')
  .option('--server-path <path>', 'Custom MCP server path')
  .option('--force', 'Overwrite existing entry')
  .action((opts) => {
    setupClaude({
      configPath: opts.configPath,
      serverPath: opts.serverPath,
      force: opts.force,
    });
  });

// ---------------------------------------------------------------------------
// cursor
// ---------------------------------------------------------------------------
program
  .command('cursor')
  .description('Setup for Cursor IDE')
  .option('--global', 'Global config instead of project-level')
  .option('--config-path <path>', 'Custom config file path')
  .option('--server-path <path>', 'Custom MCP server path')
  .option('--force', 'Overwrite existing entry')
  .action((opts) => {
    setupCursor({
      configPath: opts.configPath,
      serverPath: opts.serverPath,
      force: opts.force,
      global: opts.global,
    });
  });

// ---------------------------------------------------------------------------
// openclaw
// ---------------------------------------------------------------------------
program
  .command('openclaw')
  .description('Generate or merge OpenClaw config')
  .option('--config-path <path>', 'Merge into existing OpenClaw config')
  .option('--cwd <dir>', 'Override working directory')
  .option('--force', 'Overwrite existing entries')
  .action((opts) => {
    setupOpenClaw({
      configPath: opts.configPath,
      cwd: opts.cwd,
      force: opts.force,
    });
  });

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------
program
  .command('list')
  .description('Check configuration status across platforms')
  .action(() => {
    const paths = getPlatformPaths();

    console.log('Portkey Agent Skills — Configuration Status\n');

    const checks = [
      { name: 'Claude Desktop', path: paths.claude },
      { name: 'Cursor (global)', path: paths.cursorGlobal },
      { name: 'Cursor (project)', path: paths.cursorProject },
    ];

    for (const { name, path: configPath } of checks) {
      const exists = fs.existsSync(configPath);
      if (!exists) {
        console.log(`  ${name}: [NOT FOUND] ${configPath}`);
        continue;
      }
      const config = readJsonFile(configPath);
      const servers = config.mcpServers as Record<string, unknown> | undefined;
      const hasPortkey = servers && SERVER_NAME in servers;
      console.log(
        `  ${name}: ${hasPortkey ? '[CONFIGURED]' : '[EXISTS, NOT CONFIGURED]'} ${configPath}`,
      );
    }
    console.log('');
  });

// ---------------------------------------------------------------------------
// uninstall
// ---------------------------------------------------------------------------
program
  .command('uninstall <platform>')
  .description('Remove Portkey config from a platform (claude, cursor)')
  .option('--global', 'Target global Cursor config')
  .option('--config-path <path>', 'Custom config file path')
  .action((platform, opts) => {
    const paths = getPlatformPaths();

    let configPath: string;
    if (opts.configPath) {
      configPath = opts.configPath;
    } else if (platform === 'claude') {
      configPath = paths.claude;
    } else if (platform === 'cursor') {
      configPath = opts.global ? paths.cursorGlobal : paths.cursorProject;
    } else {
      console.error(`[ERROR] Unknown platform: ${platform}. Use "claude" or "cursor".`);
      process.exit(1);
    }

    if (!fs.existsSync(configPath)) {
      console.log(`[SKIP] Config not found: ${configPath}`);
      return;
    }

    const config = readJsonFile(configPath);
    const servers = config.mcpServers as Record<string, unknown> | undefined;

    if (!servers || !(SERVER_NAME in servers)) {
      console.log(`[SKIP] "${SERVER_NAME}" not found in ${configPath}`);
      return;
    }

    delete servers[SERVER_NAME];
    writeJsonFile(configPath, config);
    console.log(`[REMOVED] "${SERVER_NAME}" from ${configPath}`);
  });

program.parse();
