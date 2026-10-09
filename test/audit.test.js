import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { auditPaths, RULES } from '../src/audit.js';

const byRule = (paths, ruleId) => auditPaths(paths).issues.filter((finding) => finding.ruleId === ruleId);
const issueRules = (paths) => auditPaths(paths).issues.map((finding) => finding.ruleId);

function one(paths, ruleId) {
  const findings = byRule(paths, ruleId);
  assert.equal(findings.length, 1, JSON.stringify(findings));
  return findings[0];
}

test('empty snapshot has the versioned public shape', () => {
  assert.deepEqual(auditPaths([]), {
    schemaVersion: 1,
    tool: { name: 'CheckoutScout', version: '0.1.0' },
    summary: { paths: 0, errors: 0, warnings: 0 },
    issues: [],
  });
});

test('ordinary, multilingual, hidden, emoji, and spaced names are accepted', () => {
  const paths = ['.github/workflows/check.yml', 'src/index.js', 'docs/hello world.md',
    '中文/你好.txt', 'العربية/ملف.txt', 'café.txt', '🦊.txt', '__proto__/constructor', 'toString/valueOf'];
  assert.deepEqual(auditPaths(paths).summary, { paths: paths.length, errors: 0, warnings: 0 });
});

test('input is deduplicated without mutation', () => {
  const paths = Object.freeze(['z', 'a', 'a']);
  assert.equal(auditPaths(paths).summary.paths, 2);
  assert.deepEqual(paths, ['z', 'a', 'a']);
});

test('rule metadata is complete, uniquely keyed, and immutable', () => {
  assert.equal(new Set(RULES.map((rule) => rule.id)).size, RULES.length);
  assert.equal(RULES.length, 10);
  assert(Object.isFrozen(RULES));
  for (const rule of RULES) {
    assert(Object.isFrozen(rule));
    assert.deepEqual(Object.keys(rule).sort(), ['description', 'help', 'id', 'severity', 'title']);
    for (const value of Object.values(rule)) assert.equal(typeof value, 'string');
    assert(['error', 'warning'].includes(rule.severity));
  }
});

test('ASCII file case aliases produce one grouped error', () => {
  const finding = one(['Readme.md', 'README.md', 'readme.md'], 'case-collision');
  assert.equal(finding.subject, 'readme.md');
  assert.equal(finding.severity, 'error');
  assert.deepEqual(finding.paths, ['README.md', 'Readme.md', 'readme.md']);
  assert.equal(auditPaths(finding.paths).issues.length, 1);
});

test('directory aliases collide even when no leaf filename is shared', () => {
  const finding = one(['Docs/a.md', 'docs/b.md', 'Docs/nested/c.md'], 'case-collision');
  assert.equal(finding.subject, 'docs');
  assert.deepEqual(finding.paths, ['Docs/a.md', 'Docs/nested/c.md', 'docs/b.md']);
});

test('a colliding ancestor suppresses descendant directory noise', () => {
  const result = auditPaths(['Docs/sub/deeper/a', 'docs/sub/deeper/b', 'Docs/Folder/c', 'docs/folder/d']);
  assert.deepEqual(result.issues.map((finding) => finding.subject), ['docs']);
});

test('distinct colliding leaves below a colliding directory remain visible', () => {
  const result = auditPaths(['Docs/sub/README', 'docs/sub/readme']);
  assert.deepEqual(result.issues.map((finding) => finding.subject), ['docs', 'docs/sub/readme']);
  assert.deepEqual(result.issues.map((finding) => finding.ruleId), ['case-collision', 'case-collision']);
});

test('equal leaf basenames under an aliased directory are a real leaf collision', () => {
  assert.deepEqual(byRule(['Docs/sub/file', 'docs/sub/file'], 'case-collision').map((finding) => finding.subject),
    ['docs', 'docs/sub/file']);
});

test('different parent directories keep matching basenames separate', () => {
  assert.deepEqual(auditPaths(['a/README', 'b/readme']).issues, []);
});

test('NFC aliases produce an error without a duplicate heuristic warning', () => {
  const paths = ['café.txt', 'cafe\u0301.txt'];
  const finding = one(paths, 'normalization-collision');
  assert.equal(finding.subject, 'café.txt');
  assert.equal(auditPaths(paths).issues.length, 1);
});

