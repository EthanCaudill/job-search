// Pulls structured info (pay, type, benefits, requirements...) out of free-text job descriptions.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', hellip: '…' };

export function decode(s = '') {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** HTML -> readable text, keeping list items as "• " lines. */
export function htmlToText(html = '') {
  let s = String(html);
  if (/&lt;\w/.test(s) && !/<\w/.test(s)) s = decode(s); // double-encoded feeds (RSS)
  s = s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|ul|ol|li|tr|section)>/gi, '\n')
    .replace(/<(p|div|h[1-6]|ul|ol|section)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  s = decode(s);
  return s
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && l !== '•')
    .join('\n');
}

const num = (v, k) => {
  let n = parseFloat(String(v).replace(/,/g, ''));
  if (k) n *= 1000;
  return n;
};

/** Find a pay range in text. Returns {min,max,period:'year'|'hour', text} or null. */
export function extractSalary(text = '') {
  const amt = String.raw`\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*([kK])?`;
  const per = String.raw`(?:\s*(?:\/|per|an|a)\s*(hour|hr|year|yr|annum|annually|annual))?`;
  const range = new RegExp(`${amt}\\s*(?:-|–|—|to)\\s*${amt}${per}`, 'i');
  const single = new RegExp(`${amt}${per}`, 'i');
  let m = text.match(range);
  let min, max, unit, raw;
  if (m) {
    min = num(m[1], m[2]);
    max = num(m[3], m[4] || m[2]);
    unit = m[5];
    raw = m[0];
  } else {
    // single amounts only count when they look like pay (near pay words or with a unit)
    const re = new RegExp(single.source, 'gi');
    for (const s of text.matchAll(re)) {
      const ctx = text.slice(Math.max(0, s.index - 60), s.index + s[0].length + 20).toLowerCase();
      if (s[3] || /salary|pay|compensation|wage|rate|base/.test(ctx)) {
        min = max = num(s[1], s[2]);
        unit = s[3];
        raw = s[0];
        break;
      }
    }
    if (min == null) return null;
  }
  if (!(min > 0) || max < min) return null;
  let period = unit && /h/i.test(unit) ? 'hour' : unit ? 'year' : max < 300 ? 'hour' : 'year';
  if (period === 'year' && max < 15000) return null; // probably a bonus/stipend, not salary
  if (period === 'hour' && max > 400) return null;
  return { min, max, period, text: raw.trim() };
}

export function formatPay(p) {
  if (!p || !p.min) return '';
  const f = (n) => (p.period === 'hour' ? `$${n.toFixed(n % 1 ? 2 : 0)}` : `$${Math.round(n / 1000)}k`);
  const r = p.min === p.max ? f(p.min) : `${f(p.min)}–${f(p.max)}`;
  return `${r}${p.period === 'hour' ? '/hr' : '/yr'}`;
}

/** Annualized midpoint, for sorting. */
export const annualPay = (p) => (!p || !p.min ? 0 : ((p.min + p.max) / 2) * (p.period === 'hour' ? 2080 : 1));

export function extractJobType(text = '') {
  const t = text.toLowerCase();
  const types = [];
  if (/full[- ]?time/.test(t)) types.push('Full-time');
  if (/part[- ]?time/.test(t)) types.push('Part-time');
  if (/contract[- ]to[- ]hire|c2h/.test(t)) types.push('Contract-to-hire');
  else if (/\bcontract(or)?\b|\b1099\b|\bw2\b/.test(t)) types.push('Contract');
  if (/\binternship\b|\bintern\b/.test(t)) types.push('Internship');
  if (/\btemporary\b|\btemp\b/.test(t)) types.push('Temporary');
  return types;
}

