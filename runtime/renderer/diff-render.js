'use strict';

const { color, dim, formatTokens, formatDurationMs, getThemeColor, RESET } = require('./format');

function renderDiffSegment(diffStats, costData, config, glyphs, lang, creditsStr) {
  const parts = [];
  const display = (config && config.display) || {};

  const added = (diffStats && diffStats.linesAdded) || 0;
  const removed = (diffStats && diffStats.linesRemoved) || 0;
  const hasDiff = added > 0 || removed > 0;
  const totalCostUsd = (costData && costData.totalCostUsd) || 0;
  const totalMs = (costData && costData.totalDurationMs) || 0;
  const apiMs = (costData && costData.apiDurationMs) || 0;
  const hasCost = Boolean(costData && (totalCostUsd > 0 || totalMs > 0));

  // If there's no diff and no cost/duration data, omit Line 3 completely
  if (!hasDiff && !hasCost) {
    return '';
  }

  // 1. Diff stats (+added -removed)
  if (display.showDiffStats !== false && hasDiff) {
    const addColor = getThemeColor(config, 'diffAdd', 'green');
    const remColor = getThemeColor(config, 'diffRemove', 'red');
    const addStr = added > 0 ? `${addColor}+${formatTokens(added)}${RESET}` : '';
    const remStr = removed > 0 ? `${remColor}-${formatTokens(removed)}${RESET}` : '';
    const diffStr = [addStr, remStr].filter(Boolean).join(' ');
    if (diffStr) parts.push(diffStr);
  }

  // 2. Cost / Credits
  if (display.showCost !== false) {
    if (totalCostUsd > 0) {
      parts.push(color(`$${totalCostUsd.toFixed(2)}`, 'yellow'));
    } else if (creditsStr && (hasDiff || hasCost)) {
      const numMatch = creditsStr.match(/([\d.]+)/);
      const numVal = numMatch ? parseFloat(numMatch[1]) : 0;
      if (numVal > 0) {
        parts.push(color(creditsStr, 'yellow'));
      } else {
        parts.push(dim(creditsStr));
      }
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

module.exports = { renderDiffSegment };
