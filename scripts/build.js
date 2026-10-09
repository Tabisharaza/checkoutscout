import { mkdir, readdir, copyFile, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
// Rebuild only this known output directory. No dependency installation or transpilation.
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
const files=['package.json','README.md','LICENSE','THIRD_PARTY.md'];
for(const dir of ['bin','src']) { await mkdir(`dist/${dir}`,{recursive:true});for(const file of await readdir(dir)) if(file.endsWith('.js'))files.push(`${dir}/${file}`); }
const hashes=[];
for(const file of files.sort()) {await copyFile(file,`dist/${file}`);hashes.push(`${createHash('sha256').update(await readFile(file)).digest('hex')}  ${file}`);}
await chmod('dist/bin/checkoutscout.js',0o755);
await writeFile('dist/SHA256SUMS',hashes.join('\n')+'\n');
console.log(`Built ${files.length} files with deterministic SHA-256 manifest in dist/.`);