const BENEFITS = [
  ['Health insurance', /\b(medical|health)\s*(insurance|benefits|coverage|care coverage|plan|, dental)|\bmedical\b/i],
  ['Dental', /\bdental\b/i],
  ['Vision', /\bvision\b(?!ary)/i],
  ['401(k)', /401\s?\(?k\)?|retirement (plan|savings)|\b403\(b\)/i],
  ['401(k) match', /401\s?\(?k\)?[^.\n]{0,40}match|match[^.\n]{0,30}401/i],
  ['PTO / vacation', /\bpto\b|paid time off|vacation|paid holidays/i],
  ['Unlimited PTO', /unlimited (pto|vacation|paid time off)|flexible time off/i],
  ['Parental leave', /parental leave|maternity|paternity|family leave/i],
  ['Equity / stock', /\bequity\b|stock options|\brsus?\b|\bespp\b/i],
  ['Bonus', /\bbonus(es)?\b/i],
  ['Tuition / learning', /tuition|education assistance|learning (stipend|budget)|professional development|certification reimbursement/i],
  ['Home office / remote stipend', /home office|remote (work )?stipend|equipment stipend|work[- ]from[- ]home stipend/i],
  ['Life / disability insurance', /life insurance|disability insurance|\bstd\b|\bltd\b/i],
  ['HSA / FSA', /\bhsa\b|\bfsa\b|health savings/i],
  ['Flexible schedule', /flexible (schedule|hours|working hours)/i],
  ['Wellness', /wellness|gym|fitness/i],
];

export function extractBenefits(text = '') {
  return BENEFITS.filter(([, re]) => re.test(text)).map(([n]) => n);
}

const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const PREFERRED = /prefer|nice[- ]to[- ]have|\bplus\b|bonus|ideal(ly)?|desired|a big plus|advantage/i;
const DEGREE_ALT = /\b(with|w\/)\s+(a\s+)?(ms|m\.s\.|master|phd|ph\.d)/i; // "3 years with MS" alternatives

/** Years of experience the posting asks for. */
export function extractYearsInfo(text = '') {
  const t = text.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b(?=\s*\(?\d*\)?\s*\+?\s*(?:or more\s+)?years?)/gi, (w) => WORD_NUM[w.toLowerCase()]);
  const re = /(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*(\d{1,2})\s*)?\+?\s*(?:or more\s+)?years?(?:'|’)?\s*(?:of\s+)?(?:[a-z/,.+#()\- ]{0,50}?)(experience|developing|development|programming|working)/gi;
  const required = [];
  const preferred = [];
  // Look at each bullet / sentence on its own so "preferred" only applies to its own line.
  for (const seg of t.split(/\n|•|·|;|(?<=[a-z)])\.\s+(?=[A-Z])/)) {
    if (DEGREE_ALT.test(seg) && !/\b(bs|b\.s\.|bachelor)/i.test(seg)) continue;
    const bs = seg.match(/(\d{1,2})\s*\+?\s*years?\s+(?:of\s+experience\s+)?(?:with|and)\s+(?:a\s+)?(?:bs|b\.s\.|ba|b\.a\.|bachelor)/i);
    if (bs) required.push(+bs[1]); // "5 years with BS/BA; 3 years with MS"
    for (const m of seg.matchAll(re)) {
      const n = +m[1];
      if (n > 15) continue;
      (PREFERRED.test(seg) ? preferred : required).push(n);
    }
  }
  return {
    // The main bar is the HIGHEST required number ("3 yrs OOP" + "2 yrs PHP" means 3).
    required: required.length ? Math.max(...required) : null,
    preferred: preferred.length ? Math.max(...preferred) : null,
  };
}

export function extractYears(text = '') {
  const { required, preferred } = extractYearsInfo(text);
  return required ?? preferred;
}

