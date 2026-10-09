import { readFile, writeFile } from 'node:fs/promises';
import { auditPaths } from '../src/audit.js';
import { compareBaseline, createBaseline } from '../src/baseline.js';
import { renderText, renderHtml, renderJson } from '../src/report.js';
const paths=JSON.parse(await readFile('examples/paths.json','utf8'));
const baseline=createBaseline(auditPaths(['legacy/CON.txt','old/A.md','old/a.md']));
const report=compareBaseline(auditPaths(paths),baseline);
for(const [name,content] of [['baseline.json',JSON.stringify(baseline,null,2)+'\n'],['report.json',renderJson(report)],['report.txt',renderText(report)],['report.html',renderHtml(report)]]) await writeFile(`examples/${name}`,content);
console.log('Generated deterministic synthetic examples. No repository names or source data used.');
