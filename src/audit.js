import { createHash } from 'node:crypto';

const MAX_PATHS = 100_000;
const MAX_PATH_UNITS = 32_768;
const MAX_DEPTH = 256;
const MAX_TOTAL_COMPONENTS = 250_000;
const MAX_TOTAL_PATH_BYTES = 32 * 1024 * 1024;
const MAX_ISSUES = 10_000;
const MAX_DIAGNOSTIC_BYTES = 8 * 1024 * 1024;

/**
 * Stable public rule metadata. These are portability checks, not an emulator of
 * every filesystem, Windows namespace, Git configuration, or Unicode case table.
 */
export const RULES = Object.freeze([
  {
    id: 'case-collision',
    title: 'ASCII case collision',
    severity: 'error',
    description: 'Distinct file or directory spellings match after ASCII A–Z are lowercased.',
    help: 'Choose one directory spelling and give colliding files distinct names. Use an intermediate name for case-only Git renames.',
  },
  {
    id: 'normalization-collision',
    title: 'Unicode normalization collision',
    severity: 'error',
    description: 'Distinct file or directory spellings have the same Unicode NFC normalization.',
    help: 'Normalize names consistently and rename colliding entries so their NFC forms remain distinct.',
  },
  {
    id: 'normalized-case-collision',
    title: 'Combined normalization and ASCII case collision',
    severity: 'error',
    description: 'Distinct spellings match when Unicode NFC normalization and ASCII case folding are combined.',
    help: 'Choose consistent normalized directory spellings and file names that differ beyond ASCII letter case.',
  },
  {
    id: 'file-directory-collision',
    title: 'File and directory collision',
    severity: 'error',
    description: 'A tracked leaf and a directory prefix match exactly or after NFC normalization and ASCII case folding.',
    help: 'Rename the leaf or directory so that no normalized, ASCII-case-folded path needs to be both a file and a directory.',
  },
  {
    id: 'unicode-case-collision',
    title: 'Possible non-ASCII case collision',
    severity: 'warning',
    description: 'Additional spellings match using NFC and JavaScript Unicode lowercasing. This heuristic is not full Unicode case folding or a filesystem case table.',
    help: 'Review the names on your target filesystems. Prefer distinct spellings beyond case; locale and filesystem case equivalence can differ from this heuristic.',
  },
  {
    id: 'windows-forbidden-character',
    title: 'Windows filename character',
    severity: 'error',
    description: 'A component contains < > : " \\ | ? * or a control character U+0001 through U+001F.',
    help: 'Rename the component without Windows-reserved filename characters or ASCII control characters.',
  },
  {
    id: 'windows-reserved-name',
    title: 'Windows device name',
    severity: 'error',
    description: 'A component is CON, PRN, AUX, NUL, COM1–9, or LPT1–9, optionally followed by an extension. COM/LPT superscript ¹, ², and ³ are included.',
    help: 'Use a name other than a Windows device name, even when the component has an extension or names a directory.',
  },
  {
    id: 'windows-trailing-dot-space',
    title: 'Trailing dot or space',
    severity: 'error',
    description: 'A component ends in an ASCII period or space, which ordinary Windows shell and filename handling do not preserve reliably.',
    help: 'Remove trailing ASCII periods and spaces from the component.',
  },
  {
    id: 'component-length',
    title: 'Long path component',
    severity: 'warning',
    description: 'A component exceeds 255 UTF-8 bytes or 255 UTF-16 code units. Actual limits depend on the target filesystem and API.',
    help: 'Shorten this individual component and verify target filesystem limits. Total checkout-path limits are outside this check.',
  },
  {
    id: 'invisible-format-character',
    title: 'Invisible or bidirectional format control',
    severity: 'warning',
    description: 'A component contains U+00AD, U+061C, U+180E, U+200B–200F, U+202A–202E, U+2060–2064, U+2066–206F, or U+FEFF.',
    help: 'Review the exact code points and remove accidental controls. Joiners may be intentional in text or emoji; this is a review warning, not a claim of an invalid filename.',
  },
].map((rule) => Object.freeze(rule)));

