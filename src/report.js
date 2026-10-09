/** Presentation boundaries make controls and bidi markers visible, never executable. */
export function displayPath(value) {
  return JSON.stringify(String(value)).replace(/[\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g,
    character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
const visible = value => escapeHtml(displayPath(value));
const safeLine = value => displayPath(value).slice(1, -1);
export const renderJson = report => JSON.stringify(report, null, 2) + '\n';
export function renderText(report) {
  const { summary } = report;
  const lines = ['CheckoutScout · portability review', `${summary.paths} paths · ${summary.new} new · ${summary.existing} accepted · ${summary.resolved} resolved/changed`, ''];
  for (const issue of report.issues) {
    lines.push(`${safeLine(issue.status.toUpperCase())} ${safeLine(issue.severity.toUpperCase())} ${safeLine(issue.ruleId)}`, `  ${displayPath(issue.subject)}: ${safeLine(issue.message)}`);
    for (const path of issue.paths) lines.push(`    ${displayPath(path)}`);
    lines.push(`  Next: ${safeLine(issue.help)}`, '');
  }
  if (report.resolved.length) {
    lines.push('Baseline fingerprints no longer present (fixed or changed groups):');
    for (const issue of report.resolved) lines.push(`  ${safeLine(issue.ruleId)} ${displayPath(issue.subject)}`);
    lines.push('');
  }
  if (!report.issues.length) lines.push('No modeled path hazards found. Filesystem behavior can vary.', '');
  lines.push('Names only; no source files read or renamed. Review paths before sharing this report.');
  return lines.join('\n') + '\n';
}

export function renderHtml(report) {
  const { summary } = report;
  const cards = report.issues.map(issue => `<article class="finding ${escapeHtml(issue.status)}">
    <div class="finding-top"><span class="tag ${escapeHtml(issue.severity)}">${escapeHtml(issue.severity)}</span><span class="tag status">${issue.status === 'new' ? 'NEW FINDING' : 'IN BASELINE'}</span><code class="rule">${escapeHtml(issue.ruleId)}</code></div>
    <h3><code>${visible(issue.subject)}</code></h3><p>${escapeHtml(issue.message)}</p>
    <details${report.issues.length <= 12 ? ' open' : ''}><summary>${issue.paths.length} affected ${issue.paths.length === 1 ? 'path' : 'paths'}</summary><ul class="paths">${issue.paths.map(path => `<li><code>${visible(path)}</code></li>`).join('')}</ul></details>
    <p class="next"><strong>Next step</strong> ${escapeHtml(issue.help)}</p>
  </article>`).join('');
  const resolved = report.resolved.map(issue => `<li><span class="rule">${escapeHtml(issue.ruleId)}</span> <code>${visible(issue.subject)}</code></li>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>CheckoutScout · Portability report</title>
<style>
:root{color-scheme:light;--ink:#142b35;--muted:#546b73;--paper:#f3f5ee;--line:#ced7d0;--accent:#176c55}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--accent)}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}header,main,footer{max-width:1120px;margin:auto;padding:28px 36px}.brand{font-size:20px;font-weight:800;letter-spacing:-.6px;display:flex;align-items:center;gap:10px}.mark{display:grid;place-items:center;background:var(--ink);color:#b6efd2;width:36px;height:36px;border-radius:10px;font-size:22px}.topline{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:22px}.pill{border:1px solid var(--line);border-radius:99px;padding:4px 12px;font-size:12px;font-weight:650}.hero{display:grid;grid-template-columns:1.6fr 1fr;gap:52px;padding:48px 0 30px}.eyebrow{color:var(--accent);font-size:12px;letter-spacing:2px;font-weight:800;text-transform:uppercase}h1{font-size:clamp(34px,5vw,55px);line-height:1.1;letter-spacing:-2.2px;margin:14px 0 20px;max-width:620px}.intro{font-size:17px;color:var(--muted);max-width:590px}.scope{align-self:center;background:#e1eae0;border:1px solid var(--line);border-radius:16px;padding:24px}.scope h2{font-size:17px;margin:0 0 12px}.scope p{font-size:14px;margin:8px 0;color:#39544b}.scope .big{font-weight:800;font-size:40px;color:var(--ink);line-height:1.2}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.stat{border:1px solid var(--line);border-radius:14px;padding:20px 24px;background:#fffef9}.stat strong{display:block;font-size:34px;line-height:1.2}.stat span{color:var(--muted);font-size:13px}.stat:first-child{background:#d7eddf;border-color:#b4d7c1}main{padding-top:10px}.section-heading{display:flex;align-items:baseline;justify-content:space-between;gap:20px;margin:22px 0 15px}h2{font-size:23px;letter-spacing:-.7px;margin:0}.section-heading span{font-size:13px;color:var(--muted)}.finding{padding:25px 28px;background:#fffefb;border:1px solid var(--line);border-left:4px solid #cf816c;border-radius:12px;margin:0 0 15px}.finding.existing{border-left-color:#8baba0}.finding-top{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.tag{font-size:10px;letter-spacing:.6px;font-weight:800;text-transform:uppercase;line-height:1.8;padding:2px 8px;border-radius:4px}.error{background:#fae1d9;color:#843b26}.warning{background:#f3e9c8;color:#71571b}.status{background:#e7ece6;color:#3d5b4c}.rule{font:12px ui-monospace,monospace;color:var(--muted)}h3{font-size:19px;line-height:1.45;margin:15px 0 8px}h3 code{font-weight:650}.finding p{margin:8px 0;font-size:14px;color:#405861}summary{font-size:12px;font-weight:650;cursor:pointer;margin:14px 0 8px}summary:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:4px}.paths{list-style:none;background:#f1f4ee;border:1px solid #e2e7df;border-radius:7px;padding:12px 16px;margin:0}.paths li{font-size:12px;line-height:1.8;white-space:pre-wrap}.next{padding-top:10px}.next strong{color:var(--accent);margin-right:8px}.empty,.resolved{border:1px dashed #9cb4a6;padding:24px;border-radius:12px;background:#e8f1e6}.resolved{margin:28px 0}.resolved h2{font-size:18px}.resolved p,.resolved li{font-size:13px}.notes{font-size:13px;color:var(--muted);padding:23px 0;max-width:850px}footer{font-size:12px;color:var(--muted);border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:20px} @media(max-width:650px){header,main,footer{padding:22px 18px}.hero{grid-template-columns:1fr;gap:15px;padding:30px 0}.scope{padding:17px}h1{letter-spacing:-1.3px}.stats{gap:8px}.stat{padding:15px 12px}.stat strong{font-size:28px}.finding{padding:20px 16px}.section-heading{display:block}.topline .pill{display:none}footer{display:block}}@media print{body{background:white}.finding{break-inside:avoid}.hero{padding-top:20px}header,main,footer{padding:15px}details{display:block}}
</style></head><body><header><div class="topline"><div class="brand"><span class="mark" aria-hidden="true">↗</span>CheckoutScout</div><span class="pill">Local report · zero network requests</span></div>
<div class="hero"><div><div class="eyebrow">Repository portability review</div><h1>A safer landing for every checkout.</h1><p class="intro">Find names that trip up another machine. Keep existing debt visible, and stop new portability problems before they land.</p></div><aside class="scope"><h2>What was inspected</h2><p class="big">${summary.paths}</p><p>unique repository-relative paths</p><p>Names only. No source contents, renames, or automatic fixes.</p></aside></div>
<div class="stats"><div class="stat"><strong>${summary.new}</strong><span>New findings</span></div><div class="stat"><strong>${summary.existing}</strong><span>Accepted in baseline</span></div><div class="stat"><strong>${summary.resolved}</strong><span>Resolved / changed</span></div></div></header>
<main><div class="section-heading"><h2>Give every path a clear landing.</h2><span>${summary.errors} errors · ${summary.warnings} warnings</span></div>
${cards || '<div class="empty"><strong>No modeled path hazards found.</strong><br>Keep a cross-platform CI job: filesystem behavior and application rules can vary.</div>'}
${resolved ? `<section class="resolved"><h2>Baseline fingerprints no longer present</h2><p>These groups were fixed or changed. A changed collision group is also reported as a new finding above.</p><ul>${resolved}</ul></section>` : ''}
<div class="notes"><strong>Read this as a portability check, not a filesystem guarantee.</strong> Case handling, Unicode behavior, long-path support, symlinks, and application rules differ across systems. Accepted findings remain risks. Reports contain filenames; review them before sharing.</div></main>
<footer><span>CheckoutScout 0.1.0 · deterministic, offline, names only</span><span>Generated from the audit result · no timestamps or absolute checkout paths</span></footer></body></html>\n`;
}
