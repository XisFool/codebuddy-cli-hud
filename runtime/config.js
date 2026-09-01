'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  theme: {
    primary: 'cyan',
    secondary: 'gray',
    warning: 'yellow',
    critical: 'red',
    accent: 'cyan',
    diffAdd: 'green',
    diffRemove: 'red',
    model: 'cyan',
    gitBranch: 'cyan',
  },
  display: {
    showTokenBar: true,
    showDiffStats: true,
    showAgentStatus: true,
    showCost: true,
    showDuration: true,
    showCurrentDir: true,
    showGitBranch: true,
    showVersion: false,
    showPermissionMode: true,
    useNerdFonts: false,
    unicode: 'auto',
    maxLines: 4,
    progressBarWidth: 10,
    showCacheHitRate: true,
    showToolActivity: true,
    toolActivityTailBytes: 16384,
  },
  thresholds: {
    warning: 0.7,
    critical: 0.9,
  },
  cacheHitThresholds: {
    excellent: 80,
    partial: 50,
  },
  defaultEffortLevel: 'medium',
  language: 'en',
  icons: {},
};

// Deep-merge `source` over `target`. Nested objects from BOTH sides are always
// cloned: the old version aliased `target`'s nested objects when `source` did
// not mention them, so mutating the merged config silently mutated the
// module-level DEFAULT_CONFIG (proven leak: merged.icons === DEFAULT_CONFIG.icons).
//
// `__proto__` keys are skipped: a hostile project config like
// {"__proto__":{...}} must not swap the merged object's [[Prototype]].
// Beyond MAX_MERGE_DEPTH the source subtree is taken as-is, so a pathologically
// deep config cannot blow the stack (degrades to that subtree replacing, not
// merging, the default — caught by design).
const MAX_MERGE_DEPTH = 64;

function deepMerge(target, source, depth) {
  const level = depth || 0;
  if (level > MAX_MERGE_DEPTH) return source;
  const result = {};
  const keys = new Set(Object.keys(target).concat(Object.keys(source)));
  for (const key of keys) {
    if (key === '__proto__') continue;
    const t = target[key];
    const s = source[key];
    const tObj = t !== null && typeof t === 'object' && !Array.isArray(t);
    const sObj = s !== null && typeof s === 'object' && !Array.isArray(s);
    if (tObj || sObj) {
      result[key] = deepMerge(tObj ? t : {}, sObj ? s : {}, level + 1);
    } else if (Array.isArray(s)) {
      result[key] = s.slice();
    } else if (s !== undefined) {
      result[key] = s;
    } else if (Array.isArray(t)) {
      result[key] = t.slice();
    } else {
      result[key] = t;
    }
  }
  return result;
}

function loadJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function loadConfig(cwd) {
  // deepMerge({}, …) clones DEFAULT_CONFIG deeply so a partial override can
  // never alias module-level defaults back to the caller
  let config = deepMerge({}, DEFAULT_CONFIG);

  const shippedConfigPath = path.join(__dirname, 'codebuddy-hud.config.json');
  const shipped = loadJsonFile(shippedConfigPath);
  if (shipped) config = deepMerge(config, shipped);

  if (cwd) {
    const projectConfigPath = path.join(cwd, 'codebuddy-hud.config.json');
    const project = loadJsonFile(projectConfigPath);
    if (project) config = deepMerge(config, project);
  }

  return config;
}

module.exports = { loadConfig, deepMerge, DEFAULT_CONFIG };
