import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { runDoctor, printDoctorReport } = require('../../runtime/doctor.js');

describe('doctor diagnosis tool', () => {
  test('runDoctor returns structured check report without throwing', () => {
    const report = runDoctor({ cwd: process.cwd() });
    assert.equal(typeof report, 'object');
    assert.equal(typeof report.ok, 'boolean');
    assert.ok(['ok', 'warn', 'fail'].includes(report.status));
    assert.ok(Array.isArray(report.checks));
    assert.ok(report.checks.length >= 5);

    const categories = report.checks.map(c => c.category);
    assert.ok(categories.includes('node'));
    assert.ok(categories.includes('codebuddy'));
    assert.ok(categories.includes('terminal'));
    assert.ok(categories.includes('git'));
    assert.ok(categories.includes('transcript'));
  });

  test('printDoctorReport supports both ANSI and JSON mode without crashing', () => {
    const report = runDoctor({ cwd: process.cwd() });
    assert.doesNotThrow(() => {
      printDoctorReport(report, false);
    });
    assert.doesNotThrow(() => {
      printDoctorReport(report, true);
    });
  });
});
