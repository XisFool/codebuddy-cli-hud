'use strict';

const path = require('path');
const os = require('os');

function getCodeBuddyHome() {
  return process.env.CODEBUDDY_HOME || path.join(os.homedir(), '.codebuddy');
}

function resolveCodeBuddyPath(...segments) {
  return path.join(getCodeBuddyHome(), ...segments);
}

function getSettingsPath() {
  return process.env.CODEBUDDY_SETTINGS_PATH || resolveCodeBuddyPath('settings.json');
}

function getErrorLogPath() {
  return resolveCodeBuddyPath('codebuddy-hud-error.log');
}

function getCacheStatePath() {
  return resolveCodeBuddyPath('codebuddy-hud-cache-state.json');
}

module.exports = {
  getCodeBuddyHome,
  resolveCodeBuddyPath,
  getSettingsPath,
  getErrorLogPath,
  getCacheStatePath,
};
