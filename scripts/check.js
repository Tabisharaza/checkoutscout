import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const dirs = ['src','bin','test','scripts'];
let count=0;
for (const dir of dirs) for (const file of await readdir(dir)) if (file.endsWith('.js')) {
  execFileSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'inherit'});count++;
}
const pkg=JSON.parse(await readFile('package.json','utf8'));
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
if(pkg.version!==lock.version || Object.keys(lock.packages).length!==1) throw new Error('Lockfile must match the zero-dependency package.');
console.log(`Syntax checked ${count} JavaScript files; zero-dependency lockfile verified.`);
