'use strict';

const path = require('path');
const { execSync } = require('child_process');

/**
 * Get current git branch and dirty status with strict timeout and fallback.
 * @param {string} cwd Working directory
 * @param {number} timeoutMs Maximum time to wait in ms (default 200)
 * @returns {{ branch: string, dirty: boolean } | null}
 */
function getGitStatus(cwd, timeoutMs = 200) {
  if (!cwd || typeof cwd !== 'string' || cwd.includes('\0')) return null;

  const resolvedCwd = path.resolve(cwd);

  try {
    const execOpts = {
      cwd: resolvedCwd,
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
      env: Object.assign({}, process.env, { GIT_OPTIONAL_LOCKS: '0' }),
    };

    // 1. Get current branch or detached HEAD
    let branch = '';
    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', execOpts).trim();
    } catch {
      return null; // Not a git repository or git command missing
    }

    if (!branch || branch === 'HEAD') {
      // In detached HEAD state, get short commit hash
      try {
        branch = execSync('git rev-parse --short HEAD', execOpts).trim();
      } catch {
        branch = 'detached';
      }
    }

    // 2. Check dirty status (uncommitted / untracked changes)
    let dirty = false;
    try {
      const statusOut = execSync('git status --porcelain', execOpts).trim();
      dirty = Boolean(statusOut && statusOut.length > 0);
    } catch {
      dirty = false;
    }

    return { branch, dirty };
  } catch {
    return null;
  }
}

module.exports = { getGitStatus };
