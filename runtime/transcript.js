'use strict';

const fs = require('fs');
const path = require('path');
const { sanitizeTerminalText } = require('./sanitize');

const DEFAULT_TAIL_BYTES = 16384;
const MAX_TOTAL_BYTES = 262144;
const MAX_SCAN_LINES = 40;

function parseArguments(argValue) {
  if (argValue && typeof argValue === 'object') return argValue;
  if (typeof argValue === 'string') {
    try {
      const parsed = JSON.parse(argValue);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // malformed arguments — no detail available
    }
  }
  return null;
}

function pushCall(calls, item) {
  if (!item || typeof item !== 'object') return;
  const id = item.callId || item.id || null;
  if (id === null || calls.some(c => c.id === id)) return;
  calls.push({ id, name: item.name, arguments: item.arguments !== undefined ? item.arguments : item.input });
}

function pushResultId(resultIds, item) {
  if (!item || typeof item !== 'object') return;
  const id = item.tool_use_id || item.callId;
  if (typeof id === 'string' && id) resultIds.add(id);
}

// Extract tool calls / result ids from one transcript entry.
// Supports CodeBuddy (function_call / function_call_result entries) and
// Claude-style (message.content blocks with tool_use / tool_result).
function scanEntry(entry, calls, resultIds) {
  if (!entry || typeof entry !== 'object') return;

  if (entry.type === 'function_call') {
    pushCall(calls, entry);
    return;
  }
  if (entry.type === 'function_call_result') {
    pushResultId(resultIds, entry);
    return;
  }

  const containers = [];
  if (entry.message && Array.isArray(entry.message.content)) containers.push(entry.message.content);
  if (Array.isArray(entry.content)) containers.push(entry.content);
  for (const blocks of containers) {
    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'tool_use') pushCall(calls, block);
      else if (block.type === 'tool_result') pushResultId(resultIds, block);
    }
  }
}

// Collect complete lines from newest to oldest. The text must contain only
// complete lines (window-partials are spliced via carry before this call).
function collectCompleteLines(text) {
  const calls = [];
  const resultIds = new Set();
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines.length - i > MAX_SCAN_LINES) break;
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // corrupt line — skip
    }
    scanEntry(entry, calls, resultIds);
  }
  return { calls, resultIds };
}

// Slide a window backwards from EOF until the newest tool call is found.
// Entries can be several KB (providerData carries full usage stats), so a
// fixed 16KB tail may contain only results without their calls. A line that
// straddles a window boundary is reconstructed via carry.
function scanBackwards(fd, size, tailBytes) {
  const resultIds = new Set();
  let end = size;
  let totalRead = 0;
  let carry = '';

  while (end > 0 && totalRead < MAX_TOTAL_BYTES) {
    const len = Math.min(tailBytes, end);
    const start = end - len;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    totalRead += len;

    const combined = buf.toString('utf8') + carry;
    carry = '';

    let text;
    if (start > 0) {
      const nl = combined.indexOf('\n');
      if (nl === -1) {
        // the whole window belongs to one line that started earlier
        carry = combined;
        end = start;
        continue;
      }
      carry = combined.slice(0, nl);
      text = combined.slice(nl + 1);
    } else {
      text = combined;
    }

    const { calls, resultIds: ids } = collectCompleteLines(text);
    for (const id of ids) resultIds.add(id);
    if (calls.length > 0) return { newest: calls[0], resultIds };
    end = start;
  }

  return { newest: null, resultIds };
}

function extractDetail(input) {
  if (!input) return '';
  const pathValue = input.file_path || input.path || input.notebook_path;
  if (typeof pathValue === 'string' && pathValue.trim()) {
    return path.basename(pathValue.replace(/[\\/]+$/, '')) || '';
  }
  const command = input.command || input.pattern || input.query || input.url;
  if (typeof command === 'string') {
    return command.trim().split(/\s+/).slice(0, 4).join(' ');
  }
  return '';
}

// Extract cache/token counts from one transcript entry's providerData.
//
// Real CodeBuddy payloads carry cache telemetry ONLY here — never in the
// statusLine payload's `context_window.current_usage`. Two shapes exist:
//
//   rawUsage (authoritative; hit + miss === prompt_tokens, fully self-consistent):
//     { "prompt_tokens": 133461, "prompt_cache_hit_tokens": 133120,
//       "prompt_cache_miss_tokens": 341,
//       "cache_read_input_tokens": 0,        <-- TRAP: always 0 on this provider
//       "cache_creation_input_tokens": 0 }
//
//   usage (OpenAI-style fallback):
//     { "inputTokens": 133461, "inputTokensDetails": [{ "cached_tokens": 133120 }] }
//
// We match on the presence of the denominator, not on the hit being > 0, so a
// genuine cold turn (hit === 0) is still reported as 0% rather than skipped.
function extractUsageMetrics(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const pd = entry.providerData;
  if (!pd || typeof pd !== 'object') return null;

  const raw = pd.rawUsage;
  if (raw && typeof raw === 'object'
      && Number.isFinite(raw.prompt_tokens) && raw.prompt_tokens > 0) {
    const hit = Number.isFinite(raw.prompt_cache_hit_tokens) ? raw.prompt_cache_hit_tokens : 0;
    return { hitTokens: hit, promptTokens: raw.prompt_tokens, source: 'rawUsage' };
  }

  const u = pd.usage;
  if (u && typeof u === 'object'
      && Number.isFinite(u.inputTokens) && u.inputTokens > 0) {
    let cached = 0;
    if (Array.isArray(u.inputTokensDetails)) {
      for (const d of u.inputTokensDetails) {
        if (d && Number.isFinite(d.cached_tokens)) cached += d.cached_tokens;
      }
    }
    return { hitTokens: cached, promptTokens: u.inputTokens, source: 'usage' };
  }

  return null;
}

