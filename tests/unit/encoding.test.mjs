import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { supportsUnicode, detectUnicodeSupport, selectGlyphs, resetCache } =
  require('../../runtime/encoding.js');

describe('supportsUnicode', () => {
  const originalEnv = Object.assign({}, process.env);

  beforeEach(() => {
    resetCache();
    delete process.env.CODEBUDDY_HUD_FORCE_ASCII;
    delete process.env.CODEBUDDY_HUD_FORCE_UNICODE;
  });

  afterEach(() => {
    process.env = Object.assign({}, originalEnv);
    resetCache();
  });

  test('forces ascii via CODEBUDDY_HUD_FORCE_ASCII=1', () => {
    process.env.CODEBUDDY_HUD_FORCE_ASCII = '1';
    assert.equal(supportsUnicode(), false);
  });

  test('forces unicode via CODEBUDDY_HUD_FORCE_UNICODE=1', () => {
    process.env.CODEBUDDY_HUD_FORCE_UNICODE = '1';
    assert.equal(supportsUnicode(), true);
  });

  test('detects unicode support or falls back cleanly', () => {
    const result = supportsUnicode();
    assert.equal(typeof result, 'boolean');
  });
});

describe('detectUnicodeSupport', () => {
  test('LC_ALL=zh_CN.UTF-8 -> true', () => {
    assert.equal(detectUnicodeSupport('linux', { LC_ALL: 'zh_CN.UTF-8' }), true);
  });

  test('LANG=C -> false', () => {
    assert.equal(detectUnicodeSupport('linux', { LANG: 'C' }), false);
  });

  test('all locale vars absent -> true', () => {
    assert.equal(detectUnicodeSupport('linux', {}), true);
  });

  test('all locale vars empty strings -> true', () => {
    assert.equal(detectUnicodeSupport('linux', { LC_ALL: '', LC_CTYPE: '', LANG: '' }), true);
  });

  test('locale vars empty + TERM=dumb -> false', () => {
    assert.equal(detectUnicodeSupport('linux', { LANG: '', TERM: 'dumb' }), false);
  });

  test('locale vars empty + TERM=linux -> false', () => {
    assert.equal(detectUnicodeSupport('linux', { TERM: 'linux' }), false);
  });

  test('LC_ALL wins over LANG', () => {
    assert.equal(detectUnicodeSupport('linux', { LANG: 'en_US.UTF-8', LC_ALL: 'C' }), false);
  });

  test('FORCE_ASCII overrides a UTF-8 locale', () => {
    const env = { LANG: 'en_US.UTF-8', CODEBUDDY_HUD_FORCE_ASCII: '1' };
    assert.equal(detectUnicodeSupport('linux', env), false);
  });

  test('FORCE_UNICODE overrides LANG=C', () => {
    const env = { LANG: 'C', CODEBUDDY_HUD_FORCE_UNICODE: '1' };
    assert.equal(detectUnicodeSupport('linux', env), true);
  });

  test('LC_CTYPE alone being UTF-8 -> true', () => {
    assert.equal(detectUnicodeSupport('linux', { LC_CTYPE: 'en_US.UTF-8' }), true);
  });

  test('win32 -> true when no FORCE vars', () => {
    assert.equal(detectUnicodeSupport('win32', { LANG: 'C' }), true);
  });

  test('does not mutate or read beyond its arguments', () => {
    const env = { LANG: 'C' };
    assert.equal(detectUnicodeSupport('linux', env), false);
    assert.deepEqual(env, { LANG: 'C' });
  });
});

describe('selectGlyphs', () => {
  test('returns nerd font glyphs when useNerdFonts=true', () => {
    const glyphs = selectGlyphs(true, true);
    assert.equal(glyphs.vbar, '\u2502');
    assert.equal(glyphs.bar, '\u2588');
    assert.equal(glyphs.empty, '\u2591');
    assert.ok(glyphs.effortIcons);
    assert.ok(glyphs.effortIcons.high);
    assert.ok(glyphs.activeIcon);
    assert.ok(glyphs.queueIcon);
    assert.ok(glyphs.doneIcon);
  });

  test('returns standard unicode glyphs when unicodeSupported=true', () => {
    const glyphs = selectGlyphs(false, true);
    assert.equal(glyphs.vbar, '\u2502');
    assert.equal(glyphs.bar, '\u2588');
    assert.equal(glyphs.empty, '\u2591');
    assert.equal(glyphs.clockIcon, '\u23F1 ');
    assert.equal(glyphs.activeIcon, '\u25D0 ');
    assert.equal(glyphs.queueIcon, '\u25B8 ');
    assert.equal(glyphs.doneIcon, '\u2713 ');
    assert.equal(glyphs.effortIcons.high, '\u25D1 ');
  });

  test('returns plain ascii glyphs when unicodeSupported=false', () => {
    const glyphs = selectGlyphs(false, false);
    assert.equal(glyphs.vbar, '|');
    assert.equal(glyphs.bar, '#');
    assert.equal(glyphs.empty, '-');
    assert.equal(glyphs.dot, '.');
    assert.equal(glyphs.clockIcon, '[t] ');
    assert.equal(glyphs.activeIcon, '[A] ');
    assert.equal(glyphs.queueIcon, '[Q] ');
    assert.equal(glyphs.doneIcon, '[T] ');
    assert.equal(glyphs.effortIcons.high, '(high) ');
  });
});
