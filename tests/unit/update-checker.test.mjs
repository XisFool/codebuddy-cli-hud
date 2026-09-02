import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  compareVersions,
  parseSemver,
  getLocalVersion,
  readUpdateStatus,
  writeUpdateStatus,
  checkForUpdates,
} = require('../../runtime/update-checker.js');
const { getUpdateStatusPath } = require('../../runtime/paths.js');

describe('update-checker', () => {
  test('parseSemver parses standard and prefixed versions', () => {
    assert.deepEqual(parseSemver('1.2.3'), [1, 2, 3]);
    assert.deepEqual(parseSemver('v2.0.4'), [2, 0, 4]);
    assert.deepEqual(parseSemver('0.1'), [0, 1, 0]);
    assert.deepEqual(parseSemver('invalid'), [0, 0, 0]);
  });

  test('compareVersions accurately compares semver strings', () => {
    assert.equal(compareVersions('0.2.0', '0.1.0'), 1);
    assert.equal(compareVersions('0.1.0', '0.2.0'), -1);
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
    assert.equal(compareVersions('1.1.0', '1.0.9'), 1);
    assert.equal(compareVersions('0.1.10', '0.1.9'), 1);
  });

  test('getLocalVersion returns valid semver string', () => {
    const ver = getLocalVersion();
    assert.equal(typeof ver, 'string');
    assert.match(ver, /^\d+\.\d+\.\d+/);
  });

  test('readUpdateStatus and writeUpdateStatus correctly manage state file', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cbhud-update-test-'));
    const originalCodeBuddyHome = process.env.CODEBUDDY_HOME;
    process.env.CODEBUDDY_HOME = tmpHome;

    try {
      assert.equal(readUpdateStatus(), null);

      const testPayload = {
        updateAvailable: true,
        latestVersion: '9.9.9',
        localVersion: '0.1.0',
        lastCheck: Date.now(),
      };
      writeUpdateStatus(testPayload);

      const readBack = readUpdateStatus();
      assert.deepEqual(readBack, testPayload);
    } finally {
      if (originalCodeBuddyHome === undefined) delete process.env.CODEBUDDY_HOME;
      else process.env.CODEBUDDY_HOME = originalCodeBuddyHome;
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  test('checkForUpdates respects cache interval when not forced', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cbhud-update-cache-test-'));
    const originalCodeBuddyHome = process.env.CODEBUDDY_HOME;
    process.env.CODEBUDDY_HOME = tmpHome;

    try {
      const existingStatus = {
        updateAvailable: false,
        latestVersion: '0.1.0',
        localVersion: '0.1.0',
        lastCheck: Date.now() - 1000, // 1 second ago
      };
      writeUpdateStatus(existingStatus);

      const result = await checkForUpdates({ force: false });
      assert.deepEqual(result, existingStatus);
    } finally {
      if (originalCodeBuddyHome === undefined) delete process.env.CODEBUDDY_HOME;
      else process.env.CODEBUDDY_HOME = originalCodeBuddyHome;
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });
});
