#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { parseCodeBuddyInput } = require('../parser');
const { loadConfig } = require('../config');
const { renderHUD } = require('../renderer');
const { getErrorLogPath } = require('../paths');

const TIMEOUT_MS = 1500;

function logError(err) {
  try {
    const logPath = getErrorLogPath();
    const ts = new Date().toISOString();
    const msg = `[${ts}] ${err && err.stack ? err.stack : String(err)}\n`;
    fs.appendFileSync(logPath, msg);
  } catch {
    // silently fail — never block exit
  }
}

function handleRender(rawStdin) {
  try {
    const cbData = parseCodeBuddyInput(rawStdin);
    const cwd = cbData && (cbData.cwd || (cbData.workspace && cbData.workspace.current_dir)) || process.cwd();
    const config = loadConfig(cwd);
    const output = renderHUD(cbData, config);
    if (output) {
      process.stdout.write(output + '\n');
    }
  } catch (err) {
    logError(err);
  }
  process.exit(0);
}

// CLI subcommands
const args = process.argv.slice(2);
if (args.includes('--setup')) {
  require('../statusline-installer').setup();
  process.exit(0);
}
if (args.includes('--uninstall')) {
  require('../uninstall').uninstall();
  process.exit(0);
}
if (args.includes('--status')) {
  const samplePayload = JSON.stringify({
    model: { id: 'gpt-5.5', display_name: 'GPT-5.5' },
    permission_mode: 'default',
    cwd: process.cwd(),
    version: '0.1.0',
    cost: { total_cost_usd: 0, total_duration_ms: 60000, total_api_duration_ms: 45000, total_lines_added: 42, total_lines_removed: 3 },
    context_window: { total_input_tokens: 50000, total_output_tokens: 2000, context_window_size: 1000000, used_percentage: 5.2, current_usage: { input_tokens: 50000, output_tokens: 2000, cache_read_input_tokens: 30000, cache_creation_input_tokens: 0 } },
  });
  handleRender(samplePayload);
  process.exit(0);
}

// Normal statusLine mode: read stdin
const MAX_STDIN_SIZE = 1024 * 1024;
let stdinChunks = [];
let totalStdinSize = 0;
let handled = false;

const timer = setTimeout(() => {
  if (!handled) {
    handled = true;
    handleRender(stdinChunks.join(''));
  }
}, TIMEOUT_MS);

process.stdin.on('data', (chunk) => {
  totalStdinSize += chunk.length;
  if (totalStdinSize > MAX_STDIN_SIZE) {
    handled = true;
    clearTimeout(timer);
    handleRender('');
    process.stdin.destroy();
    return;
  }
  stdinChunks.push(chunk.toString());
});

process.stdin.on('end', () => {
  if (!handled) {
    handled = true;
    clearTimeout(timer);
    handleRender(stdinChunks.join(''));
  }
});

process.stdin.on('error', () => {
  if (!handled) {
    handled = true;
    clearTimeout(timer);
    handleRender('');
  }
});

process.stdin.resume();
