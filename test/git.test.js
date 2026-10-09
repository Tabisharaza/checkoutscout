import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitEnvironment, readIndex, decodePaths, InputError } from '../src/git.js';
test('Git variables are removed case-insensitively', () => {
  const env = gitEnvironment({ PATH: 'normal', GIT_DIR: 'other', git_index_file: 'bad', GIT_CONFIG_COUNT:'1', HOME:'home' });
  assert.equal(env.PATH, 'normal'); assert.equal(env.GIT_DIR, undefined); assert.equal(env.git_index_file, undefined);
  assert.equal(env.GIT_CONFIG_COUNT, undefined); assert.equal(env.GIT_OPTIONAL_LOCKS, '0');
  assert.equal(env.GIT_CONFIG_GLOBAL, '/dev/null');
});
test('NUL decoding preserves unusual UTF-8 names and rejects malformed data', () => {
  assert.deepEqual(decodePaths(Buffer.from('a\nb\0café\0')), ['a\nb', 'café']);
  assert.deepEqual(decodePaths(Buffer.alloc(0)), []);
  assert.throws(() => decodePaths(Buffer.from([0xff,0])), InputError);
  assert.throws(() => decodePaths(Buffer.from('a')), InputError);
});
test('index scans are root-wide, exclude untracked data, and do not execute fsmonitor', async () => {
  const root = await mkdtemp(join(tmpdir(), 'checkoutscout-'));
  try {
    execFileSync('git', ['init','--quiet',root]);
    await mkdir(join(root,'nested')); await writeFile(join(root,'root.txt'),'synthetic');
    await writeFile(join(root,'nested','child.txt'),'synthetic'); await writeFile(join(root,'private-untracked.txt'),'must not scan');
    execFileSync('git', ['-C',root,'add','root.txt','nested/child.txt']);
    execFileSync('git', ['-C',root,'config','core.fsmonitor','a-command-that-must-not-run']);
    assert.deepEqual((await readIndex(join(root,'nested'))).sort(), ['nested/child.txt','root.txt']);
  } finally { await rm(root,{recursive:true,force:true}); }
});
test('invalid repository is a controlled input error', async () => {
  await assert.rejects(readIndex(join(tmpdir(),'checkoutscout-does-not-exist')), InputError);
});
test('leading BOM is a real Git filename character, not a byte-order marker', () => {
  assert.deepEqual(decodePaths(Buffer.from('\ufeffhidden.txt\0')), ['\ufeffhidden.txt']);
});
