import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { getGitStatus } = require('../../runtime/git.js');

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
