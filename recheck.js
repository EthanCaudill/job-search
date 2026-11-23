#!/usr/bin/env node
// Re-runs the scam/reliability screen and live-link check on the last results
// without searching again, then rebuilds the report.   node recheck.js [--open]
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vetAll, checkLive } from './src/vet.js';
import { toHTML, toCSV } from './src/report.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const log = (...m) => console.log(`[${new Date().toLocaleTimeString()}]`, ...m);
const data = join(ROOT, 'data');
let jobs = JSON.parse(await readFile(join(data, 'latest.json'), 'utf8'));
const cfg = JSON.parse(await readFile(join(ROOT, 'config.json'), 'utf8'));
const meta = existsSync(join(data, 'meta.json'))
  ? JSON.parse(await readFile(join(data, 'meta.json'), 'utf8'))
  : { newCount: jobs.filter((j) => j.isNew).length, sourceCounts: {}, manualKeywords: cfg.manualSearchKeywords, mySkills: Object.keys(cfg.resumeSkills) };

log(`Re-checking ${jobs.length} jobs…`);
vetAll(jobs, cfg);
await checkLive(jobs, log);
const closed = jobs.filter((j) => j.live === 'closed');
jobs = jobs.filter((j) => j.live !== 'closed');

meta.generated = new Date().toLocaleString();
meta.applied = existsSync(join(data, 'applied.json')) ? JSON.parse(await readFile(join(data, 'applied.json'), 'utf8')) : [];
const today = new Date().toISOString().slice(0, 10);
const html = toHTML(jobs, meta);
await writeFile(join(ROOT, 'reports', 'latest.html'), html);
await writeFile(join(ROOT, 'reports', `jobs-${today}.html`), html);
await writeFile(join(ROOT, 'reports', `jobs-${today}.csv`), toCSV(jobs));
await writeFile(join(data, 'latest.json'), JSON.stringify(jobs, null, 1));
await writeFile(join(data, 'removed-closed.json'), JSON.stringify(closed.map((j) => ({ title: j.title, company: j.company, url: j.url })), null, 1));

const count = (t) => jobs.filter((j) => j.trust === t).length;
log(`Removed ${closed.length} closed. Remaining ${jobs.length}: ${count('ok')} ok, ${count('caution')} caution, ${count('risky')} risky`);
if (process.argv.includes('--open')) exec(`start "" "${join(ROOT, 'reports', 'latest.html')}"`);
