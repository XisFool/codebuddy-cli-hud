'use strict';

/**
 * Strip ANSI escape sequences, OSC sequences, and control characters
 * from external strings to prevent terminal injection.
 */
function sanitizeTerminalText(value, maxLength) {
  if (maxLength === undefined) maxLength = 120;
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/\x1b\][^\x07]*?(?:\x07|\x1b\\|$)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .slice(0, maxLength);
}

module.exports = { sanitizeTerminalText };