const RULE_BY_ID = new Map(RULES.map((rule) => [rule.id, rule]));
const FORBIDDEN = /[<>:"\\|?*\u0001-\u001F]/u;
const DEVICE_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  ...[...'123456789¹²³'].flatMap((digit) => [`com${digit}`, `lpt${digit}`]),
]);
// An explicit, stable scope: no blanket rejection of every non-ASCII character,
// variation selector, combining mark, whitespace character, or Unicode Cf value.
const FORMAT_CONTROL = /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/u;

function compareCodePoints(left, right) {
  if (left === right) return 0;
  let l = 0;
  let r = 0;
  while (l < left.length && r < right.length) {
    const a = left.codePointAt(l);
    const b = right.codePointAt(r);
    if (a !== b) return a < b ? -1 : 1;
    l += a > 0xFFFF ? 2 : 1;
    r += b > 0xFFFF ? 2 : 1;
  }
  return l < left.length ? 1 : -1;
}

function asciiLower(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

function portableFold(value) {
  return asciiLower(value.normalize('NFC'));
}

function unicodeFold(value) {
  // Normalize again because lowercasing can introduce combining sequences.
  return value.normalize('NFC').toLowerCase().normalize('NFC');
}

function validatePaths(paths) {
  if (!Array.isArray(paths)) throw new TypeError('paths must be an array of strings');
  if (paths.length > MAX_PATHS) throw new TypeError(`paths must contain at most ${MAX_PATHS} entries`);
  for (let index = 0; index < paths.length; index += 1) {
    const path = paths[index];
    if (typeof path !== 'string') throw new TypeError(`paths[${index}] must be a string`);
    if (path.length === 0 || path.length > MAX_PATH_UNITS) {
      throw new TypeError(`paths[${index}] must contain 1 to ${MAX_PATH_UNITS} UTF-16 code units`);
    }
    if (!path.isWellFormed()) throw new TypeError(`paths[${index}] must be well-formed Unicode`);
    if (path.includes('\0')) throw new TypeError(`paths[${index}] must not contain NUL`);
    const components = path.split('/');
    if (components.some((part) => part === '' || part === '.' || part === '..')) {
      throw new TypeError(`paths[${index}] must be a root-relative slash path without empty, . or .. components`);
    }
    if (components.length > MAX_DEPTH) {
      throw new TypeError(`paths[${index}] must have at most ${MAX_DEPTH} components`);
    }
  }
  const uniquePaths = [...new Set(paths)];
  let totalBytes = 0;
  let totalComponents = 0;
  // Enforce aggregate budgets before allocating either original or folded tries.
  for (const path of uniquePaths) {
    totalBytes += Buffer.byteLength(path, 'utf8');
    totalComponents += path.split('/').length;
    if (totalBytes > MAX_TOTAL_PATH_BYTES) {
      throw new TypeError(`unique paths must total at most ${MAX_TOTAL_PATH_BYTES} UTF-8 bytes (32 MiB)`);
    }
    if (totalComponents > MAX_TOTAL_COMPONENTS) {
      throw new TypeError(`unique paths must total at most ${MAX_TOTAL_COMPONENTS} components`);
    }
  }
  return uniquePaths.sort(compareCodePoints);
}

function makeNode(name, parent) {
  return { name, parent, children: new Map(), leaf: undefined, portableNode: undefined };
}

function makeTree(paths) {
  const root = makeNode('', undefined);
  for (const path of paths) {
    let node = root;
    for (const name of path.split('/')) {
      let next = node.children.get(name);
      if (!next) {
        next = makeNode(name, node);
        node.children.set(name, next);
      }
      node = next;
    }
    node.leaf = path;
  }
  return root;
}

function nodePath(node) {
  const components = [];
  for (let current = node; current.parent; current = current.parent) components.push(current.name);
  return components.reverse().join('/');
}

function affectedPaths(nodes) {
  const paths = [];
  const pending = [...nodes];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node.leaf !== undefined) paths.push(node.leaf);
    for (const child of node.children.values()) pending.push(child);
  }
  return [...new Set(paths)].sort(compareCodePoints);
}

