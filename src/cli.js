import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { auditPaths } from './audit.js';
import { compareBaseline, createBaseline, shouldFail } from './baseline.js';
import { readIndex, MAX_INPUT_BYTES } from './git.js';
import { renderText, renderJson, renderHtml, displayPath } from './report.js';

const HELP = `CheckoutScout 0.1.0 · cross-platform Git path checks that grow with your repo

Usage: checkoutscout [options]

  --repo <directory>       Read the complete Git index (default: current repo)
  --paths <file.json>      Audit a JSON array of synthetic or exported paths instead
  --baseline <file.json>   Compare against an explicitly accepted baseline
  --save-baseline <file>   Create a new baseline; intentionally accept current findings
  --format <text|json|html>  Report format (default: text)
  --output <file>         Create a report file; refuses to overwrite anything
  --strict                New warnings fail too (default: only new errors fail)
  --help                  Show help
  --version               Show version

Exit: 0 no new blocking findings / baseline saved; 1 new findings; 2 input or I/O error.
Names only. No source contents, network requests, renames, or automatic fixes.
Reports and baselines contain path names. Review them before sharing.
`;

export function parseArgs(args) {
  const options = { repo: '.', format: 'text', strict: false };
  const valued = new Map([['--repo', 'repo'], ['--paths', 'paths'], ['--baseline', 'baseline'],
    ['--save-baseline', 'saveBaseline'], ['--format', 'format'], ['--output', 'output']]);
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) throw new TypeError(`Repeated option: ${displayPath(flag)}`);
    seen.add(flag);
    if (valued.has(flag)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new TypeError(`Missing value for ${flag}.`);
      options[valued.get(flag)] = value;
    } else if (flag === '--strict') options.strict = true;
    else if (flag === '--help') options.help = true;
    else if (flag === '--version') options.version = true;
    else throw new TypeError(`Unknown option: ${displayPath(flag)}. Try --help.`);
  }
  if (!['text', 'json', 'html'].includes(options.format)) throw new TypeError('Format must be text, json, or html.');
  if (options.paths && seen.has('--repo')) throw new TypeError('Use either --repo or --paths.');
  if (options.baseline && options.saveBaseline) throw new TypeError('Use either --baseline or --save-baseline. Review a new baseline separately.');
  if (options.output && options.saveBaseline && resolve(options.output) === resolve(options.saveBaseline))
    throw new TypeError('Report and baseline must use different output files.');
  return options;
}
async function readJson(path, label) {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > MAX_INPUT_BYTES) throw new Error();
    const buffer = await readFile(path);
    if (buffer.length > MAX_INPUT_BYTES) throw new Error();
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
  } catch { throw new Error(`Could not read ${label}. Use a valid UTF-8 JSON file no larger than 32 MiB.`); }
}
async function createFile(path, contents, label) {
  try { await writeFile(path, contents, { flag: 'wx', mode: 0o600 }); }
  catch { throw new Error(`Could not create ${label}. It may already exist, or its parent directory may be unavailable. No existing file was overwritten.`); }
}
export async function run(args, io = { stdout: process.stdout, stderr: process.stderr }) {
  try {
    const options = parseArgs(args);
    if (options.help) { io.stdout.write(HELP); return 0; }
    if (options.version) { io.stdout.write('0.1.0\n'); return 0; }
    const paths = options.paths ? await readJson(options.paths, 'path input') : await readIndex(options.repo);
    const audit = auditPaths(paths);
    const baseline = options.baseline ? await readJson(options.baseline, 'baseline') : undefined;
    const report = compareBaseline(audit, baseline);
    const rendered = ({ text: renderText, json: renderJson, html: renderHtml })[options.format](report);
    if (options.output) await createFile(options.output, rendered, 'report');
    if (options.saveBaseline) {
      await createFile(options.saveBaseline, JSON.stringify(createBaseline(audit), null, 2) + '\n', 'baseline');
      io.stderr.write('Baseline saved. Current findings are explicitly accepted; commit only after review.\n');
    }
    if (!options.output) io.stdout.write(rendered);
    return options.saveBaseline ? 0 : Number(shouldFail(report, options.strict));
  } catch (error) {
    io.stderr.write(`CheckoutScout: ${displayPath(error.message)}\n`);
    return 2;
  }
}
