'use strict';

const { color, dim } = require('./format');
const { sanitizeTerminalText } = require('../sanitize');

function renderAgentLine(agentData, config, glyphs, lang) {
  if (!agentData) return '';
  if (config.display && config.display.showAgentStatus === false) return '';

  const parts = [];
  const divider = `  \x1b[90m${glyphs.vbar}\x1b[0m  `;

  if (agentData.active && agentData.active.length > 0) {
    const count = agentData.active.length;
    const names = agentData.active
      .slice(0, 3)
      .map(a => sanitizeTerminalText(a.name || a.id, 12))
      .filter(Boolean)
      .join(', ');
    const nameStr = names ? ` (${names})` : '';
    parts.push(`${glyphs.activeIcon}${color(`${count} active${nameStr}`, 'cyan')}`);
  }

  if (agentData.queueDepth > 0) {
    parts.push(`${glyphs.queueIcon}${color(`Queue: ${agentData.queueDepth}`, 'yellow')}`);
  }

  if (agentData.totalCount > 0) {
    parts.push(`${glyphs.doneIcon}${color(`Done ${agentData.completedCount}/${agentData.totalCount}`, 'green')}`);
  }

  if (parts.length === 0) return '';
  return parts.join(divider);
}

function renderToolActivity(activity, glyphs) {
  if (!activity || !activity.tool) return '';
  if (activity.status === 'active') {
    const detailStr = activity.detail ? dim(`: ${activity.detail}`) : '';
    return `${glyphs.activeIcon}${color(activity.tool, 'cyan')}${detailStr}`;
  }
  return `${color(glyphs.doneIcon.trim(), 'green')} ${dim(activity.tool)}`;
}

module.exports = { renderAgentLine, renderToolActivity };
