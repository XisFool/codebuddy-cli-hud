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

  it('strips C1 control bytes including the single-byte CSI 0x9B', () => {
    const out = sanitizeTerminalText('x\u009B2yy');
    assert.ok(!out.includes('\u009B'), 'C1 CSI survived');
    assert.equal(sanitizeTerminalText('a\u0090b\u009cc'), 'abc');
  });

  it('strips bidi and invisible formatting controls', () => {
    assert.ok(!sanitizeTerminalText('evil\u202Emore').includes('\u202E'), 'RTL override survived');
    assert.equal(sanitizeTerminalText('a\u200eb\u200fc'), 'abc');
    assert.ok(!sanitizeTerminalText('x\u2066y\u2069').includes('\u2066'));
  });

  it('still passes legitimate non-ASCII text through', () => {
    assert.equal(sanitizeTerminalText('分支/中文/naïve'), '分支/中文/naïve');
  });
});
