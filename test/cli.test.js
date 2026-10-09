import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, parseArgs } from '../src/cli.js';
function memoryIO() { const values = {out:'',err:''}; return {values,stdout:{write:x=>values.out+=x},stderr:{write:x=>values.err+=x}}; }
async function fixture(fn) {const root=await mkdtemp(join(tmpdir(),'checkoutscout-cli-'));try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
test('help and version work without Git', async()=>{
  const io=memoryIO();assert.equal(await run(['--help'],io),0);assert.ok(io.values.out.includes('Usage:'));assert.equal(await run(['--version'],io),0);
});
test('ambiguous flags and invalid formats fail',()=>{
  for(const args of [['--unknown'],['--repo'],['--format','xml'],['--strict','--strict'],['--repo','.','--paths','p'],['--baseline','a','--save-baseline','b'],['--output','a','--save-baseline','a']]) assert.throws(()=>parseArgs(args));
});
test('JSON paths run, baseline acceptance, regression, and no-overwrite behavior',async()=>fixture(async root=>{
  const input=join(root,'paths.json'), baseline=join(root,'baseline.json'), output=join(root,'report.html');
  await writeFile(input,JSON.stringify(['A','a'])); const io=memoryIO();
  assert.equal(await run(['--paths',input,'--format','json'],io),1);assert.equal(JSON.parse(io.values.out).summary.new,1);
  assert.equal(await run(['--paths',input,'--save-baseline',baseline],memoryIO()),0);
  const accepted=memoryIO();assert.equal(await run(['--paths',input,'--baseline',baseline,'--format','html','--output',output],accepted),0);
  assert.ok((await readFile(output,'utf8')).includes('IN BASELINE'));
  const old=await readFile(output,'utf8');assert.equal(await run(['--paths',input,'--output',output],memoryIO()),2);assert.equal(await readFile(output,'utf8'),old);
  const before=await readFile(baseline,'utf8');assert.equal(await run(['--paths',input,'--save-baseline',baseline],memoryIO()),2);assert.equal(await readFile(baseline,'utf8'),before);
  await writeFile(input,JSON.stringify(['A','a','CON']));assert.equal(await run(['--paths',input,'--baseline',baseline],memoryIO()),1);
}));
test('malformed input, unreadable files and non-UTF8 fail without report',async()=>fixture(async root=>{
  const input=join(root,'paths.json');
  for(const value of ['{broken','{}','["../escape"]',Buffer.from([0xff])]) {
    await writeFile(input,value);const io=memoryIO();assert.equal(await run(['--paths',input],io),2);assert.equal(io.values.out,'');
  }
  const io=memoryIO();assert.equal(await run(['--paths',root],io),2);assert.equal(io.values.out,'');
}));
test('creating report refuses symlink destinations', {skip:process.platform==='win32'}, async()=>fixture(async root=>{
  const source=join(root,'paths.json'), victim=join(root,'victim.txt'), output=join(root,'report.txt');
  await writeFile(source,'[]');await writeFile(victim,'unchanged');await symlink(victim,output);
  assert.equal(await run(['--paths',source,'--output',output],memoryIO()),2);assert.equal(await readFile(victim,'utf8'),'unchanged');
}));
test('strict mode changes warning exit status',async()=>fixture(async root=>{
  const input=join(root,'paths.json');await writeFile(input,JSON.stringify(['x'.repeat(256)]));
  assert.equal(await run(['--paths',input],memoryIO()),0);assert.equal(await run(['--paths',input,'--strict'],memoryIO()),1);
}));
