// Remote-first job boards with free public APIs/feeds.
import { get, sleep } from '../http.js';
import { decode, htmlToText, extractSalary } from '../extract.js';

const iso = (d) => {
  if (d == null || d === '') return null;
  const t = typeof d === 'number' ? (d < 1e12 ? d * 1000 : d) : Date.parse(d);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
};
const payFrom = (min, max, period) => {
  if (!min && !max) return null;
  min = +min || +max;
  max = +max || min;
  const hourly = /hour/i.test(period || '') || max < 300;
  return { min, max, period: hourly ? 'hour' : 'year' };
};

/** Remotive — remote software-dev category. https://remotive.com */
export async function remotive(cfg, log) {
  const data = await get('https://remotive.com/api/remote-jobs?category=software-dev&limit=400', { json: true });
  const jobs = (data?.jobs || []).map((j) => ({
    id: `remotive-${j.id}`,
    source: 'Remotive',
    title: decode(j.title),
    company: j.company_name,
    location: j.candidate_required_location || 'Remote',
    remote: true,
    url: j.url,
    postedAt: iso(j.publication_date),
    pay: extractSalary(j.salary || ''),
    jobType: (j.job_type || '').replace('_', '-').replace(/\b\w/g, (c) => c.toUpperCase()),
    description: htmlToText(j.description),
  }));
  log(`Remotive: ${jobs.length}`);
  return jobs;
}

/** RemoteOK — https://remoteok.com (attribution: links go back to RemoteOK). */
export async function remoteOK(cfg, log) {
  const data = await get('https://remoteok.com/api', { json: true });
  const jobs = (Array.isArray(data) ? data.slice(1) : []).map((j) => ({
    id: `remoteok-${j.id}`,
    source: 'RemoteOK',
    title: decode(j.position),
    company: decode(j.company),
    location: j.location || 'Remote',
    remote: true,
    url: j.url,
    postedAt: iso(j.date),
    pay: payFrom(j.salary_min, j.salary_max),
    description: htmlToText(j.description) + (j.tags?.length ? `\nTags: ${j.tags.join(', ')}` : ''),
  }));
  log(`RemoteOK: ${jobs.length}`);
  return jobs;
}

/** Himalayas search API — https://himalayas.app */
export async function himalayas(cfg, log, { quick = false } = {}) {
  const found = new Map();
  const queries = quick ? cfg.remoteBoardQueries.slice(0, 3) : cfg.remoteBoardQueries;
  for (const q of queries) {
    for (let page = 1; page <= (quick ? 1 : 5); page++) {
      const data = await get(
        `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&country=US&page=${page}`,
        { json: true },
      );
      await sleep(400);
      const list = data?.jobs || [];
      for (const j of list) {
        const id = `himalayas-${j.guid || j.applicationLink || j.title + j.companyName}`;
        if (found.has(id)) continue;
        found.set(id, {
          id,
          source: 'Himalayas',
          title: decode(j.title),
          company: j.companyName,
          location: (j.locationRestrictions || []).join(', ') || 'Remote (anywhere)',
          remote: true,
          url: j.applicationLink || j.guid,
          postedAt: iso(j.pubDate),
          pay: payFrom(j.minSalary, j.maxSalary, j.salaryPeriod),
          jobType: j.employmentType || '',
          seniority: (j.seniority || []).join(', '),
          description: htmlToText(j.description || j.excerpt),
        });
      }
      if (list.length < 20) break;
    }
  }
  log(`Himalayas: ${found.size}`);
  return [...found.values()];
}

/** Jobicy — https://jobicy.com (attribution: links go back to Jobicy). */
export async function jobicy(cfg, log) {
  const found = new Map();
  for (const tag of ['php', 'laravel', 'angular', 'typescript', 'javascript', 'node', 'full stack', 'software engineer']) {
    const data = await get(`https://jobicy.com/api/v2/remote-jobs?count=100&geo=usa&tag=${encodeURIComponent(tag)}`, { json: true });
    await sleep(400);
    for (const j of data?.jobs || []) {
      found.set(`jobicy-${j.id}`, {
        id: `jobicy-${j.id}`,
        source: 'Jobicy',
        title: decode(j.jobTitle),
        company: decode(j.companyName),
        location: j.jobGeo || 'Remote',
        remote: true,
        url: j.url,
        postedAt: iso(j.pubDate),
        pay: payFrom(j.salaryMin ?? j.annualSalaryMin, j.salaryMax ?? j.annualSalaryMax, j.salaryPeriod),
        jobType: [].concat(j.jobType || [])[0] || '',
        seniority: j.jobLevel || '',
        description: htmlToText(j.jobDescription || j.jobExcerpt),
      });
    }
  }
  log(`Jobicy: ${found.size}`);
  return [...found.values()];
}

