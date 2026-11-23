// Scam / reliability screening for job postings.
import { get, sleep } from './http.js';

// Strong scam signals — any one of these makes a posting "risky".
const RED = [
  [/\btelegram\b|\bwhats ?app\b|signal app|google hangouts?|wire app|interview (via|over|on) (chat|text|teams chat)/i, 'Asks to contact/interview over chat apps (Telegram/WhatsApp/etc.)'],
  [/(purchase|buy) (your own |the )?(equipment|laptop|software|supplies)[^.\n]{0,60}(reimburs|check)|(send|mail) you a (check|cheque)|deposit (the|a) check|cashier'?s check/i, 'Equipment-purchase / check-deposit pattern'],
  [/(pay|fee)[^.\n]{0,30}(for|to cover) (training|background check|onboarding|starter kit)|(training|registration|application) fee/i, 'Asks you to pay a fee'],
  [/paid in (bitcoin|crypto|usdt)|gift cards?/i, 'Crypto or gift-card payment'],
  [/\b(reship|package forwarding|receive packages|payment processing agent|money transfer agent)/i, 'Package-reshipping / money-mule pattern'],
  [/(social security|ssn|bank account( number)?|routing number)[^.\n]{0,40}(before|to apply|in your application|send)/i, 'Asks for SSN/bank info up front'],
];

// Softer signals — "caution".
const YELLOW = [
  [/[a-z0-9._%+-]+@(gmail|yahoo|hotmail|outlook|aol|proton(mail)?|icloud)\.(com|me)/i, 'Recruiter uses a free email address'],
  [/no (prior )?experience (needed|required|necessary)/i, '"No experience needed"'],
  [/(hiring|start) (immediately|asap|today)|urgent(ly)? hiring/i, 'High-pressure urgency language'],
  [/\b(typing job|mystery shopper)\b/i, 'Common scam job category wording'],
  [/train(ing)? (next[- ]generation |frontier )?ai (systems|models)|ai training (work|data|project)|reinforcement learning (environments?|tasks?)|code evaluation|paid per (accepted )?task|\brlhf\b|improv(e|ing) the coding[^.]{0,40}(ai|models)/i, 'AI-training gig work (contract, paid per task — not a regular dev job)'],
  [/future position|potential position|talent pool|open roster|for future (roles|positions|opportunities)|evergreen (role|posting)|planned for hiring/i, 'Not a current opening (future role / talent pool)'],
  [/¡|\bsomos\b|\bbuscamos\b|\brequisitos\b|\bexperiencia\b/i, 'Spanish-language posting aimed at LATAM'],
];

// Real companies often include "we will NEVER ask via WhatsApp / for money" disclaimers.
const NEGATED = /(never|\bnot\b|n't|\bnor\b|no one|beware|fraud|scam|phishing|impersonat|purporting|fake)[\s\S]{0,120}$/i;
function hits(rules, text) {
  const out = [];
  for (const [re, msg] of rules) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    for (const m of text.matchAll(g)) {
      if (!NEGATED.test(text.slice(Math.max(0, m.index - 140), m.index))) {
        out.push(msg);
        break;
      }
    }
  }
  return out;
}

const AGENCIES =
  /robert half|kforce|tekwissen|prestige staffing|techclub|cybercoders|insight global|jobot|teksystems|randstad|adecco|kelly services|apex systems|motion recruitment|dice\b|tech ladies|hired\b|crossover|toptal|turing\b|braintrust|emonics|select source|kavaliro|talent solutions|staffing|recruit|consult(ing|ants)? (group|inc)|solutions inc|infotech|technologies (inc|pvt|private)|private limited|pvt\.? ltd/i;
const BOOTCAMP_TRAP = /revature|smoothstack|syntax technologies|sdet academy|training (and|&) placement|we will train you and place|repay(ment)? (of )?training|training (cost|bond)/i;
const FORM_HOSTS = /forms\.gle|docs\.google\.com\/forms|bit\.ly|tinyurl|t\.me\/|wa\.me\//i;

export function vetJob(job, cfg = {}) {
  const text = `${job.title}\n${job.company}\n${job.description || ''}`;
  const red = hits(RED, text);
  const yellow = hits(YELLOW, text);

  if (!job.company || /confidential|undisclosed|stealth|early-stage startup|unnamed/i.test(job.company)) yellow.push('Company not named');
  if (AGENCIES.test(job.company || '')) yellow.push('Staffing agency / third-party recruiter (real job, but via a middleman)');
  if (BOOTCAMP_TRAP.test(text)) red.push('Train-and-place program — check for a training repayment clause');
  if (FORM_HOSTS.test(job.url || '') || FORM_HOSTS.test(job.description || '')) yellow.push('Applies via a Google Form / link shortener instead of a company site');

  for (const [name, why] of Object.entries(cfg.watchlist || {})) {
    if (new RegExp(name, 'i').test(job.company || '')) (why.startsWith('!') ? red : yellow).push(why.replace(/^!/, ''));
  }

  const p = job.pay;
  const entry = /junior|entry|new grad|associate|\bi\b/i.test(`${job.title} ${job.seniority || ''}`);
  if (p?.min && p.period === 'hour' && p.min >= 60 && /no (prior )?experience/i.test(text)) red.push('Very high hourly pay with no experience required');
  if (p?.min && entry && p.period === 'year' && p.min >= 200000) yellow.push('Pay unusually high for an entry-level role');

  if (!job.description || job.description.length < 200) yellow.push('Little or no description to verify');

  return { red, yellow };
}

const SOFT = /staffing agency|little or no description/i;

/** Vet every job, including cross-posting checks (same template text under different companies). */
export function vetAll(jobs, cfg = {}) {
  const fingerprint = (j) => {
    if (!j.description || j.description.length < 400) return null;
    let d = j.description.toLowerCase();
    for (const w of (j.company || '').toLowerCase().split(/\s+/).filter((w) => w.length > 2)) d = d.split(w).join('');
    return d.replace(/[^a-z]/g, '').slice(0, 220);
  };
  const byFp = new Map();
  for (const j of jobs) {
    const fp = fingerprint(j);
    if (fp) byFp.set(fp, [...(byFp.get(fp) || []), j]);
  }
  for (const j of jobs) {
    const { red, yellow } = vetJob(j, cfg);
    const fp = fingerprint(j);
    const twins = fp ? byFp.get(fp).filter((o) => o !== j && o.company !== j.company) : [];
    if (twins.length) red.push(`Same word-for-word text as a posting from “${twins[0].company}” (likely fake/templated)`);
    j.trust = red.length ? 'risky' : yellow.some((y) => !SOFT.test(y)) ? 'caution' : 'ok';
    j.trustFlags = [...red, ...yellow];
  }
}

const CLOSED = /no longer accepting applications|no longer available|position has been filled|job (posting )?(has )?(expired|closed)|this job is closed|job not found|posting is no longer|page (you'?re looking for )?(can'?t|cannot|could not) be found|the job you are looking for (is|was|has|no)/i;

/** Visible text only — page scripts often contain "job closed" templates even on open jobs. */
const visibleText = (html) =>
  html
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

/** Check whether each posting's link is still live. Sets job.live = 'open' | 'closed' | 'unknown'. */
export async function checkLive(jobs, log = () => {}) {
  const li = jobs.filter((j) => /linkedin\.com\/jobs\/view\/(\d+)/.test(j.url));
  const other = jobs.filter((j) => !li.includes(j));

  let i = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (i < other.length) {
        const j = other[i++];
        j.live = await probe(j.url);
      }
    }),
  );
  for (const j of li) {
    const id = j.url.match(/view\/(\d+)/)[1];
    const html = await get(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`, { retries: 1 });
    j.live = html == null ? 'unknown' : /no longer accepting applications/i.test(visibleText(html)) ? 'closed' : 'open';
    await sleep(700);
  }
  const c = (s) => jobs.filter((j) => j.live === s).length;
  log(`Live check: ${c('open')} open, ${c('closed')} closed, ${c('unknown')} couldn't verify`);
}

async function probe(url) {
  if (!url) return 'unknown';
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' },
    });
    if (res.status === 404 || res.status === 410) return 'closed';
    if (!res.ok) return 'unknown'; // 403/429 = bot protection, not proof of anything
    const text = visibleText(await res.text());
    if (text.length < 300) return 'unknown'; // JS-only page; can't tell
    return CLOSED.test(text) ? 'closed' : 'open';
  } catch {
    return 'unknown';
  }
}
