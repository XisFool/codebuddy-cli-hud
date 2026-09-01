import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sanitizeTerminalText } = require('../../runtime/sanitize.js');

describe('sanitizeTerminalText', () => {
  it('returns empty string for null/undefined', () => {
    assert.equal(sanitizeTerminalText(null), '');
    assert.equal(sanitizeTerminalText(undefined), '');
  });

  it('passes through clean strings', () => {
    assert.equal(sanitizeTerminalText('hello world'), 'hello world');
  });

  it('strips ANSI CSI sequences', () => {
    assert.equal(sanitizeTerminalText('\x1b[31mred\x1b[0m'), 'red');
    assert.equal(sanitizeTerminalText('\x1b[1;32mbold green\x1b[0m'), 'bold green');
  });

  it('strips OSC sequences', () => {
    assert.equal(sanitizeTerminalText('\x1b]0;title\x07text'), 'text');
    assert.equal(sanitizeTerminalText('\x1b]8;;url\x1b\\link'), 'link');
  });

  it('strips control characters', () => {
    assert.equal(sanitizeTerminalText('a\x00b\x1fc'), 'abc');
    assert.equal(sanitizeTerminalText('line1\r\nline2'), 'line1line2');
  });

  it('truncates to maxLength', () => {
    assert.equal(sanitizeTerminalText('abcdefghij', 5), 'abcde');
  });

  it('converts non-string values', () => {
    assert.equal(sanitizeTerminalText(42), '42');
    assert.equal(sanitizeTerminalText(true), 'true');
  });
});
