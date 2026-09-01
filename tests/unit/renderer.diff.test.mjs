import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderDiffSegment } = require('../../runtime/renderer/diff-render.js');

const glyphs = { diffIcon: '[D] ', costIcon: '[$] ', clockIcon: '[t] ', vbar: '|' };

describe('renderDiffSegment', () => {
  it('renders +N -M with colors', () => {
    const diff = { linesAdded: 168, linesRemoved: 1 };
    const result = renderDiffSegment(diff, null, {}, glyphs, 'en');
    assert.ok(result.includes('+168'));
    assert.ok(result.includes('-1'));
    assert.ok(result.includes('\x1b[32m')); // green for additions
    assert.ok(result.includes('\x1b[31m')); // red for removals
  });

  it('returns empty when both are zero', () => {
    const diff = { linesAdded: 0, linesRemoved: 0 };
    assert.equal(renderDiffSegment(diff, null, {}, glyphs, 'en'), '');
  });

  it('renders only additions', () => {
    const diff = { linesAdded: 50, linesRemoved: 0 };
    const result = renderDiffSegment(diff, null, {}, glyphs, 'en');
    assert.ok(result.includes('+50'));
    assert.ok(!result.includes('-'));
  });

  it('includes cost when available', () => {
    const diff = { linesAdded: 10, linesRemoved: 0 };
    const cost = { totalCostUsd: 0.5, totalDurationMs: 0, apiDurationMs: 0 };
    const result = renderDiffSegment(diff, cost, {}, glyphs, 'en');
    assert.ok(result.includes('$0.50'));
  });

  it('includes duration when available', () => {
    const diff = { linesAdded: 0, linesRemoved: 0 };
    const cost = { totalCostUsd: 0, totalDurationMs: 769524, apiDurationMs: 600596 };
    const result = renderDiffSegment(diff, cost, {}, glyphs, 'en');
    assert.ok(result.includes('12m49s'));
    assert.ok(result.includes('API:'));
    assert.ok(result.includes('10m0s'));
  });

  it('respects showDiffStats=false', () => {
    const diff = { linesAdded: 100, linesRemoved: 5 };
    const config = { display: { showDiffStats: false } };
    const result = renderDiffSegment(diff, null, config, glyphs, 'en');
    assert.ok(!result.includes('+100'));
  });
});
