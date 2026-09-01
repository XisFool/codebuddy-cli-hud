'use strict';

const path = require('path');
const { color, bold, dim, formatTokens, createProgressBar, getThemeColor, RESET, calculateTurnCacheMetrics, formatTurnCacheBadge, metricsFromPromptCache } = require('./renderer/format');
const { renderDiffSegment } = require('./renderer/diff-render');
const { renderAgentLine, renderToolActivity } = require('./renderer/agents-render');
const { sanitizeTerminalText } = require('./sanitize');
const { selectGlyphs, supportsUnicode } = require('./encoding');
const { extractTokenData, extractDiffStats, extractCostData, extractAgentData } = require('./parser');
const { getGitStatus } = require('./git');
const { resolveEffortLevel, resolveCredits } = require('./model-info');
const { getRecentToolActivity, getTurnUsageMetrics } = require('./transcript');

function renderHUD(cbData, config) {
  if (!cbData || !config) return '';

  const rawCwd = (cbData && (cbData.cwd || (cbData.workspace && cbData.workspace.current_dir))) || process.cwd();
  const isSafeCwd = typeof rawCwd === 'string' && !rawCwd.includes('\0') && !/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(rawCwd);
  const cwd = isSafeCwd ? path.resolve(rawCwd) : process.cwd();
  const useUnicode = config.display.unicode === 'auto' ? supportsUnicode() : config.display.unicode !== false;
  const glyphs = selectGlyphs(config.display.useNerdFonts, useUnicode);
  const divider = `  \x1b[90m${glyphs.vbar}\x1b[0m  `;
  const lines = [];

  // Line 1: Identity & Environment (Clean English layout)
  const line1Parts = [];
  const rawModelName = (cbData.model && (cbData.model.display_name || cbData.model.id)) || 'unknown';
  const modelName = sanitizeTerminalText(rawModelName, 30);
  const effortLevel = resolveEffortLevel(cbData, config);
  const effortLabel = effortLevel || '--';
  const effortIcon = (effortLevel && glyphs.effortIcons && glyphs.effortIcons[effortLevel])
    ? glyphs.effortIcons[effortLevel]
    : (glyphs.effortIcons && glyphs.effortIcons.medium) || '';
  const effortColorMap = { low: 'gray', medium: 'blue', high: 'yellow', max: 'magenta' };
  const effortColor = effortColorMap[effortLevel] || 'gray';

  let modelSegment = bold(color(modelName, 'cyan'));
  modelSegment += ` ${color(`${effortIcon}${effortLabel}`, effortColor)}`;
  line1Parts.push(modelSegment);

  if (config.display.showGitBranch !== false) {
    const gitStatus = getGitStatus(cwd);
    if (gitStatus && gitStatus.branch) {
      const cleanBranch = sanitizeTerminalText(gitStatus.branch, 30);
      const dirtyMark = gitStatus.dirty ? color('*', 'yellow') : '';
      line1Parts.push(`${color(cleanBranch, 'cyan')}${dirtyMark}`);
    }
  }

  if (config.display.showCurrentDir !== false) {
    const dirName = sanitizeTerminalText(path.basename(cwd), 20);
    line1Parts.push(color(dirName, 'blue'));
  }

  if (config.display.showPermissionMode !== false && cbData.permission_mode) {
    // 22 chars fits `bypassPermissions` (17) plus headroom for future modes
    // without re-introducing the truncation that produced `bypassPermissio`.
    line1Parts.push(dim(color(sanitizeTerminalText(cbData.permission_mode, 22), 'magenta')));
  }

  if (config.display.showVersion === true && cbData.version) {
    line1Parts.push(dim('v' + sanitizeTerminalText(cbData.version, 10)));
  }

  lines.push(line1Parts.join(divider));

  // Line 2: Context Window & Tokens (Hollow Progress Bar + Dimmed Breakdown)
  const tokenData = extractTokenData(cbData);
  if (tokenData && config.display.showTokenBar !== false) {
    const line2Parts = [];
    const totalTokens = tokenData.inTokens + tokenData.outTokens;
    const dot = dim(` ${glyphs.dot} `);

    const tokenDetail = [
      `${dim('in: ')}${color(formatTokens(tokenData.inTokens), 'cyan')}`,
      `${dim('out: ')}${color(formatTokens(tokenData.outTokens), 'cyan')}`,
    ];

    const tokenStr = `${color(formatTokens(totalTokens), 'cyan')} ${dim('(')}${tokenDetail.join(dot)}${dim(')')}`;
    line2Parts.push(tokenStr);

    const barWidth = config.display.progressBarWidth || 10;
    const bar = createProgressBar(tokenData.ctxPercent, barWidth, config.thresholds, glyphs);
    // Numerator must match the denominator semantics used by used_percentage
    // (current_usage based). Previously we used totalInput (session-cumulative)
    // while the bar/percent used current_usage, producing wildly inconsistent
    // displays like `1.1M/1M [█░░░░░░░░░]6%`.
    const ctxLabel = `${color(formatTokens(tokenData.inTokens), 'cyan')}${dim('/')}${color(formatTokens(tokenData.ctxSize), 'cyan')}`;

    let pctColor = 'green';
    const warnPct = ((config.thresholds && config.thresholds.warning) || 0.7) * 100;
    const critPct = ((config.thresholds && config.thresholds.critical) || 0.9) * 100;
    if (tokenData.ctxPercent >= critPct) pctColor = 'red';
    else if (tokenData.ctxPercent >= warnPct) pctColor = 'yellow';

    const ctxPercentStr = color(`${Math.round(tokenData.ctxPercent)}%`, pctColor);
    line2Parts.push(`${ctxLabel} ${dim('[')}${bar}${dim(']')} ${ctxPercentStr}`);

    if (config.display.showCacheHitRate !== false) {
      // Real cache telemetry lives in the transcript's providerData, NOT in the
      // statusLine payload (whose cache_read_input_tokens is hard-zero on this
      // provider). A conversation turn spans many API calls (avg 19.3), so the
      // badge aggregates the whole current turn — sampling only the newest call
      // swings between ~0% (cold start) and ~99%.
      let cacheMetrics = null;
      const turnUsage = getTurnUsageMetrics(cbData.transcript_path, {
        cwd,
        tailBytes: config.display.toolActivityTailBytes,
      });
      if (turnUsage) {
        cacheMetrics = metricsFromPromptCache(turnUsage.hitTokens, turnUsage.promptTokens);
      }
      if (cacheMetrics === null) {
        const currentUsage = cbData.context_window && cbData.context_window.current_usage;
        cacheMetrics = calculateTurnCacheMetrics(currentUsage);
      }
      if (cacheMetrics !== null) {
        const cacheThresholds = config.cacheHitThresholds || {};
        const cacheBadge = formatTurnCacheBadge(cacheMetrics, 'cache', false, cacheThresholds);
        line2Parts.push(cacheBadge);
      }
    }

    lines.push(line2Parts.join(divider));
  }

  // Line 3: Diff Stats, Credits & Duration
  const diffStats = extractDiffStats(cbData);
  const costData = extractCostData(cbData);
  const totalCostUsd = costData ? costData.totalCostUsd : 0;
  const creditsStr = sanitizeTerminalText(resolveCredits(cbData, totalCostUsd), 30);
  const line3 = renderDiffSegment(diffStats, costData, config, glyphs, 'en', creditsStr);
  if (line3) lines.push(line3);

  // Line 4: Subagent/Task Status + Recent Tool Activity
  const agentData = extractAgentData(cbData);
  const line4Parts = [];
  line4Parts.push(renderAgentLine(agentData, config, glyphs, 'en'));
  if (config.display.showToolActivity !== false) {
    const tailBytes = config.display.toolActivityTailBytes;
    const activity = getRecentToolActivity(cbData.transcript_path, { cwd, tailBytes });
    line4Parts.push(renderToolActivity(activity, glyphs));
  }
  const line4 = line4Parts.filter(Boolean).join(divider);
  if (line4) lines.push(line4);

  const maxLines = config.display.maxLines || 4;
  return lines.slice(0, maxLines).join('\n');
}

module.exports = { renderHUD };
