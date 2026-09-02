import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { getGitStatus, parseGitStatusOutput } = require('../../runtime/git.js');

describe('parseGitStatusOutput', () => {
  test('clean repo: branch only, not dirty', () => {
    const r = parseGitStatusOutput('## main...origin/main\n');
    assert.deepEqual(r, { branch: 'main', dirty: false });
  });

  test('dirty repo: changed files make dirty=true', () => {
    const r = parseGitStatusOutput('## main\n M a.js\n?? b.txt\n');
    assert.deepEqual(r, { branch: 'main', dirty: true });
  });

  test('branch without upstream', () => {
    const r = parseGitStatusOutput('## feature/x\n');
    assert.equal(r.branch, 'feature/x');
  });

  test('branch with ahead/behind markers', () => {
    const r = parseGitStatusOutput('## main...origin/main [ahead 1, behind 2]\n');
    assert.equal(r.branch, 'main');
  });

  test('detached HEAD (no branch)', () => {
    const r = parseGitStatusOutput('## HEAD (no branch)\n');
    assert.equal(r.branch, 'HEAD');
  });

  test('detached HEAD mid-rebase', () => {
    const r = parseGitStatusOutput('## HEAD (no branch, rebasing branch-x)\n M f.js\n');
    assert.deepEqual(r, { branch: 'HEAD', dirty: true });
  });

  test('branch names containing spaces survive upstream stripping', () => {
    const r = parseGitStatusOutput('## my branch...origin/my branch\n');
    assert.equal(r.branch, 'my branch');
  });

  test('empty header line yields empty branch', () => {
    const r = parseGitStatusOutput('\n\n');
    assert.equal(r.branch, '');
  });

  test('unborn branch in a repo with zero commits', () => {
    const r = parseGitStatusOutput('## No commits yet on master\n');
    assert.equal(r.branch, 'master');
    assert.equal(r.dirty, false);
  });

  test('null/undefined input degrades to empty result instead of a phantom dirty line', () => {
    assert.deepEqual(parseGitStatusOutput(null), { branch: '', dirty: false });
    assert.deepEqual(parseGitStatusOutput(undefined), { branch: '', dirty: false });
    assert.deepEqual(parseGitStatusOutput(''), { branch: '', dirty: false });
  });
});

describe('getGitStatus', () => {
  test('returns null for null or empty cwd', () => {
    assert.equal(getGitStatus(null), null);
    assert.equal(getGitStatus(''), null);
    assert.equal(getGitStatus(undefined), null);
  });

  test('returns null for non-git directory', () => {
    const tmpDir = os.tmpdir();
    // tmpdir might or might not be a git repo, but a random subfolder definitely is not
    const randomDir = `${tmpDir}/codebuddy-test-non-git-${Date.now()}`;
    assert.equal(getGitStatus(randomDir), null);
  });

  test('returns branch info for current git repository', () => {
    const result = getGitStatus(process.cwd());
    if (result !== null) {
      assert.equal(typeof result.branch, 'string');
      assert.ok(result.branch.length > 0);
      assert.equal(typeof result.dirty, 'boolean');
    }
  });

  test('respects small timeout without crashing', () => {
    const result = getGitStatus(process.cwd(), 1); // 1ms might timeout or succeed
    assert.ok(result === null || typeof result === 'object');
  });
});
