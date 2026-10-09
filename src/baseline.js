import { createHash } from 'node:crypto';
import { RULES } from './audit.js';
const ruleIds = new Set(RULES.map(rule => rule.id));
export function createBaseline(report) {
  return { schemaVersion: 1, tool: 'CheckoutScout', issues: report.issues.map(({ id, ruleId, subject, paths }) => ({ id, ruleId, subject, paths })) };
}
export function validateBaseline(value) {
  if (!value || value.schemaVersion !== 1 || value.tool !== 'CheckoutScout' || !Array.isArray(value.issues) || value.issues.length > 100_000)
    throw new TypeError('Baseline must be a CheckoutScout schemaVersion 1 baseline.');
  const ids = new Set();
  for (const issue of value.issues) {
    if (!issue || !/^[a-f0-9]{64}$/.test(issue.id) || ids.has(issue.id) || typeof issue.ruleId !== 'string' ||
      typeof issue.subject !== 'string' || !issue.subject.isWellFormed() || !ruleIds.has(issue.ruleId) ||
      !Array.isArray(issue.paths) || !issue.paths.length || !issue.paths.every(path => typeof path === 'string' && path.isWellFormed() && path.length > 0 && path.length <= 32_768))
      throw new TypeError('Baseline has an invalid or duplicate issue entry.');
    const expected = createHash('sha256').update(JSON.stringify([issue.ruleId, issue.subject, issue.paths]), 'utf8').digest('hex');
    if (issue.id !== expected) throw new TypeError('Baseline fingerprint does not match its rule, subject, and affected paths.');
    ids.add(issue.id);
  }
  return value;
}
export function compareBaseline(report, baseline = { schemaVersion: 1, tool: 'CheckoutScout', issues: [] }) {
  validateBaseline(baseline);
  const previous = new Map(baseline.issues.map(issue => [issue.id, issue]));
  const current = new Set(report.issues.map(issue => issue.id));
  const issues = report.issues.map(issue => ({ ...issue, status: previous.has(issue.id) ? 'existing' : 'new' }));
  const resolved = baseline.issues.filter(issue => !current.has(issue.id));
  return { ...report, summary: { ...report.summary, new: issues.filter(issue => issue.status === 'new').length,
    existing: issues.filter(issue => issue.status === 'existing').length, resolved: resolved.length }, issues, resolved };
}
export function shouldFail(report, strict = false) {
  return report.issues.some(issue => issue.status === 'new' && (strict || issue.severity === 'error'));
}