test('NFC directory aliases include every affected leaf', () => {
  const paths = ['café/a', 'cafe\u0301/b', 'cafe\u0301/c'];
  const finding = one(paths, 'normalization-collision');
  assert.equal(finding.subject, 'café');
  assert.equal(finding.paths.length, 3);
});

test('combined NFC and ASCII-case aliasing is distinguished from either alone', () => {
  const paths = ['Café/a', 'cafe\u0301/b'];
  const finding = one(paths, 'normalized-case-collision');
  assert.equal(finding.subject, 'café');
  assert.equal(finding.severity, 'error');
  assert.equal(auditPaths(paths).issues.length, 1);
});

test('mixed normalization and ASCII aliases form one canonical group', () => {
  const paths = ['Café', 'café', 'Cafe\u0301', 'cafe\u0301'];
  const finding = one(paths, 'normalized-case-collision');
  assert.equal(finding.paths.length, 4);
  assert.equal(auditPaths(paths).issues.length, 1);
});

test('canonical normalization equivalence can include the Kelvin sign', () => {
  assert.deepEqual(issueRules(['K', 'K']), ['normalization-collision']);
  assert.deepEqual(issueRules(['K', 'k']), ['normalized-case-collision']);
});

test('NFKC compatibility lookalikes are not treated as NFC aliases', () => {
  assert.deepEqual(auditPaths(['Ａ', 'A', 'ﬁ', 'fi', '①', '1']).issues, []);
});

test('non-ASCII case equivalence is only a warning', () => {
  const result = auditPaths(['É.txt', 'é.txt']);
  assert.deepEqual(result.summary, { paths: 2, errors: 0, warnings: 1 });
  assert.equal(result.issues[0].ruleId, 'unicode-case-collision');
  assert.match(result.issues[0].help, /heuristic/);
});

test('non-ASCII directory aliases are detected with different leaves', () => {
  const finding = one(['Ä/sub/a', 'ä/sub/b'], 'unicode-case-collision');
  assert.equal(finding.subject, 'ä');
  assert.deepEqual(finding.paths, ['Ä/sub/a', 'ä/sub/b']);
});

test('distinct non-ASCII leaf collisions survive ancestor-warning suppression', () => {
  assert.deepEqual(byRule(['Ä/sub/X', 'ä/sub/x'], 'unicode-case-collision').map((finding) => finding.subject),
    ['ä', 'ä/sub/x']);
});

test('an ASCII ancestor collision also suppresses repeated Unicode directory noise', () => {
  const result = auditPaths(['Docs/Ä/sub/a', 'docs/ä/sub/b']);
  assert.deepEqual(result.issues.map((finding) => finding.ruleId), ['case-collision']);
});

test('a broader Unicode equivalence is still reported beside an exact NFC subgroup', () => {
  const result = auditPaths(['Ä', 'A\u0308', 'ä']);
  assert.deepEqual(result.issues.map((finding) => finding.ruleId), ['normalization-collision', 'unicode-case-collision']);
  assert.equal(result.issues[0].paths.length, 2);
  assert.equal(result.issues[1].paths.length, 3);
});

test('Unicode heuristic normalizes combining sequences created by lowercase', () => {
  assert.deepEqual(issueRules(['J\u030C', 'ǰ']), ['unicode-case-collision']);
  assert.deepEqual(issueRules(['İ', 'i\u0307']), ['unicode-case-collision']);
});

test('Unicode heuristic does not promise full case folding or locale tailoring', () => {
  assert.deepEqual(auditPaths(['Straße', 'STRASSE', 'ς', 'σ', 'ı', 'I']).issues, []);
});

test('exact file-directory conflict is reported by the pure API', () => {
  const finding = one(['thing', 'thing/child', 'thing/sub/deep'], 'file-directory-collision');
  assert.equal(finding.subject, 'thing');
  assert.deepEqual(finding.paths, ['thing', 'thing/child', 'thing/sub/deep']);
});

test('folded file-directory conflict emits one error instead of duplicate case issues', () => {
  const paths = ['Docs', 'docs/a', 'DOCS/b'];
  assert.deepEqual(issueRules(paths), ['file-directory-collision']);
  assert.equal(one(paths, 'file-directory-collision').subject, 'docs');
});

