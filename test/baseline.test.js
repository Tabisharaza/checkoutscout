import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditPaths } from '../src/audit.js';
import { compareBaseline, createBaseline, shouldFail, validateBaseline } from '../src/baseline.js';
const paths = ['src/Widget.js', 'src/widget.js', 'docs/CON.md'];
test('no baseline means all findings are new', () => {
  const result = compareBaseline(auditPaths(paths));
  assert.ok(result.summary.new >= 2); assert.equal(result.summary.existing, 0); assert.equal(shouldFail(result), true);
});
test('accepted findings stay visible and do not fail', () => {
  const audit = auditPaths(paths); const result = compareBaseline(audit, createBaseline(audit));
  assert.equal(result.summary.new, 0); assert.equal(result.summary.existing, audit.issues.length);
  assert.equal(shouldFail(result, true), false);
});
test('new invalid path fails without changing baseline', () => {
  const baseline = createBaseline(auditPaths(paths)); const before = JSON.stringify(baseline);
  const result = compareBaseline(auditPaths([...paths, 'bad?.txt']), baseline);
  assert.equal(result.summary.new, 1); assert.equal(shouldFail(result), true); assert.equal(JSON.stringify(baseline), before);
});
test('changed collision membership cannot inherit acceptance', () => {
  const baseline = createBaseline(auditPaths(['A', 'a']));
  const result = compareBaseline(auditPaths(['A', 'a', 'a/file']), baseline);
  assert.ok(result.summary.new > 0); assert.equal(shouldFail(result), true);
});
test('a removed finding appears as resolved or changed', () => {
  const result = compareBaseline(auditPaths(['src/widget.js']), createBaseline(auditPaths(paths)));
  assert.equal(result.summary.new, 0); assert.ok(result.summary.resolved >= 2);
});
test('warnings only fail with strict', () => {
  const result = compareBaseline(auditPaths(['a'.repeat(256)]));
  assert.ok(result.summary.warnings > 0); assert.equal(shouldFail(result), false); assert.equal(shouldFail(result, true), true);
});
test('malformed and duplicate baselines are rejected', () => {
  for (const value of [null, [], {}, {schemaVersion:2, tool:'CheckoutScout', issues:[]}, {schemaVersion:1,tool:'CheckoutScout',issues:[{}]}])
    assert.throws(() => validateBaseline(value), TypeError);
  const value = createBaseline(auditPaths(paths)); value.issues.push(value.issues[0]); assert.throws(() => validateBaseline(value), TypeError);
});
test('baseline is deterministic and contains names but not machine paths or timestamps', () => {
  assert.deepEqual(createBaseline(auditPaths(paths)), createBaseline(auditPaths([...paths].reverse())));
  const baseline = createBaseline(auditPaths(paths)); assert.deepEqual(Object.keys(baseline), ['schemaVersion','tool','issues']);
});
test('baseline descriptions must be cryptographically bound to their IDs', () => {
  const baseline = createBaseline(auditPaths(['CON']));
  baseline.issues[0].subject='innocent.txt'; baseline.issues[0].paths=['innocent.txt'];
  assert.throws(()=>validateBaseline(baseline), /fingerprint/);
});
test('unknown rule IDs cannot masquerade as baseline findings', () => {
  const baseline = createBaseline(auditPaths(['CON'])); baseline.issues[0].ruleId='bad\u001b[2J';
  assert.throws(()=>validateBaseline(baseline), /invalid/);
});
