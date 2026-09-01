'use strict';

const fs = require('fs');
const path = require('path');
const { getSettingsPath, getCacheStatePath, getCreditStatePath, getTranscriptUsageStateDir } = require('./paths');
const { sanitizeTerminalText } = require('./sanitize');

function uninstall(options) {
  const opts = options || {};
  const settingsPath = opts.settingsPath || getSettingsPath();
  const backupPath = settingsPath + '.bak.codebuddy-hud';
  const cachePath = getCacheStatePath();
  const creditPath = getCreditStatePath();
  const usageStateDir = getTranscriptUsageStateDir();
  const hudBin = opts.hudBin || path.join(opts.runtimeDir || __dirname, 'bin', 'codebuddy-hud.js');
  const cmdShim = hudBin.replace(/\.js$/, '.cmd');
  const platform = opts.platform || process.platform;

  let cleaned = [];

  // Restore backup or remove statusLine
  try {
    if (fs.existsSync(backupPath)) {
      const backup = fs.readFileSync(backupPath, 'utf8');
      fs.writeFileSync(settingsPath, backup);
      fs.unlinkSync(backupPath);
      cleaned.push(`Restored settings from backup: ${sanitizeTerminalText(backupPath, 512)}`);
    } else {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (settings.statusLine && typeof settings.statusLine.command === 'string' && settings.statusLine.command.includes('codebuddy-hud')) {
        delete settings.statusLine;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        cleaned.push('Removed statusLine from settings.json');
      }
    }
  } catch {
    cleaned.push('Warning: could not modify settings.json');
  }

  // A POSIX install never creates a .cmd shim. Avoid deleting an unrelated
  // Windows artifact merely because a checkout is shared through WSL.
  if (platform === 'win32') {
    try {
      if (fs.existsSync(cmdShim)) {
        fs.unlinkSync(cmdShim);
        cleaned.push(`Removed Windows shim: ${sanitizeTerminalText(cmdShim, 512)}`);
      }
    } catch {
      cleaned.push('Warning: could not remove .cmd shim');
    }
  }

  // Remove cache state
  try {
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
      cleaned.push(`Removed cache state: ${sanitizeTerminalText(cachePath, 512)}`);
    }
  } catch {
    // ignore
  }

  try {
    if (fs.existsSync(usageStateDir)) {
      fs.rmSync(usageStateDir, { recursive: true, force: true });
      cleaned.push(`Removed transcript usage state: ${sanitizeTerminalText(usageStateDir, 512)}`);
    }
  } catch {
    // ignore
  }

  try {
    if (fs.existsSync(creditPath)) {
      fs.unlinkSync(creditPath);
      cleaned.push(`Removed credit state: ${sanitizeTerminalText(creditPath, 512)}`);
    }
  } catch {
    // ignore
  }

  if (cleaned.length === 0) {
    console.log('Nothing to uninstall.');
  } else {
    console.log('codebuddy-cli-hud uninstalled:');
    for (const msg of cleaned) {
      console.log(`  - ${msg}`);
    }
  }
}

module.exports = { uninstall };
