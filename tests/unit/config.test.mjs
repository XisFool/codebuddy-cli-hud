import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadConfig, deepMerge } = require('../../runtime/config.js');

describe('deepMerge', () => {
  it('merges nested objects', () => {
    const target = { a: { b: 1, c: 2 }, d: 3 };
    const source = { a: { b: 10 }, e: 5 };
    const result = deepMerge(target, source);
    assert.equal(result.a.b, 10);
    assert.equal(result.a.c, 2);
    assert.equal(result.d, 3);
    assert.equal(result.e, 5);
  });

  it('does not mutate target', () => {
    const target = { a: { b: 1 } };
    const source = { a: { b: 2 } };
    deepMerge(target, source);
    assert.equal(target.a.b, 1);
  });

  it('overwrites arrays instead of merging', () => {
    const target = { a: [1, 2] };
    const source = { a: [3] };
    const result = deepMerge(target, source);
    assert.deepEqual(result.a, [3]);
  });
});

describe('loadConfig', () => {
  it('returns default config when no overrides exist', () => {
    const config = loadConfig('/nonexistent/path');
    assert.equal(config.theme.primary, 'cyan');
    assert.equal(config.display.showTokenBar, true);
    assert.equal(config.thresholds.warning, 0.7);
    assert.equal(config.language, 'en');
  });
});