function issue(ruleId, subject, paths, message, budget) {
  if (budget.count >= MAX_ISSUES) {
    throw new TypeError(`audit exceeds the ${MAX_ISSUES}-issue limit; narrow the audited path set`);
  }
  const rule = RULE_BY_ID.get(ruleId);
  const sortedPaths = [...new Set(paths)].sort(compareCodePoints);
  // Bound the complete serialized issues array, including escaped controls and
  // repeated affected leaves. Measure small individual strings rather than
  // materializing a potentially huge diagnostic just to discover it is too big.
  const shape = { id: '0'.repeat(64), ruleId, severity: rule.severity, subject, paths: [], message, help: rule.help };
  let bytes = Buffer.byteLength(JSON.stringify(shape), 'utf8');
  bytes += Math.max(0, sortedPaths.length - 1);
  for (const path of sortedPaths) {
    let pathBytes = budget.pathJsonBytes.get(path);
    if (pathBytes === undefined) {
      pathBytes = Buffer.byteLength(JSON.stringify(path), 'utf8');
      budget.pathJsonBytes.set(path, pathBytes);
    }
    bytes += pathBytes;
  }
  const nextBytes = budget.bytes + bytes + (budget.count > 0 ? 1 : 0);
  if (nextBytes > MAX_DIAGNOSTIC_BYTES) {
    throw new TypeError(`audit diagnostics exceed ${MAX_DIAGNOSTIC_BYTES} UTF-8 JSON bytes (8 MiB); narrow the audited path set`);
  }
  budget.bytes = nextBytes;
  budget.count += 1;
  // JSON provides unambiguous field boundaries, including for unusual names.
  // Prose and runtime/version information deliberately do not affect a baseline.
  const id = createHash('sha256').update(JSON.stringify([ruleId, subject, sortedPaths]), 'utf8').digest('hex');
  return { id, ruleId, severity: rule.severity, subject, paths: sortedPaths, message, help: rule.help };
}

