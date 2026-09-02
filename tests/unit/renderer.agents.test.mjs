import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderAgentLine, renderToolActivity } = require('../../runtime/renderer/agents-render.js');

const glyphs = {
  agentIcon: '[A] ', taskIcon: '[T] ', vbar: '|',
  activeIcon: '◐ ', queueIcon: '▸ ', doneIcon: '✓ ',
};

describe('renderAgentLine', () => {
  it('returns empty string for null data', () => {
    assert.equal(renderAgentLine(null, {}, glyphs, 'en'), '');
  });

  it('renders active agents', () => {
    const data = { active: [{ id: '1', name: 'explorer' }, { id: '2', name: 'planner' }], queueDepth: 0, completedCount: 0, totalCount: 0 };
    const result = renderAgentLine(data, {}, glyphs, 'en');
    assert.ok(result.includes('2 active'));
    assert.ok(result.includes('explorer'));
  });

  it('renders queue depth', () => {
    const data = { active: [], queueDepth: 3, completedCount: 0, totalCount: 0 };
    const result = renderAgentLine(data, {}, glyphs, 'en');
    assert.ok(result.includes('Queue: 3'));
  });

  it('renders completion ratio', () => {
    const data = { active: [], queueDepth: 0, completedCount: 5, totalCount: 8 };
    const result = renderAgentLine(data, {}, glyphs, 'en');
    assert.ok(result.includes('Done 5/8'));
  });

  it('respects showAgentStatus=false', () => {
    const data = { active: [{ id: '1', name: 'x' }], queueDepth: 0, completedCount: 0, totalCount: 0 };
    const config = { display: { showAgentStatus: false } };
    assert.equal(renderAgentLine(data, config, glyphs, 'en'), '');
  });

  it('renders English labels properly', () => {
    const data = { active: [{ id: '1', name: 'test' }], queueDepth: 2, completedCount: 1, totalCount: 3 };
    const result = renderAgentLine(data, {}, glyphs, 'en');
    assert.ok(result.includes('active'));
    assert.ok(result.includes('Queue: 2'));
    assert.ok(result.includes('Done 1/3'));
  });
});

describe('renderToolActivity', () => {
  it('returns empty string for null activity', () => {
    assert.equal(renderToolActivity(null, glyphs), '');
    assert.equal(renderToolActivity({}, glyphs), '');
    assert.equal(renderToolActivity({ status: 'active', tool: '' }, glyphs), '');
  });

  it('renders active tool with detail in cyan + dim', () => {
    const result = renderToolActivity({ status: 'active', tool: 'Edit', detail: 'auth.ts' }, glyphs);
    assert.ok(result.startsWith('◐ '));
    assert.ok(result.includes('\x1b[36mEdit\x1b[0m'));
    assert.ok(result.includes('\x1b[2m: auth.ts\x1b[0m'));
  });

  it('renders active tool without detail', () => {
    const result = renderToolActivity({ status: 'active', tool: 'Think', detail: '' }, glyphs);
    assert.ok(result.includes('Think'));
    assert.ok(!result.includes(':'));
  });

  it('renders done tool with green check and dim name', () => {
    const result = renderToolActivity({ status: 'done', tool: 'Read' }, glyphs);
    assert.ok(result.includes('\x1b[32m✓\x1b[0m'));
    assert.ok(result.includes('\x1b[2mRead\x1b[0m'));
  });

  it('renders aggregated tool activity with active and completed counts', () => {
    const activity = {
      active: { tool: 'Edit', detail: 'parser.js' },
      completed: [
        { tool: 'Read', count: 3 },
        { tool: 'Grep', count: 2 },
      ],
      totalCompleted: 5,
    };
    const result = renderToolActivity(activity, glyphs);
    assert.ok(result.includes('Edit'));
    assert.ok(result.includes(': parser.js'));
    assert.ok(result.includes('Read'));
    assert.ok(result.includes('×3'));
    assert.ok(result.includes('Grep'));
    assert.ok(result.includes('×2'));
  });

  it('renders aggregated tool activity with only completed items', () => {
    const activity = {
      active: null,
      completed: [
        { tool: 'Read', count: 1 },
      ],
      totalCompleted: 1,
    };
    const result = renderToolActivity(activity, glyphs);
    assert.ok(result.includes('Read'));
    assert.ok(!result.includes('×1')); // single count is clean without ×1
  });
});

