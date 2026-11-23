// Location/level filtering and resume-match scoring.

const US_OK = /united states|\busa?\b|u\.s\.|north america|americas|anywhere|worldwide|global|kentucky|\bky\b|\best\b|eastern time|^remote$|remote \(?us/i;
const NON_US = /europe|\beu\b|emea|\buk\b|united kingdom|england|canada|latam|latin america|mexico|brazil|argentina|colombia|india|apac|asia|australia|germany|france|spain|poland|netherlands|portugal|philippines|africa|israel|ireland|singapore|japan|romania|ukraine|turkey|pakistan|ontario|toronto|vancouver|british columbia|quebec|montreal|alberta|calgary|ottawa|london(?!,? ky)/i;
const STATES = /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i;

/** Remote job on a remote board that names specific states (not KY) may require living there. */
export function stateRestricted(job) {
  if (!job.remote || job.source === 'LinkedIn') return false;
  const loc = job.location || '';
  return STATES.test(loc) && !/kentucky|\bky\b|united states|\busa?\b|anywhere|any state/i.test(loc);
}

export function isKentucky(loc = '', cfg) {
  if (/\bkentucky\b/i.test(loc) || /,\s*KY\b/.test(loc) || /\bKY\b/.test(loc)) return true;
  return false;
}

export function remoteUSOk(job) {
  if (!job.remote) return false;
  const loc = job.location || '';
  if (!loc.trim() || US_OK.test(loc)) return true;
  if (NON_US.test(loc)) return false;
  return true;
}

const REMOTE_ONLY_BOARDS = new Set(['Remotive', 'RemoteOK', 'Himalayas', 'Jobicy', 'We Work Remotely']);

/**
 * Outside Kentucky a job must be FULLY remote (no hybrid, no on-site).
 * The description wins over board labels: LinkedIn's "remote" filter lets on-site jobs through.
 */
export function strictlyRemote(job) {
  if (!remoteUSOk(job)) return false;
  if (job.workMode === 'hybrid' || job.workMode === 'onsite') return false;
  if (job.workMode === 'remote') return true;
  // Unknown arrangement: trust only remote-only boards, or a location that is literally "remote/US".
  if (REMOTE_ONLY_BOARDS.has(job.source)) return true;
  return /^(remote|united states|usa|us|remote[^a-z]*(us|usa|united states)?)$/i.test((job.location || '').trim()) ||
    /^remote in usa/i.test(job.location || '');
}

export function daysOld(job) {
  if (!job.postedAt) return null;
  return Math.floor((Date.now() - Date.parse(job.postedAt)) / 86400000);
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Returns null if the job should be dropped, else the job with score + reasons. */
export function evaluate(job, cfg) {
  const inc = new RegExp(cfg.titleInclude, 'i');
  const exc = new RegExp(cfg.titleExclude, 'i');
  const title = job.title || '';
  if (!title || !inc.test(title) || exc.test(title)) return null;

  const ky = isKentucky(job.location, cfg);
  if (!ky && !strictlyRemote(job)) return null;

  const age = daysOld(job);
  if (age != null && age > cfg.maxAgeDays) return null;

  const isIntern = /\bintern(ship)?\b|co-?op\b/i.test(title) || /intern/i.test(job.jobType || '');
  if (isIntern && !cfg.includeInternships) return null;
  if (/\bsenior\b|director|executive/i.test(job.seniority || '') && !/entry|junior|associate/i.test(job.seniority)) return null;
  if (job.yearsRequired != null && job.yearsRequired > cfg.maxYearsRequired) return null;

  const text = `${title}\n${job.description || ''}`.toLowerCase();
  const reasons = [];
  let score = 0;

  // Resume skill overlap (max 45)
  const matched = [];
  let skillPts = 0;
  for (const [skill, w] of Object.entries(cfg.resumeSkills)) {
    const re = new RegExp(`(^|[^a-z0-9])${esc(skill)}(?![a-z0-9])`, 'i');
    if (re.test(text)) {
      matched.push(skill);
      skillPts += w;
    }
  }
  score += Math.min(45, skillPts * 0.9);

  // Title fit (max 25)
  if (/software (engineer|developer)|full[- ]?stack|web developer|application developer|back[- ]?end|front[- ]?end|programmer/i.test(title)) {
    score += 15;
  } else if (/developer|engineer/i.test(title)) score += 7;
  if (/php|laravel|angular|typescript|node|javascript/i.test(title)) {
    score += 10;
    reasons.push('Your stack is in the title');
  }

  // Level fit (max 20)
  const lvl = `${title} ${job.seniority || ''}`;
  // Experience is weighed above the title: a "Jr." title asking for 3+ years isn't junior.
  const yrs = job.yearsRequired;
  const juniorTitle = /junior|\bjr\.?\b|entry|new grad|graduate|early career|associate|\bi\b|\b1\b|apprentice|university/i.test(lvl);
  if (juniorTitle) {
    score += yrs != null && yrs >= 3 ? 5 : 20;
    reasons.push(yrs != null && yrs >= 3 ? 'Junior title, but asks for more experience' : 'Entry / junior level');
  } else if (/mid-senior/i.test(job.seniority || '')) score -= 10;
  else score += 5;
  if (yrs != null) {
    // 0-1 yrs: +8, 2 yrs: 0, 3 yrs: -15, 4 yrs: -25
    const adj = yrs <= 1 ? 8 : yrs === 2 ? 0 : yrs === 3 ? -15 : -25;
    score += adj;
    reasons.push(yrs <= 2 ? `${yrs}+ yrs asked` : `Reach: ${yrs}+ yrs required`);
  } else if (job.yearsPreferred != null) {
    if (job.yearsPreferred >= 3) score -= 5;
    reasons.push(`${job.yearsPreferred}+ yrs preferred (not required)`);
  }
  if (ky) {
    score += 5;
    reasons.push('In Kentucky');
  }
  if (!job.description) score -= 5; // less certainty

  const flags = [...(job.flags || [])];
  if (!ky && stateRestricted(job)) {
    flags.push('Remote may be limited to listed states');
    score -= 10;
  }

  if (matched.length) reasons.unshift(`Matches: ${matched.slice(0, 8).join(', ')}`);
  return {
    ...job,
    flags,
    score: Math.max(0, Math.min(100, Math.round(score))),
    where: ky
      ? job.workMode === 'remote' ? 'Kentucky + Remote' : `Kentucky${job.workMode === 'hybrid' ? ' (hybrid)' : job.workMode === 'onsite' ? ' (on-site)' : ''}`
      : 'Remote (US)',
    ageDays: age,
    matchedSkills: matched,
    reasons,
    isIntern,
  };
}

const norm = (s = '') => s.toLowerCase().replace(/\b(inc|llc|ltd|corp|corporation|co)\b\.?/g, '').replace(/[^a-z0-9]/g, '');

/** Merge the same posting found on several boards. */
export function dedupe(jobs) {
  const by = new Map();
  for (const j of jobs) {
    const key = `${norm(j.company)}|${norm(j.title)}`;
    const prev = by.get(key);
    if (!prev) {
      by.set(key, { ...j, sources: [{ name: j.source, url: j.url }] });
      continue;
    }
    prev.sources.push({ name: j.source, url: j.url });
    const richer = (j.description?.length || 0) + (j.pay?.min ? 500 : 0) > (prev.description?.length || 0) + (prev.pay?.min ? 500 : 0);
    if (richer) by.set(key, { ...j, sources: prev.sources });
  }
  return mergeReposts([...by.values()]);
}

const STOP = new Set(['and', 'the', 'of', 'for', 'remote', 'us', 'usa', 'full', 'time', 'i', 'ii', 'contingent', 'contract']);
const titleWords = (t = '') =>
  new Set(t.toLowerCase().replace(/\bjr\b\.?/g, 'junior').replace(/\bsr\b\.?/g, 'senior').split(/[^a-z0-9+#]+/).filter((w) => w && !STOP.has(w)));

/**
 * Merge the same posting re-listed under another company name, e.g. a recruiter or
 * job-board account ("Superworq") reposting Aretum's job with a reworded title.
 * Signal: the listing's description doesn't name its own company but opens by naming
 * another company we also have, and the two titles are near-identical.
 * The original company's listing is kept; the repost becomes an extra source.
 */
function mergeReposts(jobs) {
  const drop = new Set();
  for (const j of jobs) {
    const head = norm((j.description || '').slice(0, 400));
    const own = norm(j.company);
    if (!head || (own.length > 2 && head.includes(own))) continue;
    const A = titleWords(j.title);
    const orig = jobs.find((o) => {
      if (o === j || drop.has(o)) return false;
      const c = norm(o.company);
      if (c.length < 4 || c === own || !head.includes(c)) return false;
      const B = titleWords(o.title);
      const n = [...A].filter((w) => B.has(w)).length;
      return n / Math.min(A.size, B.size) >= 0.75;
    });
    if (!orig) continue;
    orig.sources = [...(orig.sources || []), ...(j.sources || [])];
    orig.alsoListedAs = [...(orig.alsoListedAs || []), `${j.title} — ${j.company}`];
    orig.alsoIds = [...(orig.alsoIds || []), j.id];
    orig.isNew = orig.isNew || j.isNew;
    drop.add(j);
  }
  return jobs.filter((j) => !drop.has(j));
}
