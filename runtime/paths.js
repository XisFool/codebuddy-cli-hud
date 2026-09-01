'use strict';

const path = require('path');
const os = require('os');
const crypto = require('crypto');

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

function getCreditStatePath() {
  return resolveCodeBuddyPath('codebuddy-hud-credit-state.json');
}

function getTranscriptUsageStateDir() {
  return resolveCodeBuddyPath('codebuddy-hud-usage-state');
}

// Keep usage checkpoints independent for each transcript. The HUD is spawned
// by the host for every refresh and multiple workspaces may refresh at once;
// a single shared checkpoint would allow one transcript to overwrite another.
function getTranscriptUsageStatePath(transcriptPath) {
  const normalized = typeof transcriptPath === 'string' ? path.resolve(transcriptPath) : '';
  const digest = crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
  return path.join(getTranscriptUsageStateDir(), `${digest}.json`);
}

module.exports = {
  getCodeBuddyHome,
  resolveCodeBuddyPath,
  getSettingsPath,
  getErrorLogPath,
  getCacheStatePath,
  getCreditStatePath,
  getTranscriptUsageStateDir,
  getTranscriptUsageStatePath,
};
