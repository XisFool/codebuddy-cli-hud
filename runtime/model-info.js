'use strict';

const fs = require('fs');
const path = require('path');
const { getSettingsPath, resolveCodeBuddyPath } = require('./paths');

let _cachedSettingsEffort = null;
let _cachedSettingsEffortTime = 0;
let _cachedModelCreditsMap = null;

function getSettingsReasoningEffort() {
  const now = Date.now();
  if (_cachedSettingsEffort !== null && now - _cachedSettingsEffortTime < 5000) {
    return _cachedSettingsEffort;
  }
  _cachedSettingsEffortTime = now;
  try {
    const settingsPath = getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      _cachedSettingsEffort = data.reasoningEffort || null;
      return _cachedSettingsEffort;
    }
  } catch {
    // ignore
  }
  _cachedSettingsEffort = null;
  return null;
}

function loadModelCreditsMap() {
  if (_cachedModelCreditsMap !== null) {
    return _cachedModelCreditsMap;
  }
  _cachedModelCreditsMap = {};
  try {
    const localStorageDir = resolveCodeBuddyPath('local_storage');
    if (fs.existsSync(localStorageDir)) {
      const files = fs.readdirSync(localStorageDir);
      for (const file of files) {
        if (file.endsWith('.info')) {
          try {
            const raw = fs.readFileSync(path.join(localStorageDir, file), 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data.models)) {
              for (const m of data.models) {
                if (m.id && m.credits) {
                  // e.g. "x0.00 credits" -> "0.00x credits"
                  const match = m.credits.match(/x?([\d.]+)\s*credits?/i);
                  if (match) {
                    _cachedModelCreditsMap[m.id.toLowerCase()] = `${parseFloat(match[1]).toFixed(2)}x credits`;
                  } else {
                    _cachedModelCreditsMap[m.id.toLowerCase()] = m.credits;
                  }
                }
              }
            }
          } catch {
            // ignore malformed entry
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return _cachedModelCreditsMap;
}

const MODEL_EFFORT_MAP = [
  { pattern: /\bo[13]\b/i, effort: 'max' },
  { pattern: /\bo4-mini\b/i, effort: 'high' },
  { pattern: /\bgpt-?5/i, effort: 'high' },
  { pattern: /\bgpt-?4o?\b/i, effort: 'medium' },
  { pattern: /\bclaude.*sonnet/i, effort: 'high' },
  { pattern: /\bclaude.*opus/i, effort: 'max' },
  { pattern: /\bclaude.*haiku/i, effort: 'medium' },
  { pattern: /\bgemini.*pro/i, effort: 'high' },
  { pattern: /\bgemini.*flash/i, effort: 'medium' },
  { pattern: /\bdeepseek.*r1/i, effort: 'max' },
  { pattern: /\bdeepseek/i, effort: 'medium' },
];

function inferEffortFromModel(cbData) {
  const modelId = (cbData && cbData.model && (cbData.model.id || cbData.model.display_name)) || '';
  if (!modelId) return null;
  for (const entry of MODEL_EFFORT_MAP) {
    if (entry.pattern.test(modelId)) return entry.effort;
  }
  return null;
}

/**
 * Resolve model thinking/effort level (low, medium, high, max).
 * @param {object} cbData
 * @param {object} [config]
 * @returns {string|null}
 */
function resolveEffortLevel(cbData, config) {
  if (!cbData) return null;

  if (cbData.reasoning_effort) return String(cbData.reasoning_effort).toLowerCase();
  if (cbData.model && cbData.model.effort) return String(cbData.model.effort).toLowerCase();
  if (cbData.model && cbData.model.reasoning_effort) return String(cbData.model.reasoning_effort).toLowerCase();

  const settingsEffort = getSettingsReasoningEffort();
  if (settingsEffort) return String(settingsEffort).toLowerCase();

  const inferred = inferEffortFromModel(cbData);
  if (inferred) return inferred;

  if (config && config.defaultEffortLevel) return String(config.defaultEffortLevel).toLowerCase();

  return null;
}

/**
 * Resolve credits display string for model.
 * @param {object} cbData
 * @param {number} totalCostUsd
 * @returns {string|null}
 */
function resolveCredits(cbData, totalCostUsd) {
  if (totalCostUsd && totalCostUsd > 0) {
    return `$${totalCostUsd.toFixed(2)}`;
  }

  if (cbData && cbData.cost && cbData.cost.credits) {
    const val = Number(cbData.cost.credits);
    return Number.isFinite(val) ? `${val.toFixed(2)}x credits` : String(cbData.cost.credits);
  }

  const modelId = (cbData && cbData.model && (cbData.model.id || cbData.model.display_name)) || '';
  if (modelId) {
    const map = loadModelCreditsMap();
    const credits = map[modelId.toLowerCase()];
    if (credits) return credits;
  }

  return '0.00x credits';
}

function resetModelInfoCache() {
  _cachedSettingsEffort = null;
  _cachedSettingsEffortTime = 0;
  _cachedModelCreditsMap = null;
}

module.exports = {
  resolveEffortLevel,
  resolveCredits,
  resetModelInfoCache,
};