test('normalization participates in file-directory conflicts', () => {
  const paths = ['Café', 'cafe\u0301/a'];
  assert.deepEqual(issueRules(paths), ['file-directory-collision']);
});

test('nested file-directory conflicts are retained under an ancestor alias', () => {
  const result = auditPaths(['Docs/sub', 'docs/sub/file']);
  assert.deepEqual(result.issues.map((finding) => finding.ruleId), ['case-collision', 'file-directory-collision']);
  assert.deepEqual(result.issues.map((finding) => finding.subject), ['docs', 'docs/sub']);
});

test('Unicode-only file-directory equivalence remains a warning', () => {
  const finding = one(['Ä', 'ä/file'], 'unicode-case-collision');
  assert.equal(finding.severity, 'warning');
  assert.match(finding.message, /file\/directory/);
  assert.equal(auditPaths(['Ä', 'ä/file']).summary.errors, 0);
});

for (const character of [...'<>:"\\|?*', ...Array.from({ length: 31 }, (_, index) => String.fromCodePoint(index + 1))]) {
  test(`Windows forbidden character U+${character.codePointAt(0).toString(16)} is recognized literally`, () => {
    const finding = one([`folder/name${character}tail`], 'windows-forbidden-character');
    assert.equal(finding.subject, `folder/name${character}tail`);
    assert.equal(finding.severity, 'error');
  });
}

test('multiple forbidden characters in a component form one stable finding', () => {
  const finding = one(['bad?:??\tname'], 'windows-forbidden-character');
  assert.match(finding.message, /U\+0009, U\+003A, U\+003F/);
});

test('directory component violations group all and only affected leaves', () => {
  const finding = one(['bad?/a', 'bad?/sub/b', 'bad?/c', 'good/d'], 'windows-forbidden-character');
  assert.equal(finding.subject, 'bad?');
  assert.deepEqual(finding.paths, ['bad?/a', 'bad?/c', 'bad?/sub/b']);
});

test('same invalid component in separate directories creates separate findings', () => {
  assert.deepEqual(byRule(['one/NUL/a', 'two/NUL/b'], 'windows-reserved-name').map((finding) => finding.subject),
    ['one/NUL', 'two/NUL']);
});

test('backslash is an invalid filename character, not a directory separator', () => {
  const finding = one(['a\\b/file'], 'windows-forbidden-character');
  assert.equal(finding.subject, 'a\\b');
  assert.deepEqual(finding.paths, ['a\\b/file']);
});

test('colon in a Git component is audited, not mistaken for a Windows drive', () => {
  const finding = one(['C:/folder/file'], 'windows-forbidden-character');
  assert.equal(finding.subject, 'C:');
});

for (const name of ['CON', 'PRN', 'AUX', 'NUL',
  ...[...'123456789¹²³'].flatMap((digit) => [`COM${digit}`, `LPT${digit}`])]) {
  test(`Windows device ${name} is rejected bare, mixed-case, with extensions, and as directory`, () => {
    const paths = [`one/${name}`, `two/${name.toLowerCase()}.txt`, `three/${name}.tar.gz`, `four/${name}/child`];
    assert.equal(byRule(paths, 'windows-reserved-name').length, 4);
  });
}

test('device-like longer names are not false positives', () => {
  assert.deepEqual(auditPaths(['CONSOLE', 'xNUL', 'COM0', 'COM10', 'COM⁴', 'LPT0', 'LPT10', 'LPT⁴',
    '.CON', 'NULx.txt', 'CON .txt', 'NUL\u00A0']).issues, []);
});

test('final newline does not act as an end-of-component match for other rules', () => {
  assert.deepEqual(issueRules(['CON\n', 'okay.\n', 'okay \r\n']),
    ['windows-forbidden-character', 'windows-forbidden-character', 'windows-forbidden-character']);
});

test('trailing dot and ASCII space are recognized in files and directories', () => {
  const paths = ['file.', 'file ', 'directory./a', 'directory /b', 'trailing...'];
  assert.equal(byRule(paths, 'windows-trailing-dot-space').length, 5);
});

test('leading or interior periods/spaces and non-ASCII trailing space are allowed', () => {
  assert.deepEqual(auditPaths(['.hidden', ' leading', 'a b', 'a.b', 'name\u00A0', 'name\u3000']).issues, []);
});

