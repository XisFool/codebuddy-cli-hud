'use strict';

const fs = require('fs');
const path = require('path');
const { getSettingsPath, getCacheStatePath, getCreditStatePath } = require('./paths');

function uninstall() {
  const settingsPath = getSettingsPath();
  const backupPath = settingsPath + '.bak.codebuddy-hud';
  const cachePath = getCacheStatePath();
  const creditPath = getCreditStatePath();
  const hudBin = path.join(__dirname, 'bin', 'codebuddy-hud.js');
  const cmdShim = hudBin.replace(/\.js$/, '.cmd');

  let cleaned = [];

  // Restore backup or remove statusLine
  try {
    if (fs.existsSync(backupPath)) {
      const backup = fs.readFileSync(backupPath, 'utf8');
      fs.writeFileSync(settingsPath, backup);
      fs.unlinkSync(backupPath);
      cleaned.push(`Restored settings from backup: ${backupPath}`);
    } else {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (settings.statusLine && settings.statusLine.command && settings.statusLine.command.includes('codebuddy-hud')) {
        delete settings.statusLine;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        cleaned.push('Removed statusLine from settings.json');
      }
    }
  } catch {
    cleaned.push('Warning: could not modify settings.json');
  }

  // Remove .cmd shim
  try {
    if (fs.existsSync(cmdShim)) {
      fs.unlinkSync(cmdShim);
      cleaned.push(`Removed Windows shim: ${cmdShim}`);
    }
  } catch {
    cleaned.push('Warning: could not remove .cmd shim');
  }

  // Remove cache state
  try {
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
      cleaned.push(`Removed cache state: ${cachePath}`);
    }
  } catch {
    // ignore
  }

  try {
    if (fs.existsSync(creditPath)) {
      fs.unlinkSync(creditPath);
      cleaned.push(`Removed credit state: ${creditPath}`);
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
