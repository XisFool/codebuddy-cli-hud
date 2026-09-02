'use strict';

const fs = require('fs');
const path = require('path');
const { getSettingsPath } = require('./paths');
const { sanitizeTerminalText } = require('./sanitize');

// Escape characters that stay special inside a double-quoted shell word.
// Backslash must be escaped first, otherwise the backslashes added by the
// later replacements would themselves be escaped again.
function escapeShellArg(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');
}

function buildStatusLineCommand(platform, hudBin, nodeExe) {
  if (platform === 'win32') {
    // The host runs this through cmd; the generated .cmd shim handles quoting.
    return `"${String(hudBin).replace(/\.js$/, '.cmd')}"`;
  }
  return `"${escapeShellArg(nodeExe)}" "${escapeShellArg(hudBin)}"`;
}

// The shim bakes the absolute node path captured at setup time instead of a
// bare `node`: the host may invoke the statusLine with a PATH that differs
// from the user's shell (nvm/fnm/volta installs, GUI-spawned processes), where
// `node` silently resolves to nothing and the HUD renders blank. `%` is
// batch-escaped to `%%` — cmd.exe collapses it back to a literal percent at
// parse time, so a node install under a %-containing directory still resolves.
function buildCmdShimContent(nodeExe) {
  return '@echo off\r\n"' + String(nodeExe).replace(/%/g, '%%') + '" "%~dp0codebuddy-hud.js" %*\r\n';
}

function isSettingsObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Options are intentionally internal/test-oriented. The CLI uses the defaults,
// while an isolated runtime lets regression tests exercise installation without
// writing a generated shim beside the checked-out source.
function setup(options) {
  const opts = options || {};
  const settingsPath = opts.settingsPath || getSettingsPath();
  const hudBin = opts.hudBin || path.join(opts.runtimeDir || __dirname, 'bin', 'codebuddy-hud.js');
  const nodeExe = opts.nodeExe || process.execPath;
  const platform = opts.platform || process.platform;

  let settings = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (isSettingsObject(parsed)) settings = parsed;
  } catch {
    // file doesn't exist or is invalid — start fresh
  }

  if (opts.theme) {
    try {
      const { saveUserTheme } = require('./theme-selector');
      saveUserTheme(opts.theme);
    } catch {
      // ignore
    }
  }


  // Backup existing statusLine
  if (settings.statusLine) {
    const backupPath = settingsPath + '.bak.codebuddy-hud';
    // Keep the first pre-install snapshot intact. Re-running setup is common
    // after a Node upgrade; overwriting this file with our own statusLine
    // would make a later uninstall restore the generated configuration rather
    // than the user's original settings.
    if (!fs.existsSync(backupPath)) {
      try {
        fs.writeFileSync(backupPath, JSON.stringify(settings, null, 2));
        console.log(`Backed up existing settings to: ${sanitizeTerminalText(backupPath, 512)}`);
      } catch (err) {
        console.error(`Warning: could not create backup: ${sanitizeTerminalText(err && err.message, 160)}`);
      }
    }
  }

  // Build command string
  let command;
  if (platform === 'win32') {
    const cmdShim = hudBin.replace(/\.js$/, '.cmd');
    const shimContent = buildCmdShimContent(nodeExe);
    try {
      fs.writeFileSync(cmdShim, shimContent);
      console.log(`Created Windows shim: ${sanitizeTerminalText(cmdShim, 512)}`);
    } catch (err) {
      console.error(`Warning: could not create .cmd shim: ${sanitizeTerminalText(err && err.message, 160)}`);
    }
  } else {
    // The command runs `node <file>`, so the executable bit is not required;
    // chmod only makes the shebang'd script directly runnable by hand.
    try {
      fs.chmodSync(hudBin, 0o755);
    } catch {
      // read-only filesystem or missing file — setup must not fail on this
    }
  }
  command = buildStatusLineCommand(platform, hudBin, nodeExe);

  settings.statusLine = {
    type: 'command',
    command: command,
    padding: 0,
  };

  const settingsDir = path.dirname(settingsPath);
  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log(`\nStatusLine configured in: ${sanitizeTerminalText(settingsPath, 512)}`);
  console.log(`Command: ${sanitizeTerminalText(command, 1024)}`);
  console.log('\ncodebuddy-cli-hud setup complete.');
}

module.exports = { setup, buildStatusLineCommand, buildCmdShimContent };
