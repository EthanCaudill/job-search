#!/usr/bin/env node
// Rebuilds reports/latest.html from the last results (no searching).   node build-report.js [--open]
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toHTML } from './src/report.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const read = async (p, fallback) => (existsSync(p) ? JSON.parse(await readFile(p, 'utf8')) : fallback);
const jobs = await read(join(ROOT, 'data', 'latest.json'), []);
const cfg = await read(join(ROOT, 'config.json'), {});
const meta = await read(join(ROOT, 'data', 'meta.json'), { newCount: 0, sourceCounts: {}, manualKeywords: cfg.manualSearchKeywords });
meta.mySkills = Object.keys(cfg.resumeSkills || {});
meta.applied = await read(join(ROOT, 'data', 'applied.json'), []);
meta.generated ??= new Date().toLocaleString();

const out = join(ROOT, 'reports', 'latest.html');
await writeFile(out, toHTML(jobs, meta));
console.log(`Rebuilt ${out} (${jobs.length} jobs, ${meta.applied.length} pre-recorded applications)`);
if (process.argv.includes('--open')) exec(`start "" "${out}"`);
