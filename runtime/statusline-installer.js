'use strict';

const fs = require('fs');
const path = require('path');
const { getSettingsPath } = require('./paths');

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

function setup() {
  const settingsPath = getSettingsPath();
  const hudBin = path.join(__dirname, 'bin', 'codebuddy-hud.js');
  const nodeExe = process.execPath;

  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    // file doesn't exist or is invalid — start fresh
  }

  // Backup existing statusLine
  if (settings.statusLine) {
    const backupPath = settingsPath + '.bak.codebuddy-hud';
    try {
      fs.writeFileSync(backupPath, JSON.stringify(settings, null, 2));
      console.log(`Backed up existing settings to: ${backupPath}`);
    } catch (err) {
      console.error(`Warning: could not create backup: ${err.message}`);
    }
  }

  // Build command string
  let command;
  if (process.platform === 'win32') {
    const cmdShim = hudBin.replace(/\.js$/, '.cmd');
    const shimContent = '@echo off\r\nnode "%~dp0codebuddy-hud.js" %*\r\n';
    try {
      fs.writeFileSync(cmdShim, shimContent);
      console.log(`Created Windows shim: ${cmdShim}`);
    } catch (err) {
      console.error(`Warning: could not create .cmd shim: ${err.message}`);
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
  command = buildStatusLineCommand(process.platform, hudBin, nodeExe);

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
  console.log(`\nStatusLine configured in: ${settingsPath}`);
  console.log(`Command: ${command}`);
  console.log('\ncodebuddy-cli-hud setup complete.');
}

module.exports = { setup, buildStatusLineCommand };
