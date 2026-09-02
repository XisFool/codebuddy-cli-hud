import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { getTargetDir, checkNodeVersion } = require('../../scripts/bootstrap.js');

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
});
