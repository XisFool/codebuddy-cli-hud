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
  spawnBackgroundUpdateCheck,
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

  test('spawnBackgroundUpdateCheck sets placeholder timestamp to avoid process stampede', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cbhud-update-stampede-test-'));
    const originalCodeBuddyHome = process.env.CODEBUDDY_HOME;
    process.env.CODEBUDDY_HOME = tmpHome;

    try {
      assert.equal(readUpdateStatus(), null);
      spawnBackgroundUpdateCheck();
      const statusAfterSpawn = readUpdateStatus();
      assert.ok(statusAfterSpawn);
      assert.ok(statusAfterSpawn.lastCheck > 0);
      assert.ok(Date.now() - statusAfterSpawn.lastCheck < 5000);
    } finally {
      if (originalCodeBuddyHome === undefined) delete process.env.CODEBUDDY_HOME;
      else process.env.CODEBUDDY_HOME = originalCodeBuddyHome;
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  test('--run-check flag executes forced check even when lastCheck was just written', async () => {
    const http = require('node:http');
    const { spawn } = require('node:child_process');
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cbhud-run-check-test-'));
    const scriptPath = path.resolve(import.meta.dirname, '../../runtime/update-checker.js');

    // Pre-lock status file as parent process would
    const lockStatus = {
      updateAvailable: false,
      latestVersion: '0.1.0',
      localVersion: '0.1.0',
      lastCheck: Date.now(), // just now
    };

    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ version: '1.5.0' }));
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const mockUrl = `http://127.0.0.1:${port}/package.json`;

    try {
      // Write pre-lock status to tmpHome
      const stateDir = path.join(tmpHome, 'codebuddy-hud-update-status.json');
      fs.writeFileSync(stateDir, JSON.stringify(lockStatus, null, 2));

      // Run child process with --run-check
      const child = spawn(process.execPath, [scriptPath, '--run-check'], {
        env: {
          ...process.env,
          CODEBUDDY_HOME: tmpHome,
          CODEBUDDY_HUD_REMOTE_PKG_URL: mockUrl,
        },
        stdio: 'pipe',
      });

      await new Promise((resolve) => child.on('close', resolve));

      // Verify that the child process forced the check and updated the file
      const updatedStatus = JSON.parse(fs.readFileSync(stateDir, 'utf8'));
      assert.equal(updatedStatus.latestVersion, '1.5.0');
      assert.equal(updatedStatus.updateAvailable, true);
    } finally {
      server.close();
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });
});