// One conversation turn spans MULTIPLE API calls (measured on a real session:
// avg 19.3 calls/turn, max 38). Every call carries its own prompt_tokens and
// prompt_cache_hit_tokens. Sampling only the newest call makes the badge swing
// wildly — the first call after a cache miss is ~0% while later calls hit
// 96-99% — so a "per-turn" figure must aggregate every call in the turn.
// 200 lines covers a long turn; parsing 200 lines costs ~1.9ms, which is ~0.5%
// of a single HUD run, so this is deliberately generous.
const MAX_TURN_SCAN_LINES = 200;

// Slide a window backwards from EOF collecting usage blocks, newest first.
// limit          — stop once this many blocks have been collected
// stopOnUserTurn — stop at the newest `role:'user'` message, which marks the
//                  start of the current turn (per-turn aggregation)
// Returns the blocks collected so far even on error, so callers degrade to
// partial data rather than to "no data".
function collectUsageBackwards(transcriptPath, opts, limit, stopOnUserTurn) {
  const options = opts || {};
  if (!transcriptPath || typeof transcriptPath !== 'string') return [];
  if (transcriptPath.includes('\0')) return [];

  let resolved = transcriptPath;
  if (!path.isAbsolute(resolved) && typeof options.cwd === 'string' && options.cwd) {
    resolved = path.resolve(options.cwd, resolved);
  }

  const tailBytes = Number.isFinite(options.tailBytes) && options.tailBytes > 0
    ? Math.floor(options.tailBytes)
    : DEFAULT_TAIL_BYTES;
  const maxLines = stopOnUserTurn ? MAX_TURN_SCAN_LINES : MAX_SCAN_LINES;

  const collected = [];
  let fd = null;
  try {
    fd = fs.openSync(resolved, 'r');
    const size = fs.fstatSync(fd).size;
    if (size <= 0) return collected;

    let end = size;
    let totalRead = 0;
    let carry = '';
    let scanned = 0;

    while (end > 0 && totalRead < MAX_TOTAL_BYTES && scanned < maxLines) {
      const len = Math.min(tailBytes, end);
      const start = end - len;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, start);
      totalRead += len;

      const combined = buf.toString('utf8') + carry;
      carry = '';

      let text;
      if (start > 0) {
        const nl = combined.indexOf('\n');
        if (nl === -1) {
          carry = combined;
          end = start;
          continue;
        }
        carry = combined.slice(0, nl);
        text = combined.slice(nl + 1);
      } else {
        text = combined;
      }

      const lines = text.split('\n');
      for (let i = lines.length - 1; i >= 0 && scanned < maxLines; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        scanned++;
        let entry;
        try {
          entry = JSON.parse(line);
        } catch {
          continue; // corrupt line — skip
        }

        // Turn boundary: a user message means we just passed the start of the
        // current turn. Any usage it carries belongs to the new turn, so stop
        // without collecting it.
        if (stopOnUserTurn && entry.type === 'message' && entry.role === 'user') {
          return collected;
        }

        const metrics = extractUsageMetrics(entry);
        if (metrics) {
          collected.push(metrics);
          if (collected.length >= limit) return collected;
        }
      }
      end = start;
    }

    return collected;
  } catch {
    return collected;
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* already closed */ }
    }
  }
}

// Most recent single API call's usage — the instantaneous figure. Kept for
// callers/fixtures that have no real turn structure, but it swings between ~0%
// and ~99% across a turn, so it is NOT what the HUD badge displays.
function getRecentUsageMetrics(transcriptPath, opts) {
  const collected = collectUsageBackwards(transcriptPath, opts, 1, false);
  return collected.length > 0 ? collected[0] : null;
}

// Aggregate every API call in the current conversation turn:
// sum(hit) / sum(prompt) across the turn's calls.
function getTurnUsageMetrics(transcriptPath, opts) {
  const collected = collectUsageBackwards(transcriptPath, opts, Infinity, true);
  if (collected.length === 0) return null;
  let hitTokens = 0;
  let promptTokens = 0;
  for (const m of collected) {
    hitTokens += m.hitTokens;
    promptTokens += m.promptTokens;
  }
  return { hitTokens, promptTokens, callCount: collected.length, source: 'turn' };
}

function getRecentToolActivity(transcriptPath, opts) {
  const options = opts || {};
  if (!transcriptPath || typeof transcriptPath !== 'string') return null;
  if (transcriptPath.includes('\0')) return null;

  let resolved = transcriptPath;
  if (!path.isAbsolute(resolved) && typeof options.cwd === 'string' && options.cwd) {
    resolved = path.resolve(options.cwd, resolved);
  }

  const tailBytes = Number.isFinite(options.tailBytes) && options.tailBytes > 0
    ? Math.floor(options.tailBytes)
    : DEFAULT_TAIL_BYTES;

  let fd = null;
  try {
    fd = fs.openSync(resolved, 'r');
    const size = fs.fstatSync(fd).size;
    if (size <= 0) return null;
    const { newest, resultIds } = scanBackwards(fd, size, tailBytes);
    if (!newest) return null;

    const args = parseArguments(newest.arguments);
    return {
      status: resultIds.has(newest.id) ? 'done' : 'active',
      tool: sanitizeTerminalText(String(newest.name || 'tool'), 16),
      detail: sanitizeTerminalText(extractDetail(args), 24),
    };
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* already closed */ }
    }
  }
}

module.exports = {
  getRecentToolActivity,
  getRecentUsageMetrics,
  getTurnUsageMetrics,
  extractUsageMetrics,
  DEFAULT_TAIL_BYTES,
  MAX_TOTAL_BYTES,
  MAX_SCAN_LINES,
  MAX_TURN_SCAN_LINES,
};
