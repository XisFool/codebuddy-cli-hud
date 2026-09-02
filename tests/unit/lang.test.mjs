import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DICTIONARY, detectLanguage, getI18n } = require('../../runtime/renderer/lang.js');

describe('i18n lang module', () => {
  test('defines both zh and en dictionaries', () => {
    assert.ok(DICTIONARY.zh);
    assert.ok(DICTIONARY.en);
    assert.ok(DICTIONARY.zh.themeSelectTitle);
    assert.ok(DICTIONARY.en.themeSelectTitle);
  });

  test('detectLanguage respects explicit configuration', () => {
    assert.equal(detectLanguage({ language: 'zh' }), 'zh');
    assert.equal(detectLanguage({ language: 'en' }), 'en');
  });

  test('detectLanguage detects zh from environment variables', () => {
    const originalEnv = process.env.LANG;
    try {
      process.env.LANG = 'zh_CN.UTF-8';
      assert.equal(detectLanguage({ language: 'auto' }), 'zh');
    } finally {
      if (originalEnv === undefined) delete process.env.LANG;
      else process.env.LANG = originalEnv;
    }
  });

  test('getI18n returns helper with t() translation method', () => {
    const i18n = getI18n({ language: 'zh' });
    assert.equal(i18n.lang, 'zh');
    assert.equal(typeof i18n.t, 'function');
    assert.equal(i18n.t('themeSelectTitle'), DICTIONARY.zh.themeSelectTitle);
    assert.equal(i18n.t('non_existent_key', 'fallback_text'), 'fallback_text');
  });
});