/** We Work Remotely RSS — https://weworkremotely.com */
export async function weWorkRemotely(cfg, log) {
  const urls = [
    'https://weworkremotely.com/categories/remote-programming-jobs.rss',
    'https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss',
    'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss',
    'https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss',
  ];
  const found = new Map();
  for (const u of urls) {
    const xml = await get(u);
    if (!xml) continue;
    for (const item of xml.split('<item>').slice(1)) {
      const tag = (t) => decode((item.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`)) || [])[1] || '').trim();
      const full = tag('title');
      const [company, ...rest] = full.split(':');
      const link = tag('link') || tag('guid');
      found.set(`wwr-${link}`, {
        id: `wwr-${link}`,
        source: 'We Work Remotely',
        title: rest.join(':').trim() || full,
        company: company.trim(),
        location: tag('region') || 'Remote',
        remote: true,
        url: link,
        postedAt: iso(tag('pubDate')),
        jobType: tag('type'),
        description: htmlToText(tag('description')),
      });
    }
  }
  log(`We Work Remotely: ${found.size}`);
  return [...found.values()];
}

/** Hacker News monthly "Who is hiring?" thread via the Algolia HN API. */
export async function hackerNews(cfg, log) {
  const stories = await get('https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5', { json: true });
  const story = stories?.hits?.find((h) => /who is hiring/i.test(h.title));
  if (!story) return [];
  const jobs = [];
  for (let page = 0; page < 3; page++) {
    const data = await get(
      `https://hn.algolia.com/api/v1/search?tags=comment,story_${story.objectID}&hitsPerPage=1000&page=${page}`,
      { json: true },
    );
    for (const c of data?.hits || []) {
      if (String(c.parent_id) !== String(story.objectID) || !c.comment_text) continue;
      const text = htmlToText(c.comment_text);
      const head = text.split('\n')[0];
      const parts = head.split('|').map((s) => s.trim());
      if (parts.length < 2) continue;
      const roleIdx = parts.findIndex((p, i) => i > 0 && /engineer|developer|programmer|full.?stack|backend|frontend|software/i.test(p));
      jobs.push({
        id: `hn-${c.objectID}`,
        source: 'HN Who’s Hiring',
        title: roleIdx > 0 ? parts[roleIdx] : parts[1],
        company: parts[0],
        location: parts.filter((p, i) => i > 0 && i !== roleIdx).join(' | ').slice(0, 140),
        remote: /remote/i.test(head),
        url: `https://news.ycombinator.com/item?id=${c.objectID}`,
        postedAt: iso(c.created_at),
        description: text,
      });
    }
    if ((data?.nbPages ?? 0) <= page + 1) break;
  }
  log(`HN Who's Hiring (${story.title}): ${jobs.length}`);
  return jobs;
}

/** SimplifyJobs community-maintained New Grad list (GitHub). */
export async function simplifyNewGrad(cfg, log) {
  const data = await get('https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json', {
    json: true,
    timeoutMs: 60000,
  });
  const jobs = (data || [])
    .filter((j) => j.active && j.is_visible !== false)
    .map((j) => ({
      id: `simplify-${j.id}`,
      source: 'Simplify New Grad',
      title: j.title,
      company: j.company_name,
      location: (j.locations || []).join('; '),
      remote: (j.locations || []).some((l) => /remote/i.test(l)),
      url: j.url,
      postedAt: iso(j.date_posted),
      jobType: 'Full-time',
      seniority: 'New grad',
      description: `Category: ${j.category || ''}. Sponsorship: ${j.sponsorship || 'n/a'}. Degrees: ${(j.degrees || []).join(', ')}`,
    }));
  log(`Simplify New Grad: ${jobs.length} active`);
  return jobs;
}