function codePointsMatching(value, pattern) {
  return [...new Set([...value].filter((character) => pattern.test(character)))]
    .sort(compareCodePoints)
    .map((character) => `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
    .join(', ');
}

function componentIssues(root, budget) {
  const issues = [];
  const pending = [...root.children.values()];
  while (pending.length > 0) {
    const node = pending.pop();
    for (const child of node.children.values()) pending.push(child);
    const { name } = node;
    const findings = [];
    if (FORBIDDEN.test(name)) {
      findings.push(['windows-forbidden-character', `Component contains Windows-reserved characters: ${codePointsMatching(name, FORBIDDEN)}.`]);
    }
    if (DEVICE_NAMES.has(asciiLower(name).split('.')[0])) {
      findings.push(['windows-reserved-name', 'Component uses a Windows-reserved device name, with or without an extension.']);
    }
    if (name.endsWith('.') || name.endsWith(' ')) {
      findings.push(['windows-trailing-dot-space', 'Component ends with an ASCII dot or space.']);
    }
    const utf8Bytes = Buffer.byteLength(name, 'utf8');
    if (utf8Bytes > 255 || name.length > 255) {
      findings.push(['component-length', `Component uses ${utf8Bytes} UTF-8 bytes and ${name.length} UTF-16 code units; at least one exceeds 255.`]);
    }
    if (FORMAT_CONTROL.test(name)) {
      findings.push(['invisible-format-character', `Component contains invisible or bidirectional format controls: ${codePointsMatching(name, FORMAT_CONTROL)}.`]);
    }
    if (findings.length > 0) {
      const subject = nodePath(node);
      const paths = affectedPaths([node]);
      for (const [ruleId, message] of findings) issues.push(issue(ruleId, subject, paths, message, budget));
    }
  }
  return issues;
}

function foldedChildren(node, fold) {
  const groups = new Map();
  for (const alias of node.aliases) {
    for (const child of alias.children.values()) {
      const name = fold(child.name);
      let group = groups.get(name);
      if (!group) {
        group = { name, parent: node, aliases: [], ancestorCollision: false, emitted: false };
        groups.set(name, group);
      }
      group.aliases.push(child);
    }
  }
  return groups.values();
}

function aliasRule(aliases) {
  const spellings = aliases.map(nodePath);
  if (new Set(spellings.map(asciiLower)).size === 1) return 'case-collision';
  if (new Set(spellings.map((name) => name.normalize('NFC'))).size === 1) return 'normalization-collision';
  return 'normalized-case-collision';
}

function portableCollisions(root, budget) {
  const issues = [];
  const pending = [{ name: '', parent: undefined, aliases: [root], ancestorCollision: false, emitted: false }];
  while (pending.length > 0) {
    const node = pending.pop();
    for (const alias of node.aliases) alias.portableNode = node;
    const leaves = node.aliases.filter((alias) => alias.leaf !== undefined).length;
    const hasDirectory = node.aliases.some((alias) => alias.children.size > 0);
    const mixedKinds = leaves > 0 && hasDirectory;
    const distinctAliases = node.aliases.length > 1;
    // A directory alias already explains identical descendant prefixes. Actual
    // leaf collisions and file/directory conflicts remain independently useful.
    const report = mixedKinds || (distinctAliases && (!node.ancestorCollision || leaves > 1));
    if (report) {
      const ruleId = mixedKinds ? 'file-directory-collision' : aliasRule(node.aliases);
      const message = mixedKinds
        ? 'A tracked leaf and a directory prefix occupy the same NFC-normalized, ASCII-case-folded path.'
        : RULE_BY_ID.get(ruleId).description;
      issues.push(issue(ruleId, nodePath(node), affectedPaths(node.aliases), message, budget));
      node.emitted = true;
    }
    for (const child of foldedChildren(node, portableFold)) {
      child.ancestorCollision = node.ancestorCollision || node.emitted;
      pending.push(child);
    }
  }
  return issues;
}

function unicodeCollisions(root, budget) {
  const issues = [];
  const pending = [{ name: '', parent: undefined, aliases: [root], ancestorCollision: false, emitted: false }];
  while (pending.length > 0) {
    const node = pending.pop();
    const portableGroups = new Set(node.aliases.map((alias) => alias.portableNode));
    const newEquivalence = portableGroups.size > 1;
    const leaves = node.aliases.filter((alias) => alias.leaf !== undefined).length;
    const hasDirectory = node.aliases.some((alias) => alias.children.size > 0);
    const mixedKinds = leaves > 0 && hasDirectory;
    const report = newEquivalence && (!node.ancestorCollision || leaves > 1 || mixedKinds);
    if (report) {
      const message = mixedKinds
        ? 'Unicode lowercasing suggests a possible file/directory conflict. Target filesystem equivalence may differ.'
        : 'Unicode lowercasing suggests a possible name collision. Target filesystem equivalence may differ.';
      issues.push(issue('unicode-case-collision', nodePath(node), affectedPaths(node.aliases), message, budget));
      node.emitted = true;
    }
    const primaryCollision = node.aliases.some((alias) => alias.portableNode.emitted);
    for (const child of foldedChildren(node, unicodeFold)) {
      child.ancestorCollision = node.ancestorCollision || node.emitted || primaryCollision;
      pending.push(child);
    }
  }
  return issues;
}

/**
 * Audit a snapshot of Git-style repository-relative leaf paths without IO.
 * Backslashes are literal filename characters, never directory separators.
 * Duplicate inputs are ignored after validation; no malformed entry is ignored.
 * Limits: 100,000 entries; 32,768 UTF-16 units and 256 components per path;
 * unique paths total at most 250,000 components and 32 MiB UTF-8. Diagnostics
 * have at most 10,000 issues and an 8 MiB UTF-8 JSON issues-array footprint.
 * Any limit throws TypeError rather than returning a truncated audit.
 * @param {string[]} paths
 * @returns {{schemaVersion: number, tool: {name: string, version: string}, summary: {paths: number, errors: number, warnings: number}, issues: object[]}}
 */
export function auditPaths(paths) {
  const uniquePaths = validatePaths(paths);
  const root = makeTree(uniquePaths);
  const budget = { count: 0, bytes: 2, pathJsonBytes: new Map() };
  const issues = [...componentIssues(root, budget), ...portableCollisions(root, budget), ...unicodeCollisions(root, budget)];
  issues.sort((left, right) => {
    if (left.severity !== right.severity) return left.severity === 'error' ? -1 : 1;
    return compareCodePoints(left.subject, right.subject)
      || compareCodePoints(left.ruleId, right.ruleId)
      || compareCodePoints(left.id, right.id);
  });
  return {
    schemaVersion: 1,
    tool: { name: 'CheckoutScout', version: '0.1.0' },
    summary: {
      paths: uniquePaths.length,
      errors: issues.filter((finding) => finding.severity === 'error').length,
      warnings: issues.filter((finding) => finding.severity === 'warning').length,
    },
    issues,
  };
}
