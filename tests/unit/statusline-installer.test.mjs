import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildStatusLineCommand, buildCmdShimContent } = require('../../runtime/statusline-installer.js');

// POSIX fixtures use forward slashes; win32 fixtures use C:\... style.
const POSIX_NODE = '/usr/bin/node';
const POSIX_HUD = '/opt/codebuddy-hud/runtime/bin/codebuddy-hud.js';

describe('buildStatusLineCommand', () => {
  test('is exported as a pure function (requiring the module writes nothing)', () => {
    assert.equal(typeof buildStatusLineCommand, 'function');
  });

  test('win32 -> quoted .cmd shim path, no .js left in the command', () => {
    const hudBin = 'C:\\Users\\me\\proj\\runtime\\bin\\codebuddy-hud.js';
    const command = buildStatusLineCommand('win32', hudBin, 'C:\\Program Files\\nodejs\\node.exe');

    assert.equal(command, '"C:\\Users\\me\\proj\\runtime\\bin\\codebuddy-hud.cmd"');
    assert.ok(!command.includes('.js'));
  });

  test('win32 does not add POSIX escaping', () => {
    const hudBin = 'C:\\my $weird`dir\\codebuddy-hud.js';
    const command = buildStatusLineCommand('win32', hudBin, 'C:\\node.exe');

    assert.equal(command, '"C:\\my $weird`dir\\codebuddy-hud.cmd"');
  });

  test('linux -> two double-quoted words separated by a space', () => {
    const command = buildStatusLineCommand('linux', POSIX_HUD, POSIX_NODE);

    assert.equal(command, '"/usr/bin/node" "/opt/codebuddy-hud/runtime/bin/codebuddy-hud.js"');
    assert.equal(command.split('" "').length, 2);
  });

  test('darwin -> same shape as linux', () => {
    const command = buildStatusLineCommand('darwin', POSIX_HUD, POSIX_NODE);

    assert.equal(command, '"/usr/bin/node" "/opt/codebuddy-hud/runtime/bin/codebuddy-hud.js"');
    assert.equal(command, buildStatusLineCommand('linux', POSIX_HUD, POSIX_NODE));
  });

  test('paths containing spaces stay quoted', () => {
    const node = '/opt/My Node/bin/node';
    const hud = '/opt/My Project/runtime/bin/codebuddy-hud.js';

    assert.equal(
      buildStatusLineCommand('linux', hud, node),
      '"/opt/My Node/bin/node" "/opt/My Project/runtime/bin/codebuddy-hud.js"'
    );
  });

  test('$ is escaped inside the quotes', () => {
    const hud = '/opt/my$dir/codebuddy-hud.js';

    assert.equal(
      buildStatusLineCommand('linux', hud, '/usr/$bin/node'),
      '"/usr/\\$bin/node" "/opt/my\\$dir/codebuddy-hud.js"'
    );
  });

  test('backtick is escaped inside the quotes', () => {
    const hud = '/opt/my`dir/codebuddy-hud.js';

    assert.equal(
      buildStatusLineCommand('linux', hud, POSIX_NODE),
      '"/usr/bin/node" "/opt/my\\`dir/codebuddy-hud.js"'
    );
  });

  test('double quote is escaped inside the quotes', () => {
    const hud = '/opt/my"dir/codebuddy-hud.js';

    assert.equal(
      buildStatusLineCommand('linux', hud, POSIX_NODE),
      '"/usr/bin/node" "/opt/my\\"dir/codebuddy-hud.js"'
    );
  });

  test('backslash is escaped inside the quotes', () => {
    const hud = 'C:\\Users\\me\\codebuddy-hud.js';

    assert.equal(
      buildStatusLineCommand('linux', hud, POSIX_NODE),
      '"/usr/bin/node" "C:\\\\Users\\\\me\\\\codebuddy-hud.js"'
    );
  });

  test('several special characters together are all escaped exactly once', () => {
    // real path: /opt/we ird$dir/`q"t\back/codebuddy-hud.js
    const hud = '/opt/we ird$dir/`q"t\\back/codebuddy-hud.js';

    assert.equal(
      buildStatusLineCommand('linux', hud, POSIX_NODE),
      '"/usr/bin/node" "/opt/we ird\\$dir/\\`q\\"t\\\\back/codebuddy-hud.js"'
    );
  });

  test('backslash added by escaping is not escaped again', () => {
    const hud = '/opt/a\\$b/codebuddy-hud.js';
    const command = buildStatusLineCommand('linux', hud, POSIX_NODE);

    assert.equal(command, '"/usr/bin/node" "/opt/a\\\\\\$b/codebuddy-hud.js"');
    assert.ok(!command.includes('\\\\\\\\'));
  });
});

describe('buildCmdShimContent', () => {
  test('bakes the absolute node path instead of relying on PATH', () => {
    const shim = buildCmdShimContent('C:\\Program Files\\nodejs\\node.exe');

    assert.equal(shim, '@echo off\r\n"C:\\Program Files\\nodejs\\node.exe" "%~dp0codebuddy-hud.js" %*\r\n');
    assert.ok(!/\r?\nnode /.test(shim), 'bare `node` must not appear');
  });

  test('handles a node path containing spaces via quoting', () => {
    const shim = buildCmdShimContent('D:\\My Tools\\node\\node.exe');

    assert.ok(shim.includes('"D:\\My Tools\\node\\node.exe"'));
  });

  test('uses CRLF line endings', () => {
    const shim = buildCmdShimContent('/usr/bin/node');

    assert.ok(shim.includes('\r\n'));
    assert.ok(!/[^\r]\n/.test(shim));
  });

  test('batch-escapes % in the node path so cmd.exe resolves it literally', () => {
    const shim = buildCmdShimContent('D:\\pct%var\\node.exe');

    assert.ok(shim.includes('"D:\\pct%%var\\node.exe"'), 'percent must be doubled in the shim');
    assert.ok(!shim.includes('pct%var'), 'single % would be eaten or expanded by cmd.exe');
  });
});
