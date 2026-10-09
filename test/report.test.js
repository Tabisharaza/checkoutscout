import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditPaths } from '../src/audit.js';
import { compareBaseline, createBaseline } from '../src/baseline.js';
import { displayPath, escapeHtml, renderText, renderHtml, renderJson } from '../src/report.js';
test('text paths neutralize terminal escapes, line breaks, bidi and invisible controls', () => {
  const value = displayPath('evil\u001b[31m\nname\u202e\u2066');
  assert.ok(!/[\u001b\n\u202e\u2066]/.test(value)); assert.ok(value.includes('\\u202e'));
});
test('HTML escapes all HTML metacharacters', () => {
  assert.equal(escapeHtml('<b a="x">&\''), '&lt;b a=&quot;x&quot;&gt;&amp;&#39;');
});
test('hostile filename stays inert in HTML and text', () => {
  const report = compareBaseline(auditPaths(['<img src=x onerror=alert(1)>.txt', 'evil\u001b[31m\nname']));
  const html = renderHtml(report); const text = renderText(report);
  assert.ok(!html.includes('<img')); assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<script')); assert.ok(!text.includes('\u001b'));
  assert.ok(html.includes("default-src 'none'"));
});
test('JSON is lossless valid machine data', () => {
  const report = compareBaseline(auditPaths(['bad\nname', 'A', 'a']));
  assert.deepEqual(JSON.parse(renderJson(report)), report);
});
test('all formats show current and retired baseline groups', () => {
  const baseline = createBaseline(auditPaths(['CON', 'PRN']));
  const report = compareBaseline(auditPaths(['CON', 'A', 'a']), baseline);
  assert.ok(renderText(report).includes('EXISTING')); assert.ok(renderText(report).includes('NEW'));
  assert.ok(renderHtml(report).includes('IN BASELINE')); assert.ok(renderHtml(report).includes('Baseline fingerprints no longer present'));
});
test('empty audit has a useful honest empty state', () => {
  const report = compareBaseline(auditPaths([]));
  assert.ok(renderText(report).includes('No modeled path hazards found')); assert.ok(renderHtml(report).includes('No modeled path hazards found'));
});
test('reports are deterministic', () => {
  const report = compareBaseline(auditPaths(['A', 'a']));
  assert.equal(renderHtml(report), renderHtml(report)); assert.equal(renderText(report), renderText(report));
});
test('text report defensively escapes untrusted resolved metadata', () => {
  const report=compareBaseline(auditPaths([]));
  report.resolved.push({ruleId:'bad\u001b[2J\n',subject:'safe'});
  assert.ok(!renderText(report).includes('\u001b'));
});
