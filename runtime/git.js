'use strict';

const path = require('path');
const { execSync } = require('child_process');

// Pure parser for `git status --porcelain -b` output. Exported for tests.
function parseGitStatusOutput(out) {
  if (!out) return { branch: '', dirty: false };
  let branch = '';
  let dirty = false;
  for (const line of String(out).split('\n')) {
    if (line.startsWith('## ')) {
      let head = line.slice(3).trim();
      // unborn branch in a repo with zero commits: `## No commits yet on master`
      const unborn = 'No commits yet on ';
      if (head.startsWith(unborn)) head = head.slice(unborn.length);
      // detached: `## HEAD (no branch)` / `## HEAD (no branch, rebasing ...)`
      if (head === 'HEAD' || head.startsWith('HEAD (')) {
        const paren = head.indexOf(' (');
        branch = paren === -1 ? head : head.slice(0, paren);
      } else {
        // refs may not contain `..`, so the three-dot upstream separator is
        // unambiguous even for branch names containing spaces
        const dots = head.indexOf('...');
        branch = dots === -1 ? head : head.slice(0, dots);
      }
    } else if (line.trim()) {
      dirty = true;
    }
  }
  return { branch, dirty };
}

/**
 * Get current git branch and dirty status with strict timeout and fallback.
 * Uses a single `git status --porcelain -b` spawn (the old two-spawn version
 * cost ~124ms per HUD run on Windows), plus one extra `rev-parse --short` only
 * in the rare detached-HEAD case to keep the short-hash display.
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

    // `git status --porcelain -b` prints a `## <branch>...<upstream>` header
    // (or `## HEAD (no branch)` when detached) followed by one line per
    // changed/untracked file. One spawn answers branch AND dirty.
    let out;
    try {
      out = execSync('git status --porcelain -b', execOpts);
    } catch {
      return null; // Not a git repository or git command missing
    }

    const { branch: parsedBranch, dirty } = parseGitStatusOutput(out);

    let branch = parsedBranch;
    if (!branch) return null;

    if (branch === 'HEAD') {
      // Detached HEAD: show the short commit hash like before
      try {
        branch = execSync('git rev-parse --short HEAD', execOpts).trim();
      } catch {
        branch = 'detached';
      }
    }

    return { branch, dirty };
  } catch {
    return null;
  }
}

module.exports = { getGitStatus, parseGitStatusOutput };
