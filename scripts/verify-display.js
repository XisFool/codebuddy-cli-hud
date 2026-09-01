#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, '..', 'tests', 'fixtures');
const HUD_BIN = path.join(__dirname, '..', 'runtime', 'bin', 'codebuddy-hud.js');
const MAX_TIME_MS = 1500;

const fixtures = [
  'payload-full.json',
  'payload-minimal.json',
  'payload-with-agents.json',
  'payload-empty-cost.json',
];

let passed = 0;
let failed = 0;

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*?(?:\x07|\x1b\\|$)/g, '');
}

function spawnHud(payloadStr) {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(process.execPath, [HUD_BIN], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CODEBUDDY_HUD_FORCE_ASCII: '1' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr, elapsed: Date.now() - start });
    });

    if (payloadStr !== null) child.stdin.write(payloadStr);
    child.stdin.end();
  });
}

function checkInvariants(result, label) {
  const clean = stripAnsi(result.stdout).trim();
  const lines = clean ? clean.split('\n') : [];
  const errors = [];

  if (result.code !== 0) errors.push(`exit code ${result.code}`);
  if (result.elapsed > MAX_TIME_MS) errors.push(`took ${result.elapsed}ms (>${MAX_TIME_MS}ms)`);
  if (!clean) errors.push('empty output');
  if (lines.length > 4) errors.push(`${lines.length} lines (>4)`);
  if (result.stderr.trim()) errors.push(`stderr: ${result.stderr.trim().slice(0, 100)}`);

  return { clean, lines, errors };
}

async function main() {
  console.log('=== codebuddy-cli-hud E2E Verification ===\n');

  for (const fixture of fixtures) {
    const fixturePath = path.join(FIXTURES_DIR, fixture);
    const payload = fs.readFileSync(fixturePath, 'utf8');
    const result = await spawnHud(payload);
    const { clean, lines, errors } = checkInvariants(result, fixture);

    if (errors.length === 0) {
      console.log(`  PASS  ${fixture} (${result.elapsed}ms, ${lines.length} lines)`);
      passed++;
    } else {
      console.log(`  FAIL  ${fixture}: ${errors.join(', ')}`);
      failed++;
    }
    void clean;
  }

  // Edge case: empty stdin
  const emptyResult = await spawnHud(null);
  if (emptyResult.code === 0) {
    console.log(`  PASS  empty-stdin (${emptyResult.elapsed}ms, graceful)`);
    passed++;
  } else {
    console.log(`  FAIL  empty-stdin: exit code ${emptyResult.code}`);
    failed++;
  }

  // Tool activity: real temp transcript with a pending function_call
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cbhud-e2e-'));
  try {
    const transcriptPath = path.join(tmpDir, 'transcript.jsonl');
    const call = JSON.stringify({
      type: 'function_call', callId: 'call-e2e', name: 'Edit',
      arguments: JSON.stringify({ file_path: '/proj/verify.ts' }), sessionId: 's',
    });
    fs.writeFileSync(transcriptPath, call + '\n');

    const basePayload = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'payload-full.json'), 'utf8'));
    basePayload.transcript_path = transcriptPath;
    const result = await spawnHud(JSON.stringify(basePayload));
    const { clean, lines, errors } = checkInvariants(result, 'tool-activity');
    if (!clean.includes('Edit')) errors.push('tool segment missing (expected "Edit")');

    if (errors.length === 0) {
      console.log(`  PASS  tool-activity (${result.elapsed}ms, ${lines.length} lines, tool segment rendered)`);
      passed++;
    } else {
      console.log(`  FAIL  tool-activity: ${errors.join(', ')}`);
      failed++;
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
