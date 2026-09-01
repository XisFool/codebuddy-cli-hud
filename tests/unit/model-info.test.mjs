import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveEffortLevel, resolveCredits, resetModelInfoCache } = require('../../runtime/model-info.js');

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
    const data = { reasoning_effort: 'MAXIMUM' };
    assert.equal(resolveEffortLevel(data), 'maximum');
  });
});

describe('resolveCredits', () => {
  it('returns USD cost when totalCostUsd > 0', () => {
    const result = resolveCredits({}, 0.5);
    assert.equal(result, '$0.50');
  });

  it('returns formatted credits from cost.credits number', () => {
    const data = { cost: { credits: 2.5 } };
    const result = resolveCredits(data, 0);
    assert.equal(result, '2.50x credits');
  });

  it('returns raw credits string when not a finite number', () => {
    const data = { cost: { credits: 'premium tier' } };
    const result = resolveCredits(data, 0);
    assert.equal(result, 'premium tier');
  });

  it('returns default 0.00x credits when no data available', () => {
    const result = resolveCredits({}, 0);
    assert.equal(result, '0.00x credits');
  });

  it('returns default for null cbData and zero cost', () => {
    const result = resolveCredits(null, 0);
    assert.equal(result, '0.00x credits');
  });

  it('prefers USD over credits field', () => {
    const data = { cost: { credits: 5 } };
    const result = resolveCredits(data, 1.23);
    assert.equal(result, '$1.23');
  });
});
