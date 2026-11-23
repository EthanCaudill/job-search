#!/usr/bin/env node
// Job search automation: finds Kentucky + remote (US) jobs, ranks them against my resume,
// and writes an HTML dashboard + CSV to ./reports.
//   node search.js            full run (~5–8 min, mostly polite LinkedIn delays)
//   node search.js --quick    fewer queries, for testing
//   node search.js --open     open the report when done
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchLinkedIn, linkedInDetails } from './src/sources/linkedin.js';
import { remotive, remoteOK, himalayas, jobicy, weWorkRemotely, hackerNews, simplifyNewGrad } from './src/sources/remote-boards.js';
import { enrich, annualPay } from './src/extract.js';
import { evaluate, dedupe, isKentucky, remoteUSOk } from './src/match.js';
import { toHTML, toCSV } from './src/report.js';
import { vetAll, checkLive } from './src/vet.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const quick = args.has('--quick');
const log = (...m) => console.log(`[${new Date().toLocaleTimeString()}]`, ...m);

const cfg = JSON.parse(await readFile(join(ROOT, 'config.json'), 'utf8'));
const titleOk = (t) => new RegExp(cfg.titleInclude, 'i').test(t) && !new RegExp(cfg.titleExclude, 'i').test(t);

async function safe(name, fn) {
  try {
    return await fn();
  } catch (e) {
    log(`${name} failed: ${e.message}`);
    return [];
  }
}

log(`Starting ${quick ? 'quick ' : ''}search…`);

// Remote boards run in parallel while LinkedIn runs sequentially (rate-limited).
const boardsP = Promise.all([
  safe('Remotive', () => remotive(cfg, log)),
  safe('RemoteOK', () => remoteOK(cfg, log)),
  safe('Himalayas', () => himalayas(cfg, log, { quick })),
  safe('Jobicy', () => jobicy(cfg, log)),
  safe('We Work Remotely', () => weWorkRemotely(cfg, log)),
  safe('Hacker News', () => hackerNews(cfg, log)),
  safe('Simplify', () => simplifyNewGrad(cfg, log)),
]);

let li = await safe('LinkedIn', () => searchLinkedIn(cfg, log, { quick }));
// Only fetch full LinkedIn descriptions for postings that could pass the filters.
li = li.filter((j) => titleOk(j.title) && (isKentucky(j.location, cfg) || remoteUSOk(j)));
li.sort((a, b) => /php|laravel|angular|typescript|junior|entry|full.?stack/i.test(b.title) - /php|laravel|angular|typescript|junior|entry|full.?stack/i.test(a.title));
const detailCap = quick ? 15 : cfg.linkedin.maxDetailFetches;
let fetched = 0;
for (const j of li.slice(0, detailCap)) {
  if (await linkedInDetails(j, cfg.linkedin.delayMs)) fetched++;
  if (fetched && fetched % 25 === 0) log(`LinkedIn details: ${fetched}/${Math.min(li.length, detailCap)}`);
}
log(`LinkedIn: ${li.length} relevant, full details for ${fetched}`);

const all = [...li, ...(await boardsP).flat()];
const sourceCounts = {};
for (const j of all) sourceCounts[j.source] = (sourceCounts[j.source] || 0) + 1;

let jobs = dedupe(
  all
    .map(enrich)
    .map((j) => evaluate(j, cfg))
    .filter((j) => j && j.score >= cfg.minScore),
);

// Track what's new since the previous run.
const dataDir = join(ROOT, 'data');
await mkdir(dataDir, { recursive: true });
const seenPath = join(dataDir, 'seen.json');
const seen = existsSync(seenPath) ? JSON.parse(await readFile(seenPath, 'utf8')) : {};
const firstRun = Object.keys(seen).length === 0;
const today = new Date().toISOString().slice(0, 10);
for (const j of jobs) {
  // "New" = first seen today, so a second run on the same day keeps today's new jobs marked.
  j.isNew = !firstRun && (!seen[j.id] || seen[j.id] === today);
  seen[j.id] ??= today;
  for (const id of j.alsoIds || []) seen[id] ??= today;
  j.payAnnual = annualPay(j.pay);
}
await writeFile(seenPath, JSON.stringify(seen));

// Scam / reliability screening + drop postings that are already closed.
vetAll(jobs, cfg);
if (!args.has('--no-live-check')) {
  await checkLive(jobs, log);
  const closed = jobs.filter((j) => j.live === 'closed').length;
  jobs = jobs.filter((j) => j.live !== 'closed');
  if (closed) log(`Removed ${closed} closed/expired postings`);
}
jobs.sort((a, b) => b.score - a.score);

const reportsDir = join(ROOT, 'reports');
await mkdir(reportsDir, { recursive: true });
const meta = {
  generated: new Date().toLocaleString(),
  newCount: jobs.filter((j) => j.isNew).length,
  sourceCounts,
  manualKeywords: cfg.manualSearchKeywords,
  mySkills: Object.keys(cfg.resumeSkills),
  applied: existsSync(join(dataDir, 'applied.json')) ? JSON.parse(await readFile(join(dataDir, 'applied.json'), 'utf8')) : [],
};
const html = toHTML(jobs, meta);
await writeFile(join(reportsDir, `jobs-${today}.html`), html);
await writeFile(join(reportsDir, 'latest.html'), html);
await writeFile(join(reportsDir, `jobs-${today}.csv`), toCSV(jobs));
await writeFile(join(dataDir, 'latest.json'), JSON.stringify(jobs, null, 1));
await writeFile(join(dataDir, 'meta.json'), JSON.stringify(meta));

log(`Done: ${jobs.length} matches (${meta.newCount} new). Report: ${join(reportsDir, 'latest.html')}`);
console.log('\nTop 10:');
for (const j of jobs.slice(0, 10)) {
  console.log(`  ${String(j.score).padStart(3)}  ${j.title} — ${j.company} [${j.where}] ${j.payText}`);
}
if (args.has('--open')) exec(`start "" "${join(reportsDir, 'latest.html')}"`);