test('each violated component rule remains independently represented', () => {
  const result = auditPaths(['NUL.? ']);
  assert.deepEqual(result.issues.map((finding) => finding.ruleId),
    ['windows-forbidden-character', 'windows-reserved-name', 'windows-trailing-dot-space']);
});

test('255 ASCII bytes is within the component warning threshold', () => {
  assert.deepEqual(auditPaths(['a'.repeat(255)]).issues, []);
});

test('256 ASCII bytes exceeds the component warning threshold', () => {
  const finding = one(['a'.repeat(256)], 'component-length');
  assert.equal(finding.severity, 'warning');
  assert.match(finding.message, /256 UTF-8 bytes and 256 UTF-16/);
});

test('UTF-8 byte length is checked independently of UTF-16 units', () => {
  assert.deepEqual(auditPaths(['é'.repeat(127)]).issues, []);
  const finding = one(['é'.repeat(128)], 'component-length');
  assert.match(finding.message, /256 UTF-8 bytes and 128 UTF-16/);
});

test('astral code points count as four UTF-8 bytes and two UTF-16 units', () => {
  assert.deepEqual(auditPaths(['🦊'.repeat(63)]).issues, []);
  const finding = one(['🦊'.repeat(64)], 'component-length');
  assert.match(finding.message, /256 UTF-8 bytes and 128 UTF-16/);
});

test('length is component-local rather than a blanket full-path limit', () => {
  assert.deepEqual(auditPaths([Array(10).fill('a'.repeat(100)).join('/')]).issues, []);
});

test('long directory component groups affected leaves', () => {
  const name = 'x'.repeat(256);
  const finding = one([`${name}/a`, `${name}/b`, 'ordinary/c'], 'component-length');
  assert.equal(finding.subject, name);
  assert.deepEqual(finding.paths, [`${name}/a`, `${name}/b`]);
});

const warnedControls = [0x00AD, 0x061C, 0x180E, ...Array.from({ length: 5 }, (_, i) => 0x200B + i),
  ...Array.from({ length: 5 }, (_, i) => 0x202A + i), ...Array.from({ length: 5 }, (_, i) => 0x2060 + i),
  ...Array.from({ length: 10 }, (_, i) => 0x2066 + i), 0xFEFF];
for (const point of warnedControls) {
  test(`precisely scoped format-control warning includes U+${point.toString(16).toUpperCase()}`, () => {
    const finding = one([`safe${String.fromCodePoint(point)}name`], 'invisible-format-character');
    assert.equal(finding.severity, 'warning');
    assert.match(finding.message, new RegExp(`U\\+${point.toString(16).toUpperCase().padStart(4, '0')}`));
  });
}

test('format warning does not widen to neighboring code points or combining marks', () => {
  const points = [0x00AC, 0x00AE, 0x061B, 0x061D, 0x180D, 0x180F, 0x200A, 0x2010,
    0x2029, 0x202F, 0x205F, 0x2065, 0x2070, 0xFEFE, 0xFF00, 0xFE0F, 0x034F];
  const paths = points.map((point) => `safe${String.fromCodePoint(point)}name`);
  assert.deepEqual(auditPaths(paths).issues, []);
});

test('repeated invisible controls are reported once per code point', () => {
  const finding = one(['name\u200B\u202E\u200B'], 'invisible-format-character');
  assert.match(finding.message, /U\+200B, U\+202E\./);
});

for (const value of [undefined, null, 'file', new Set(['file']), {}, 1, true]) {
  test(`non-array input ${String(value)} throws TypeError`, () => {
    assert.throws(() => auditPaths(value), TypeError);
  });
}

for (const value of [undefined, null, 1, true, {}, ['nested'], new String('boxed')]) {
  test(`non-string entry ${String(value)} throws TypeError`, () => {
    assert.throws(() => auditPaths(['okay', value]), /paths\[1\] must be a string/);
  });
}

test('sparse arrays do not silently discard missing input entries', () => {
  assert.throws(() => auditPaths(Array(1)), TypeError);
});

