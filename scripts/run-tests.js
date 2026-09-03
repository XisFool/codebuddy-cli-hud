#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const unitDir = path.join(__dirname, '..', 'tests', 'unit');
const testFiles = fs.readdirSync(unitDir)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => path.join(unitDir, f));

const args = ['--test', ...process.argv.slice(2), ...testFiles];
const child = spawn(process.execPath, args, {
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
