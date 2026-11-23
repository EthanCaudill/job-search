// LinkedIn public (logged-out) job search pages. No account or login used.
import { get, sleep } from '../http.js';
import { decode, htmlToText, extractSalary } from '../extract.js';

const BASE = 'https://www.linkedin.com/jobs-guest/jobs/api';
const clean = (s) => decode((s || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const pick = (html, re) => clean(html.match(re)?.[1]);

function parseCards(html) {
  return html
    .split(/<li[\s>]/)
    .slice(1)
    .map((li) => {
      const id = li.match(/jobPosting:(\d+)/)?.[1];
      if (!id) return null;
      return {
        id: `li-${id}`,
        liId: id,
        source: 'LinkedIn',
        title: pick(li, /base-search-card__title[^>]*>([\s\S]*?)<\/h3>/),
        company: pick(li, /base-search-card__subtitle[^>]*>([\s\S]*?)<\/h4>/),
        location: pick(li, /job-search-card__location[^>]*>([\s\S]*?)<\/span>/),
        postedAt: li.match(/datetime="([\d-]+)"/)?.[1] || null,
        pay: extractSalary(pick(li, /job-search-card__salary-info[^>]*>([\s\S]*?)<\/span>/) || ''),
        url: `https://www.linkedin.com/jobs/view/${id}/`,
      };
    })
    .filter(Boolean);
}

export async function searchLinkedIn(cfg, log, { quick = false } = {}) {
  const li = cfg.linkedin;
  const days = cfg.maxAgeDays;
  const queries = quick ? li.queries.slice(0, 3) : li.queries;
  const searches = [];
  for (const q of queries) {
    searches.push({ q, location: 'Kentucky', remote: false });
    searches.push({ q, location: 'United States', remote: true });
  }
  const found = new Map();
  for (const s of searches) {
    for (let page = 0; page < (quick ? 1 : li.pagesPerQuery); page++) {
      const params = new URLSearchParams({
        keywords: s.q,
        location: s.location,
        f_TPR: `r${days * 86400}`,
        start: String(page * 10),
      });
      if (li.experienceLevels) params.set('f_E', li.experienceLevels);
      if (s.remote) params.set('f_WT', '2');
      const html = await get(`${BASE}/seeMoreJobPostings/search?${params}`);
      await sleep(li.delayMs);
      if (!html) break;
      const cards = parseCards(html);
      for (const c of cards) {
        if (!found.has(c.id)) found.set(c.id, { ...c, remote: s.remote || /remote/i.test(c.location) });
      }
      if (cards.length < 10) break;
    }
  }
  log(`LinkedIn: ${found.size} listings from ${searches.length} searches`);
  return [...found.values()];
}

/** Fetch full description + criteria for one LinkedIn job (in place). */
export async function linkedInDetails(job, delayMs) {
  const html = await get(`${BASE}/jobPosting/${job.liId}`, { retries: 1 });
  await sleep(delayMs);
  if (!html) return false;
  const desc = html.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
  job.description = htmlToText(desc);
  const crit = {};
  for (const m of html.matchAll(/job-criteria-subheader">([\s\S]*?)<\/h3>\s*<span[^>]*>([\s\S]*?)<\/span>/g)) {
    crit[clean(m[1])] = clean(m[2]);
  }
  if (crit['Employment type']) job.jobType = crit['Employment type'];
  if (crit['Seniority level']) job.seniority = crit['Seniority level'];
  if (crit['Industries']) job.industry = crit['Industries'];
  const sal = pick(html, /compensation__salary"?[^>]*>([\s\S]*?)<\/div>/);
  if (sal && !job.pay?.min) job.pay = extractSalary(sal);
  const applicants = pick(html, /num-applicants__caption[^>]*>([\s\S]*?)<\//);
  if (applicants) job.applicants = applicants;
  return true;
}
