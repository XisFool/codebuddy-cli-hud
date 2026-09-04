import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  getTargetDir,
  checkNodeVersion,
  rawBaseForTag,
  resolveRemoteRawBase,
} = require('../../scripts/bootstrap.js');

describe('bootstrap installer', () => {
  test('checkNodeVersion runs cleanly on current node', () => {
    assert.doesNotThrow(() => {
      checkNodeVersion();
    });
  });

  test('getTargetDir prioritizes CODEBUDDY_HUD_DIR when set', () => {
    const originalEnv = process.env.CODEBUDDY_HUD_DIR;
    try {
      process.env.CODEBUDDY_HUD_DIR = '/custom/test/hud-runtime';
      const dir = getTargetDir();
      assert.ok(dir.includes('custom'));
    } finally {
      if (originalEnv === undefined) delete process.env.CODEBUDDY_HUD_DIR;
      else process.env.CODEBUDDY_HUD_DIR = originalEnv;
    }
  });

  test('uses immutable release tags for remote download sources', async () => {
    assert.equal(
      rawBaseForTag('v0.1.0'),
      'https://raw.githubusercontent.com/XisFool/codebuddy-hud/v0.1.0'
    );
    assert.throws(() => rawBaseForTag('master'));
    assert.equal(
      await resolveRemoteRawBase({ fetchLatestRelease: async () => ({ tag_name: 'v0.2.0' }) }),
      'https://raw.githubusercontent.com/XisFool/codebuddy-hud/v0.2.0'
    );
  });

  test('install copies local repo files and configures statusline in isolated environment', async () => {
    const fs = require('fs');
    const os = require('os');
    const { install } = require('../../scripts/bootstrap.js');
    const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cbhud-boot-test-'));
    const targetDir = path.join(testRoot, 'runtime-target');
    const testHome = path.join(testRoot, 'home');
    const settingsFile = path.join(testHome, 'settings.json');
    fs.mkdirSync(testHome, { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify({}));

    const savedEnv = {
      CODEBUDDY_HUD_DIR: process.env.CODEBUDDY_HUD_DIR,
      CODEBUDDY_HOME: process.env.CODEBUDDY_HOME,
      CODEBUDDY_SETTINGS_PATH: process.env.CODEBUDDY_SETTINGS_PATH,
    };
    try {
      process.env.CODEBUDDY_HUD_DIR = targetDir;
      process.env.CODEBUDDY_HOME = testHome;
      process.env.CODEBUDDY_SETTINGS_PATH = settingsFile;

      await install();

      assert.ok(fs.existsSync(path.join(targetDir, 'runtime', 'bin', 'codebuddy-hud.js')));
      const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      assert.ok(settings.statusLine);
      assert.ok(settings.statusLine.command);
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });
});
