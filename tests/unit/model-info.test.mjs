import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveEffortLevel, resolveCreditSpend, resetModelInfoCache } = require('../../runtime/model-info.js');

let originalSettingsPath;

beforeEach(() => {
  resetModelInfoCache();
  originalSettingsPath = process.env.CODEBUDDY_SETTINGS_PATH;
  process.env.CODEBUDDY_SETTINGS_PATH = '/nonexistent/path/settings.json';
});

afterEach(() => {
  if (originalSettingsPath === undefined) {
    delete process.env.CODEBUDDY_SETTINGS_PATH;
  } else {
    process.env.CODEBUDDY_SETTINGS_PATH = originalSettingsPath;
  }
  resetModelInfoCache();
});

describe('resolveEffortLevel', () => {
  it('returns null for null cbData', () => {
    assert.equal(resolveEffortLevel(null), null);
  });

  it('prefers top-level reasoning_effort', () => {
    const data = { reasoning_effort: 'HIGH', model: { effort: 'low' } };
    assert.equal(resolveEffortLevel(data), 'high');
  });

  it('falls back to model.effort', () => {
    const data = { model: { effort: 'Max' } };
    assert.equal(resolveEffortLevel(data), 'max');
  });

  it('falls back to model.reasoning_effort', () => {
    const data = { model: { reasoning_effort: 'LOW' } };
    assert.equal(resolveEffortLevel(data), 'low');
  });

  it('infers effort from GPT-5 model name', () => {
    const data = { model: { id: 'gpt-5-turbo' } };
    assert.equal(resolveEffortLevel(data), 'high');
  });

  it('infers effort from Claude Sonnet', () => {
    const data = { model: { display_name: 'Claude 3.5 Sonnet' } };
    assert.equal(resolveEffortLevel(data), 'high');
  });

  it('infers effort from Claude Opus', () => {
    const data = { model: { id: 'claude-opus-4' } };
    assert.equal(resolveEffortLevel(data), 'max');
  });

  it('infers effort from Claude Haiku', () => {
    const data = { model: { id: 'claude-haiku-3' } };
    assert.equal(resolveEffortLevel(data), 'medium');
  });

  it('infers effort from o1 model', () => {
    const data = { model: { id: 'o1-preview' } };
    assert.equal(resolveEffortLevel(data), 'max');
  });

  it('infers effort from o3 model', () => {
    const data = { model: { id: 'o3-mini' } };
    assert.equal(resolveEffortLevel(data), 'max');
  });

  it('infers effort from o4-mini', () => {
    const data = { model: { id: 'o4-mini' } };
    assert.equal(resolveEffortLevel(data), 'high');
  });

  it('infers effort from GPT-4o', () => {
    const data = { model: { id: 'gpt-4o' } };
    assert.equal(resolveEffortLevel(data), 'medium');
  });

  it('infers effort from Gemini Pro', () => {
    const data = { model: { id: 'gemini-2.0-pro' } };
    assert.equal(resolveEffortLevel(data), 'high');
  });

  it('infers effort from Gemini Flash', () => {
    const data = { model: { id: 'gemini-2.0-flash' } };
    assert.equal(resolveEffortLevel(data), 'medium');
  });

  it('infers effort from DeepSeek R1', () => {
    const data = { model: { id: 'deepseek-r1' } };
    assert.equal(resolveEffortLevel(data), 'max');
  });

  it('infers effort from generic DeepSeek', () => {
    const data = { model: { id: 'deepseek-chat' } };
    assert.equal(resolveEffortLevel(data), 'medium');
  });

  it('uses config defaultEffortLevel as final fallback', () => {
    const data = { model: { id: 'unknown-model-xyz' } };
    const config = { defaultEffortLevel: 'High' };
    assert.equal(resolveEffortLevel(data, config), 'high');
  });

  it('returns null when no source available and no config fallback', () => {
    const data = { model: { id: 'unknown-model-xyz' } };
    assert.equal(resolveEffortLevel(data, {}), null);
  });

  it('normalizes effort to lowercase', () => {
    const data = { reasoning_effort: 'MAX' };
    assert.equal(resolveEffortLevel(data), 'max');
  });

  it('rejects non-whitelisted effort values and falls through to inference', () => {
    // 'MAXIMUM' is not a known level: the value must be discarded, not shown.
    const data = { reasoning_effort: 'MAXIMUM', model: { id: 'gpt-5-turbo' } };
    assert.equal(resolveEffortLevel(data), 'high');
  });

  it('rejects an injected effort value from any source', () => {
    const data = { reasoning_effort: 'high\x1b[2J\x1b]0;pwned\x07', model: { id: 'unknown-model-xyz' } };
    const config = { defaultEffortLevel: 'max\x1b[2J\x1b[1;31mINJECT' };
    assert.equal(resolveEffortLevel(data, config), null);
  });

  it('rejects non-whitelisted defaultEffortLevel from untrusted project config', () => {
    const data = { model: { id: 'unknown-model-xyz' } };
    const config = { defaultEffortLevel: 'max\x1b[2J\x1b[1;31mINJECT\x1b]8;;http://evil\x07' };
    assert.equal(resolveEffortLevel(data, config), null);
  });

  it('rejects non-string effort values', () => {
    const data = { reasoning_effort: { malicious: true }, model: { id: 'unknown-model-xyz' } };
    const config = { defaultEffortLevel: 5 };
    assert.equal(resolveEffortLevel(data, config), null);
  });
});

describe('resolveCreditSpend', () => {
  it('returns actual credits from the payload', () => {
    const data = { cost: { credits: 2.5 } };
    assert.equal(resolveCreditSpend(data), 2.5);
  });

  it('preserves a genuine zero-credit payload', () => {
    assert.equal(resolveCreditSpend({ cost: { credits: 0 } }), 0);
  });

  it('returns null for non-numeric or negative credits', () => {
    const data = { cost: { credits: 'premium tier' } };
    assert.equal(resolveCreditSpend(data), null);
    assert.equal(resolveCreditSpend({ cost: { credits: -1 } }), null);
  });

  it('does not invent a zero or use model metadata as a spend fallback', () => {
    assert.equal(resolveCreditSpend({}), null);
    assert.equal(resolveCreditSpend(null), null);
  });
});
