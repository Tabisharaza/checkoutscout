import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export const MAX_INPUT_BYTES = 32 * 1024 * 1024;

/** Git variables cannot silently redirect --repo, inject config, or enable hooks. */
export function gitEnvironment(environment = process.env) {
  const env = Object.fromEntries(Object.entries(environment).filter(([key]) => !/^GIT_/i.test(key)));
  // Git for Windows understands /dev/null; Node's Win32 device path is not a Git config path.
  return { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1' };
}

/** Read names from the complete index. No source files, hooks, or remotes are read. */
export async function readIndex(repo = '.') {
  try {
    const { stdout } = await exec('git', ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
      '-C', repo, 'ls-files', '--cached', '--full-name', '-z', '--', ':/'],
    { encoding: 'buffer', env: gitEnvironment(), maxBuffer: MAX_INPUT_BYTES, timeout: 30_000, windowsHide: true });
    return decodePaths(stdout);
  } catch (error) {
    if (error instanceof InputError) throw error;
    // Child stderr may contain untrusted paths, controls, or private absolute paths.
    throw new InputError(error.code === 'ENOENT' ? 'Git was not found. Install Git or use --paths.' :
      'Could not read the Git index. Check --repo, Git availability, repository access, and the 32 MiB / 30 second limits.');
  }
}
export class InputError extends Error {}

export function decodePaths(bytes) {
  if (bytes.byteLength > MAX_INPUT_BYTES) throw new InputError('Input exceeds 32 MiB.');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new InputError('Input contains invalid UTF-8. No partial audit was produced.'); }
  if (!text) return [];
  if (!text.endsWith('\0')) throw new InputError('Git path data must end in NUL.');
  return text.slice(0, -1).split('\0');
}