export function extractDegree(text = '') {
  const t = text;
  if (/\b(ph\.?d|doctorate)\b/i.test(t) && /requir/i.test(t)) return 'PhD mentioned';
  if (/\bmaster'?s?\b|\bm\.s\.\b/i.test(t) && !/bachelor/i.test(t)) return "Master's";
  if (/bachelor|\bb\.?s\.?\b(?= in| degree)|\bb\.a\.|degree in (computer|software|information|engineering)|\bcs degree|4-year degree|four-year degree/i.test(t))
    return /or equivalent|equivalent (experience|combination)/i.test(t) ? "Bachelor's (or equivalent experience)" : "Bachelor's";
  if (/associate'?s degree/i.test(t)) return "Associate's";
  return '';
}

export function extractFlags(text = '') {
  const flags = [];
  if (/security clearance|secret clearance|\bts\/sci\b|top secret|public trust/i.test(text)) flags.push('Clearance mentioned');
  if (/(no|not|unable to) (offer |provide )?(visa )?sponsor/i.test(text)) flags.push('No visa sponsorship');
  if (/\bhybrid\b/i.test(text)) flags.push('Hybrid mentioned');
  if (/on[- ]?site|in[- ]office|in person/i.test(text)) flags.push('On-site mentioned');
  if (/travel/i.test(text) && /\d+\s*%\s*travel|travel (up to|required)/i.test(text)) flags.push('Travel required');
  return flags;
}

const QUAL_HEAD = /(requirement|qualification|what you('|’)?ll (need|bring)|what we('|’)?re looking for|who you are|you (have|bring|are)|must[- ]have|minimum|basic|skills|about you|experience)/i;
const PREF_HEAD = /(preferred|nice[- ]to[- ]have|bonus points|plus(es)?\b|desired|ideal)/i;
const OTHER_HEAD = /(benefit|perks|what we offer|compensation|responsibilit|what you('|’)?ll do|about (us|the company|the role)|our (team|company)|equal opportunity|why join|day to day)/i;

const isHeading = (l) => !l.startsWith('•') && l.length < 90 && (/:$/.test(l) || l.split(' ').length <= 8);

/** Bullet points under the Requirements/Qualifications and Preferred headings. */
export function extractQualifications(text = '') {
  const lines = text.split('\n');
  const req = [];
  const pref = [];
  let mode = null;
  for (const l of lines) {
    if (isHeading(l)) {
      if (PREF_HEAD.test(l)) mode = 'pref';
      else if (QUAL_HEAD.test(l) && !OTHER_HEAD.test(l)) mode = 'req';
      else if (OTHER_HEAD.test(l) || /:$/.test(l)) mode = null;
      continue;
    }
    if (!mode) continue;
    const item = l.replace(/^•\s*/, '');
    if (item.length < 8 || item.length > 300 || /:$/.test(item)) continue;
    if (mode === 'req' && req.length < 10) req.push(item);
    if (mode === 'pref' && pref.length < 6) pref.push(item);
  }
  return { required: req, preferred: pref };
}

const TECH = [
  'PHP', 'Laravel', 'Symfony', 'Angular', 'React', 'Vue', 'Svelte', 'Next.js', 'TypeScript', 'JavaScript', 'Node.js',
  'Python', 'Django', 'Flask', 'FastAPI', 'Java', 'Spring', 'Kotlin', 'C#', '.NET', 'Go', 'Rust', 'Ruby', 'Rails',
  'Swift', 'C++', 'SQL', 'MySQL', 'PostgreSQL', 'SQL Server', 'MongoDB', 'Redis', 'GraphQL', 'REST', 'AWS', 'Azure',
  'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Linux', 'Git', 'CI/CD', 'GitHub Actions', 'Jenkins', 'HTML', 'CSS',
  'SCSS', 'Tailwind', 'Bootstrap', 'jQuery', 'Salesforce', 'Power BI', 'Tableau', 'Kafka', 'Elasticsearch',
  'Microservices', 'Agile', 'Scrum', 'PHPUnit', 'Jest', 'Cypress', 'Selenium', 'Playwright', 'WordPress', 'Shopify',
];
const techRe = (t) =>
  new RegExp(
    `(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('Node\\.js', 'Node(\\.js)?').replace('PostgreSQL', 'Postgre(SQL|s)')}(?![a-z0-9])`,
    t === 'Go' || t === 'REST' || t === 'SQL' ? '' : 'i',
  );
const TECH_RES = TECH.map((t) => [t, techRe(t)]);

export function extractTech(text = '') {
  return TECH_RES.filter(([, re]) => re.test(text)).map(([t]) => t);
}

// ---- Work arrangement (remote / hybrid / onsite) ----
const HYBRID_RE = [
  /\bhybrid\b[^.\n]{0,30}\b(role|position|work|schedule|model|environment|arrangement|policy|opportunity|basis)\b/i,
  /\b(role|position|this job|this is a|work model|schedule)\b[^.\n]{0,30}\bhybrid\b/i,
  /\bhybrid\b[^.\n]{0,50}\b(office|onsite|on-site|in-person|days?)\b/i,
  /\b(office|onsite|on-site)\b[^.\n]{0,40}\bhybrid\b/i,
  /\(\s*hybrid\s*\)|\bhybrid\s*[-–|]/i,
  /\b(\d|one|two|three|four)\s*(\+\s*)?(days?|x)\s*(a|per|\/)\s*week\b[^.\n]{0,40}\b(office|onsite|on-site|in[- ]person|on campus)\b/i,
  /\b(office|onsite|on-site|in[- ]person)\b[^.\n]{0,40}\b(\d|one|two|three|four)\s*(\+\s*)?days?\s*(a|per|\/)\s*week\b/i,
];
const ONSITE_RE = [
  /\b(this is an?|this|the) (fully )?(in[- ]office|on[- ]?site|in[- ]person) (role|position|job)\b/i,
  /\b(in[- ]office|on[- ]?site|in[- ]person) (role|position)\b/i,
  /\b(must|required to|expected to|need to) (be able to )?(work|report|commute|be) (on[- ]?site|in[- ]office|in the office|in person|to (the|our) office)\b/i,
  /\b(relocation|relocate)\b[^.\n]{0,40}\b(required|necessary|must)\b|\bmust (be willing to )?relocate\b/i,
  /\bnot (a )?remote\b|\bno remote\b|\bremote work is not\b/i,
  /\(\s*on[- ]?site\s*\)|\bon[- ]?site\s*[-–|]/i,
];
const REMOTE_RE =
  /\b(fully|100%|completely|entirely|permanently) remote\b|\bremote[- ]first\b|\bremote[- ](only|role|position|job|opportunity)\b|\bwork from anywhere\b|\bwork from home\b|\bremote within the (us|u\.s\.|united states)\b|\bremote \((us|usa|united states)[^)]*\)|\bremote,? (us|usa|united states)\b/i;
const NEGATED_MODE = /(not|no|never|isn'?t|without)\s+(a\s+)?$/i;

const firstHit = (res, text) => {
  for (const re of res) {
    const m = text.match(re);
    if (m && !NEGATED_MODE.test(text.slice(Math.max(0, m.index - 12), m.index))) return m[0];
  }
  return null;
};

/** Returns {mode:'remote'|'hybrid'|'onsite'|'unknown', evidence}. */
export function extractWorkMode(job) {
  const head = `${job.title || ''} | ${job.location || ''}`;
  const text = `${head}\n${job.description || ''}`;
  const hybrid = firstHit(HYBRID_RE, text);
  const onsite = firstHit(ONSITE_RE, text);
  const rm = text.match(REMOTE_RE);
  const remoteNegated = rm && /(not|no|never|isn'?t)\s+(a\s+)?$/i.test(text.slice(Math.max(0, rm.index - 12), rm.index));
  const remote = (!remoteNegated && rm?.[0]) || (/\bremote\b/i.test(head) && !/not remote/i.test(head) ? 'Remote (title/location)' : null);
  if (hybrid) return { mode: 'hybrid', evidence: hybrid };
  if (onsite && !remote) return { mode: 'onsite', evidence: onsite };
  if (remote) return { mode: 'remote', evidence: remote };
  if (onsite) return { mode: 'onsite', evidence: onsite };
  return { mode: 'unknown', evidence: '' };
}

/** Which application system the link goes to (Greenhouse/Lever/Ashby are fastest to fill). */
export function detectATS(url = '') {
  const u = url.toLowerCase();
  if (/greenhouse\.io/.test(u)) return 'Greenhouse';
  if (/lever\.co/.test(u)) return 'Lever';
  if (/ashbyhq\.com/.test(u)) return 'Ashby';
  if (/myworkdayjobs|workday/.test(u)) return 'Workday';
  if (/icims\.com/.test(u)) return 'iCIMS';
  if (/smartrecruiters/.test(u)) return 'SmartRecruiters';
  if (/linkedin\.com/.test(u)) return 'LinkedIn';
  return '';
}

/** Run every extractor and merge with whatever the source already gave us. */
export function enrich(job) {
  const text = job.description || '';
  const all = `${job.title}\n${text}`;
  const pay = job.pay?.min ? job.pay : extractSalary(text);
  const types = job.jobType ? [job.jobType] : extractJobType(all);
  const wm = extractWorkMode(job);
  return {
    ...job,
    workMode: wm.mode,
    workModeEvidence: wm.evidence,
    ats: job.ats || detectATS(job.url),
    pay,
    payText: formatPay(pay),
    jobType: types[0] || '',
    benefits: extractBenefits(text),
    yearsRequired: extractYearsInfo(text).required,
    yearsPreferred: extractYearsInfo(text).preferred,
    degree: extractDegree(text),
    flags: extractFlags(text),
    qualifications: extractQualifications(text),
    techAsked: extractTech(all),
  };
}
