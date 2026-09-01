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

function deepMerge(target, source) {
  const result = Object.assign({}, target);
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
        && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
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
  let config = Object.assign({}, DEFAULT_CONFIG);

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