for (const path of ['', '/', '/absolute', 'trailing/', 'two//parts', '.', '..', './a', '../a',
  'a/./b', 'a/../b', 'a/.', 'a/..', 'bad\0name', '\0', 'a/\0/b', '\uD800', '\uDC00',
  'a\uD800b', 'a\uDC00b', '\uD800\uD800', '\uDC00\uD800']) {
  test(`malformed Git-style path ${JSON.stringify(path)} throws TypeError`, () => {
    assert.throws(() => auditPaths(['okay', path]), TypeError);
  });
}

test('valid surrogate pairs survive validation', () => {
  assert.deepEqual(auditPaths(['\uD800\uDC00']).issues, []);
});

test('100,000 input entries are allowed before deduplication', () => {
  assert.deepEqual(auditPaths(Array(100_000).fill('same')).summary, { paths: 1, errors: 0, warnings: 0 });
});

test('more than 100,000 entries are rejected even when duplicate', () => {
  assert.throws(() => auditPaths(Array(100_001).fill('same')), /at most 100000/);
});

test('a 32,768-unit path within the depth budget is accepted', () => {
  const path = `${`${'a'.repeat(255)}/`.repeat(127)}${'b'.repeat(250)}/12345`;
  assert.equal(path.length, 32_768);
  assert.deepEqual(auditPaths([path]).issues, []);
});

test('depth 256 is accepted and depth 257 is rejected before tree allocation', () => {
  assert.deepEqual(auditPaths([Array(256).fill('a').join('/')]).issues, []);
  assert.throws(() => auditPaths([Array(257).fill('a').join('/')]), /at most 256 components/);
});

test('deep invalid-component amplification is rejected at the depth boundary', () => {
  assert.throws(() => auditPaths([Array(1_500).fill('?').join('/')]), /at most 256 components/);
});

test('250,000 total unique-path components is accepted; one extra is rejected', () => {
  const prefix = 'a/'.repeat(249);
  const paths = Array.from({ length: 1_000 }, (_, index) => `${prefix}file-${index}`);
  assert.deepEqual(auditPaths(paths).summary, { paths: 1_000, errors: 0, warnings: 0 });
  assert.throws(() => auditPaths([...paths, 'extra']), /at most 250000 components/);
});

test('duplicate input entries do not consume the aggregate component budget', () => {
  const path = `${'a/'.repeat(249)}leaf`;
  assert.deepEqual(auditPaths(Array(1_001).fill(path)).summary, { paths: 1, errors: 0, warnings: 0 });
});

test('32 MiB of unique-path UTF-8 bytes is accepted; one extra byte is rejected', () => {
  const prefix = `${`${'a'.repeat(255)}/`.repeat(127)}${'b'.repeat(250)}/`;
  const paths = Array.from({ length: 1_024 }, (_, index) => `${prefix}${String(index).padStart(5, '0')}`);
  assert.equal(paths.reduce((total, path) => total + Buffer.byteLength(path), 0), 32 * 1024 * 1024);
  assert.deepEqual(auditPaths(paths).summary, { paths: 1_024, errors: 0, warnings: 0 });
  assert.throws(() => auditPaths([...paths, 'x']), /at most 33554432 UTF-8 bytes/);
});

test('10,000 diagnostic issues is accepted; another throws instead of truncating', () => {
  const paths = Array.from({ length: 10_000 }, (_, index) => `bad-${String(index).padStart(5, '0')}?`);
  assert.equal(auditPaths(paths).issues.length, 10_000);
  assert.throws(() => auditPaths([...paths, 'extra?']), /10000-issue limit/);
});

test('amplified diagnostic leaf membership is rejected without a partial audit', () => {
  const prefix = '?/'.repeat(255);
  const paths = Array.from({ length: 900 }, (_, index) => `${prefix}leaf-${index}`);
  assert.throws(() => auditPaths(paths), /8388608 UTF-8 JSON bytes/);
});

test('diagnostic budget includes escaped characters and all fields', () => {
  const paths = Array.from({ length: 100 }, (_, index) => `${String(index).padStart(3, '0')}${'\u0001'.repeat(8_000)}`);
  assert(paths.reduce((total, path) => total + Buffer.byteLength(path), 0) < 1024 * 1024);
  assert.throws(() => auditPaths(paths), /8388608 UTF-8 JSON bytes/);
});

