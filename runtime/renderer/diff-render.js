'use strict';

const { color, dim, formatTokens, formatDurationMs, getThemeColor, RESET } = require('./format');

function formatCreditSpend(creditSpend) {
  if (!Number.isFinite(creditSpend) || creditSpend < 0) return '';
  return `${creditSpend.toFixed(2)} credits`;
}

function renderDiffSegment(diffStats, costData, config, glyphs, lang, creditSpend) {
  const parts = [];
  const display = (config && config.display) || {};

  const added = (diffStats && diffStats.linesAdded) || 0;
  const removed = (diffStats && diffStats.linesRemoved) || 0;
  const hasDiff = added > 0 || removed > 0;
  const totalCostUsd = (costData && costData.totalCostUsd) || 0;
  const totalMs = (costData && costData.totalDurationMs) || 0;
  const apiMs = (costData && costData.apiDurationMs) || 0;
  const hasCost = Boolean(costData && (totalCostUsd > 0 || totalMs > 0));
  const hasCreditSpend = Number.isFinite(creditSpend) && creditSpend >= 0;

  // If there's no diff and no cost/duration data, omit Line 3 completely
  if (!hasDiff && !hasCost && !hasCreditSpend) {
    return '';
  }

  // 1. Diff stats (+added -removed)
  if (display.showDiffStats !== false && hasDiff) {
    const addColor = getThemeColor(config, 'diffAdd', 'green');
    const remColor = getThemeColor(config, 'diffRemove', 'red');
    const addStr = added > 0 ? `${addColor}+${formatTokens(added)}${RESET}` : '';
    const remStr = removed > 0 ? `${remColor}-${formatTokens(removed)}${RESET}` : '';
    const diffStr = [addStr, remStr].filter(Boolean).join(' ');
    if (diffStr) parts.push(`${dim((glyphs && glyphs.diffIcon) || '')}${diffStr}`);
  }

  // 2. Cost / Credits
  if (display.showCost !== false) {
    if (hasCreditSpend) {
      parts.push(color(formatCreditSpend(creditSpend), 'yellow'));
    } else if (totalCostUsd > 0) {
      parts.push(color(`$${totalCostUsd.toFixed(2)}`, 'yellow'));
    }
  }

  // 3. Duration & API Duration
  if (display.showDuration !== false && totalMs > 0) {
    let timeStr = `${glyphs.clockIcon}${formatDurationMs(totalMs)}`;
    if (apiMs > 0 && apiMs !== totalMs) {
      timeStr += ` (API: ${formatDurationMs(apiMs)})`;
    }
    parts.push(color(timeStr, 'gray'));
  }

  if (parts.length === 0) return '';
  return parts.join(`  \x1b[90m${glyphs.vbar}\x1b[0m  `);
}

module.exports = { renderDiffSegment, formatCreditSpend };
