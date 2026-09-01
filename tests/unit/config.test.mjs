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

  it('clones nested objects absent from the source instead of aliasing them', () => {
    const target = { a: { b: { c: 1 } }, keep: { n: 5 } };
    const merged = deepMerge(target, { x: 1 });
    assert.notEqual(merged.a, target.a);
    assert.notEqual(merged.keep, target.keep);
    merged.a.b.c = 99;
    assert.equal(target.a.b.c, 1);
  });

  it('clones nested objects coming from the source', () => {
    const src = { a: { b: 1 } };
    const merged = deepMerge({}, src);
    assert.notEqual(merged.a, src.a);
    merged.a.b = 2;
    assert.equal(src.a.b, 1);
  });

  it('ignores __proto__ keys so a hostile config cannot swap the prototype', () => {
    const hostile = JSON.parse('{"__proto__":{"polluted":1},"normal":2}');
    const merged = deepMerge({}, hostile);
    assert.equal(Object.getPrototypeOf(merged), Object.prototype, 'merged [[Prototype]] must stay default');
    assert.equal(merged.normal, 2);
    assert.equal(merged.polluted, undefined);
    // nested too
    const nested = deepMerge({ theme: {} }, JSON.parse('{"theme":{"__proto__":{"primary":"INJECTED"}}}'));
    assert.equal(Object.getPrototypeOf(nested.theme), Object.prototype);
    assert.equal(nested.theme.primary, undefined);
    // no global pollution
    assert.equal(({}).polluted, undefined);
  });

  it('caps merge depth so a pathologically deep config cannot overflow the stack', () => {
    let deep = { leaf: 1 };
    for (let i = 0; i < 10000; i++) deep = { next: deep };
    const result = loadConfig('/nonexistent/path');
    let m;
    assert.doesNotThrow(() => { m = deepMerge({}, deep); });
    assert.ok(m, 'deep config must merge without throwing');
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

  it('does not leak mutations into DEFAULT_CONFIG', () => {
    const { DEFAULT_CONFIG } = require('../../runtime/config.js');
    const config = loadConfig('/nonexistent/path');
    config.display.maxLines = 9999;
    config.theme.primary = 'red';
    assert.equal(DEFAULT_CONFIG.display.maxLines, 4);
    assert.equal(DEFAULT_CONFIG.theme.primary, 'cyan');
  });
});
