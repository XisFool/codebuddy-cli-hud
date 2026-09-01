// Integration tests for the entry point: every path must exit 0 with clean
// stderr. The EPIPE case is the load-bearing one — see the handler comment in
// runtime/bin/codebuddy-hud.js (the natural-drain exit rework unmasked an
// unhandled stdout 'error' that used to be hidden by process.exit()).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BIN = fileURLToPath(new URL('../../runtime/bin/codebuddy-hud.js', import.meta.url));
const payload = JSON.stringify({
  model: { display_name: 'Hy4', id: 'hy4' },
  cwd: 'D:/code_sum/Github/codebuddy-cli-hud',
  context_window: { context_window_size: 1000000, used_percentage: 18, current_usage: { input_tokens: 170219, output_tokens: 4600 } },
});

function run({ destroyStdoutEarly = false, input = null } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.stdin.on('error', () => {});
    if (destroyStdoutEarly) child.stdout.destroy(); // race the child's first write
    if (input !== null) { child.stdin.write(input); child.stdin.end(); }
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

test('renders from stdin and exits 0 with clean stderr', async () => {
  const r = await run({ input: payload });
  assert.equal(r.code, 0);
  assert.ok(r.out.length > 0);
  assert.equal(r.err, '');
});

test('exits 0 when stdout is closed early (EPIPE race must not crash)', async () => {
  const r = await run({ input: payload, destroyStdoutEarly: true });
  assert.equal(r.code, 0, 'unhandled EPIPE crashed the process; stderr: ' + r.err);
  assert.equal(r.err, '');
});

test('garbage stdin degrades silently to exit 0', async () => {
  const r = await run({ input: 'not json at all {{{' });
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
  assert.equal(r.err, '');
});

test('--status renders and exits 0', async () => {
  const child = spawn(process.execPath, [BIN, '--status'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  await new Promise((resolve) => child.on('close', (code) => {
    assert.equal(code, 0);
    assert.ok(out.trim().length > 0);
    assert.equal(err, '');
    resolve();
  }));
});