test('a path beyond 32,768 UTF-16 code units is rejected', () => {
  assert.throws(() => auditPaths(['a'.repeat(32_769)]), /32768/);
});

test('issue IDs are stable SHA-256 hashes of the documented canonical payload', () => {
  const finding = one(['docs/NUL/a', 'docs/NUL/b'], 'windows-reserved-name');
  const expected = createHash('sha256').update(JSON.stringify([finding.ruleId, finding.subject, finding.paths])).digest('hex');
  assert.equal(finding.id, expected);
  assert.match(finding.id, /^[0-9a-f]{64}$/);
});

test('paths use code-point order rather than UTF-16 order or host locale', () => {
  const finding = one(['NUL/\u{10000}', 'NUL/\uE000', 'NUL/z', 'NUL/A'], 'windows-reserved-name');
  assert.deepEqual(finding.paths, ['NUL/A', 'NUL/z', 'NUL/\uE000', 'NUL/\u{10000}']);
});

test('issues use deterministic severity, subject, and rule order', () => {
  const result = auditPaths(['z?', 'a?', 'z\u200B', 'a\u200B', 'NUL.? ']);
  assert.deepEqual(result.issues.map(({ severity, subject }) => [severity, subject]), [
    ['error', 'NUL.? '], ['error', 'NUL.? '], ['error', 'NUL.? '], ['error', 'a?'], ['error', 'z?'],
    ['warning', 'a\u200B'], ['warning', 'z\u200B'],
  ]);
});

test('input order and duplicate entries do not affect output or identifiers', () => {
  const paths = ['Docs/A', 'docs/a', 'café/x', 'cafe\u0301/y', 'NUL/x?', 'Ä', 'ä', 'z\u200B'];
  const expected = auditPaths(paths);
  assert.deepEqual(auditPaths([...paths].reverse()), expected);
  assert.deepEqual(auditPaths([...paths.slice(3), ...paths.slice(0, 3), ...paths]), expected);
});

test('unrelated clean paths do not alter existing issue identifiers', () => {
  const paths = ['bad?/a', 'bad?/b', 'Readme', 'README'];
  assert.deepEqual(auditPaths([...paths, 'unrelated/okay']).issues, auditPaths(paths).issues);
});

test('new exposure under a violating directory changes its baseline identity', () => {
  const before = one(['NUL/a'], 'windows-reserved-name');
  const after = one(['NUL/a', 'NUL/b'], 'windows-reserved-name');
  assert.notEqual(before.id, after.id);
});

test('returned data is JSON serializable and safe to mutate without poisoning later calls', () => {
  const result = auditPaths(['NUL']);
  const original = structuredClone(result);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  result.issues[0].paths.push('elsewhere');
  result.issues[0].help = 'changed';
  result.tool.name = 'changed';
  assert.deepEqual(auditPaths(['NUL']), original);
});

test('synthetic mixed snapshots preserve schema and deterministic invariants', () => {
  let state = 0x1A2B3C4D;
  const next = () => { state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0; return state; };
  const directories = ['src', 'Src', 'café', 'cafe\u0301', 'Ä', 'ä', 'NUL', 'bad?', 'clean', 'long'.repeat(70)];
  const names = ['a', 'A', 'b.txt', 'B.txt', 'readme.', 'aux', 'x\u200B', 'value', 'value '];
  const known = new Map(RULES.map((rule) => [rule.id, rule]));
  for (let sample = 0; sample < 30; sample += 1) {
    const paths = Array.from({ length: 30 }, () => `${directories[next() % directories.length]}/${names[next() % names.length]}`);
    const result = auditPaths(paths);
    assert.deepEqual(auditPaths([...paths].reverse()), result);
    assert.equal(result.summary.paths, new Set(paths).size);
    assert.equal(result.summary.errors + result.summary.warnings, result.issues.length);
    assert.equal(new Set(result.issues.map((finding) => finding.id)).size, result.issues.length);
    for (const finding of result.issues) {
      assert.equal(finding.severity, known.get(finding.ruleId).severity);
      assert(finding.subject.length > 0);
      assert(finding.paths.length > 0);
      assert(finding.paths.every((path) => paths.includes(path)));
      assert.deepEqual(Object.keys(finding).sort(), ['help', 'id', 'message', 'paths', 'ruleId', 'severity', 'subject']);
    }
  }
});
