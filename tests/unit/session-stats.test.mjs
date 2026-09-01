import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getLogicalSessionCostData } = require('../../runtime/session-stats.js');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cbhud-session-stats-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function payload({ sessionId = 'session-a', totalInput = 100000, currentInput = 90000 } = {}) {
  return {
    session_id: sessionId,
    transcript_path: path.join(tmpDir, 'session.jsonl'),
    context_window: {
      total_input_tokens: totalInput,
      current_usage: { input_tokens: currentInput },
    },
  };
}

function cost({ added = 1700, removed = 161, totalMs = 10020000, apiMs = 4980000 } = {}) {
  return {
    linesAdded: added,
    linesRemoved: removed,
    totalDurationMs: totalMs,
    apiDurationMs: apiMs,
  };
}

function sessionCost(input, costData) {
  return getLogicalSessionCostData(input, costData, {
    statePath: path.join(tmpDir, 'state.json'),
  });
}

describe('getLogicalSessionCostData', () => {
  it('keeps host totals until a clear boundary is observed', () => {
    assert.deepEqual(sessionCost(payload(), cost()), cost());
    assert.deepEqual(sessionCost(payload({ totalInput: 110000, currentInput: 98000 }), cost({ added: 1710, totalMs: 10030000 })),
      cost({ added: 1710, totalMs: 10030000 }));
  });

  it('resets diff and duration after /clear reuses the transcript and host totals', () => {
    sessionCost(payload(), cost());

    const cleared = sessionCost(payload({ totalInput: 0, currentInput: 0 }), cost());
    assert.deepEqual(cleared, cost({ added: 0, removed: 0, totalMs: 0, apiMs: 0 }));

    const nextTurn = sessionCost(payload({ totalInput: 900, currentInput: 900 }), cost({
      added: 12,
      removed: 3,
      totalMs: 25000,
      apiMs: 9000,
    }));
    assert.deepEqual(nextTurn, cost({ added: 12, removed: 3, totalMs: 25000, apiMs: 9000 }));
  });

  it('uses a near-zero current context as a fallback clear signal', () => {
    sessionCost(payload({ totalInput: 100000, currentInput: 90000 }), cost());
    const cleared = sessionCost(payload({ totalInput: 101000, currentInput: 10 }), cost());
    assert.deepEqual(cleared, cost({ added: 0, removed: 0, totalMs: 0, apiMs: 0 }));
  });

  it('resets when the host assigns a new session id to the same transcript', () => {
    sessionCost(payload({ sessionId: 'session-a' }), cost());
    const reset = sessionCost(payload({ sessionId: 'session-b', totalInput: 100100, currentInput: 90100 }), cost());
    assert.deepEqual(reset, cost({ added: 0, removed: 0, totalMs: 0, apiMs: 0 }));
  });

  it('rebuilds after a corrupt state file and degrades when it cannot persist', () => {
    const statePath = path.join(tmpDir, 'state.json');
    fs.writeFileSync(statePath, '{not-json');
    assert.deepEqual(getLogicalSessionCostData(payload(), cost(), { statePath }), cost());
    assert.deepEqual(getLogicalSessionCostData(payload(), cost(), { statePath: path.join(tmpDir, 'bad\0state') }), cost());
  });

  it('returns unmodified data when no stable session identity is available', () => {
    const input = { context_window: { total_input_tokens: 100000, current_usage: { input_tokens: 90000 } } };
    assert.deepEqual(getLogicalSessionCostData(input, cost(), { statePath: path.join(tmpDir, 'state.json') }), cost());
  });

});
