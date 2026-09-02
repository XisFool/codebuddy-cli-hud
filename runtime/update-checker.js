'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const { getUpdateStatusPath } = require('./paths');

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REMOTE_PKG_URL = process.env.CODEBUDDY_HUD_REMOTE_PKG_URL || 'https://raw.githubusercontent.com/XisFool/codebuddy-hud/master/package.json';

function parseSemver(v) {
  if (typeof v !== 'string') return [0, 0, 0];
  const clean = v.trim().replace(/^v/, '');
  const parts = clean.split('.').map(p => parseInt(p, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
}

function compareVersions(v1, v2) {
  const [maj1, min1, pat1] = parseSemver(v1);
  const [maj2, min2, pat2] = parseSemver(v2);

  if (maj1 !== maj2) return maj1 > maj2 ? 1 : -1;
  if (min1 !== min2) return min1 > min2 ? 1 : -1;
  if (pat1 !== pat2) return pat1 > pat2 ? 1 : -1;
  return 0;
}

function getLocalVersion() {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg && typeof pkg.version === 'string') return pkg.version;
    }
  } catch {
    // ignore
  }
  return '0.1.0';
}

function readUpdateStatus() {
  try {
    const filePath = getUpdateStatusPath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (data && typeof data === 'object') return data;
    }
  } catch {
    // ignore
  }
  return null;
}

function writeUpdateStatus(status) {
  try {
    const filePath = getUpdateStatusPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(status, null, 2));
  } catch {
    // best-effort
  }
}

function fetchRemotePackageJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'codebuddy-hud-update-checker' } }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy(new Error('Request timeout'));
    });
  });
}

async function checkForUpdates(options) {
  const opts = options || {};
  const force = !!opts.force;
  const currentStatus = readUpdateStatus();
  const now = Date.now();

  if (!force && currentStatus && currentStatus.lastCheck && (now - currentStatus.lastCheck < CHECK_INTERVAL_MS)) {
    return currentStatus;
  }

  const localVersion = opts.localVersion || getLocalVersion();
  let latestVersion = localVersion;
  let updateAvailable = false;

  try {
    const remotePkg = await fetchRemotePackageJson(opts.url || REMOTE_PKG_URL);
    if (remotePkg && typeof remotePkg.version === 'string') {
      latestVersion = remotePkg.version;
      updateAvailable = compareVersions(latestVersion, localVersion) > 0;
    }
  } catch (err) {
    // network failure: preserve existing update state if valid, just refresh lastCheck
    if (currentStatus) {
      currentStatus.lastCheck = now;
      writeUpdateStatus(currentStatus);
      return currentStatus;
    }
  }

  const newStatus = {
    updateAvailable,
    latestVersion,
    localVersion,
    lastCheck: now,
  };

  writeUpdateStatus(newStatus);
  return newStatus;
}

function spawnBackgroundUpdateCheck() {
  try {
    const currentStatus = readUpdateStatus();
    const now = Date.now();
    if (currentStatus && currentStatus.lastCheck && (now - currentStatus.lastCheck < CHECK_INTERVAL_MS)) {
      return; // Not due for check yet
    }

    const scriptPath = __filename;
    const child = spawn(process.execPath, [scriptPath, '--run-check'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch {
    // Fail silently, never crash main process
  }
}

if (require.main === module) {
  if (process.argv.includes('--run-check')) {
    checkForUpdates()
      .then(() => process.exit(0))
      .catch(() => process.exit(0));
  } else {
    checkForUpdates({ force: true }).then((res) => {
      console.log('Update check result:', res);
    });
  }
}

module.exports = {
  compareVersions,
  parseSemver,
  getLocalVersion,
  readUpdateStatus,
  writeUpdateStatus,
  checkForUpdates,
  spawnBackgroundUpdateCheck,
  CHECK_INTERVAL_MS,
};
