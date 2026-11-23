// Builds the HTML dashboard + CSV export.

const csvCell = (v) => {
  const s = Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(jobs) {
  const cols = [
    ['Score', (j) => j.score],
    ['New', (j) => (j.isNew ? 'yes' : '')],
    ['Title', (j) => j.title],
    ['Company', (j) => j.company],
    ['Where', (j) => j.where],
    ['Location', (j) => j.location],
    ['Pay', (j) => j.payText],
    ['Job type', (j) => j.jobType],
    ['Seniority', (j) => j.seniority],
    ['Years required', (j) => j.yearsRequired],
    ['Degree', (j) => j.degree],
    ['Benefits', (j) => j.benefits],
    ['Tech asked', (j) => j.techAsked],
    ['Your matching skills', (j) => j.matchedSkills],
    ['Requirements', (j) => j.qualifications?.required],
    ['Flags', (j) => j.flags],
    ['Posted', (j) => j.postedAt],
    ['Source', (j) => j.sources.map((s) => s.name)],
    ['URL', (j) => j.url],
  ];
  const lines = [cols.map(([h]) => h).join(',')];
  for (const j of jobs) lines.push(cols.map(([, f]) => csvCell(f(j))).join(','));
  return '﻿' + lines.join('\r\n');
}

function manualLinks(kw) {
  const q = encodeURIComponent(kw);
  const p = kw.replace(/\s+/g, '+');
  return [
    ['Indeed — Kentucky', `https://www.indeed.com/jobs?q=${p}&l=Kentucky&fromage=14`],
    ['Indeed — Remote', `https://www.indeed.com/jobs?q=${p}&l=Remote&fromage=14`],
    ['LinkedIn — Kentucky', `https://www.linkedin.com/jobs/search/?keywords=${q}&location=Kentucky&f_E=1%2C2&f_TPR=r1209600`],
    ['LinkedIn — Remote', `https://www.linkedin.com/jobs/search/?keywords=${q}&location=United%20States&f_WT=2&f_E=1%2C2&f_TPR=r1209600`],
    ['Glassdoor — Kentucky', `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${q}&locKeyword=Kentucky&fromAge=14`],
    ['Glassdoor — Remote', `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${q}&remoteWorkType=1&fromAge=14`],
    ['ZipRecruiter — Kentucky', `https://www.ziprecruiter.com/jobs-search?search=${q}&location=Kentucky&days=14`],
    ['ZipRecruiter — Remote', `https://www.ziprecruiter.com/jobs-search?search=${q}&location=Remote+%28USA%29&days=14`],
    ['Dice — Kentucky', `https://www.dice.com/jobs?q=${q}&location=Kentucky&filters.postedDate=SEVEN`],
    ['Dice — Remote', `https://www.dice.com/jobs?q=${q}&filters.workplaceTypes=Remote&filters.postedDate=SEVEN`],
    ['Google Jobs', `https://www.google.com/search?q=${q}+jobs+kentucky+OR+remote&ibp=htl;jobs`],
    ['Built In — Remote entry-level', 'https://builtin.com/jobs/remote/dev-engineering/entry-level'],
    ['Wellfound (startups)', 'https://wellfound.com/role/r/software-engineer'],
    ['Handshake (EKU)', 'https://app.joinhandshake.com/stu/postings'],
    ['USAJobs — Kentucky', `https://www.usajobs.gov/search/results/?k=software&l=Kentucky`],
    ['Kentucky Career Center', 'https://kcc.ky.gov/'],
  ];
}

/** Stable id for a job across runs and boards: normalized company + title. */
export const jobKey = (j) => {
  const n = (s = '') => s.toLowerCase().replace(/\b(inc|llc|ltd|corp|corporation|co)\b\.?/g, '').replace(/[^a-z0-9]/g, '');
  return `${n(j.company)}|${n(j.title)}`;
};

/** Job category from the title, for the category tabs in the report. Order matters. */
export const CATEGORIES = ['Software Engineering', 'AI / ML', 'Data', 'DevOps & Cloud', 'QA & Testing', 'IT & Support', 'Other'];
export function jobCategory(title = '') {
  const t = title.toLowerCase();
  if (/data (engineer|analyst|integration|scien|platform)|analytics|\betl\b|\bdba\b|database admin/.test(t)) return 'Data';
  if (/machine learning|\bml engineer|research engineer|forward deployed/.test(t)) return 'AI / ML';
  if (/full.?stack|front.?end|back.?end|\bweb\b|software (engineer|developer|engineering)|applications? developer|programmer|developer|wordpress|laravel|angular|react|product engineer|mobile|flutter|electron/.test(t))
    return 'Software Engineering';
  if (/\bqa\b|test|sdet|quality/.test(t)) return 'QA & Testing';
  if (/devops|\bsre\b|site reliability|cloud|platform|infrastructure|deployment|performance engineer/.test(t)) return 'DevOps & Cloud';
  if (/support|help ?desk|technician|admin|network|\bit\b|cyber|security|linux|systems? engineer/.test(t)) return 'IT & Support';
  if (/\bai\b/.test(t)) return 'AI / ML';
  return 'Other';
}

export function toHTML(jobs, meta) {
  const data = JSON.stringify(
    jobs.map((j) => ({
      key: jobKey(j),
      cat: jobCategory(j.title),
      score: j.score, isNew: j.isNew, title: j.title, company: j.company, where: j.where, location: j.location,
      payText: j.payText, payAnnual: j.payAnnual, jobType: j.jobType, seniority: j.seniority, yearsRequired: j.yearsRequired,
      degree: j.degree, benefits: j.benefits, techAsked: j.techAsked, matchedSkills: j.matchedSkills, reasons: j.reasons,
      req: j.qualifications?.required || [], pref: j.qualifications?.preferred || [], flags: j.flags, postedAt: j.postedAt,
      ageDays: j.ageDays, sources: j.sources, alsoListedAs: j.alsoListedAs, url: j.url, industry: j.industry, applicants: j.applicants,
      snippet: (j.description || '').slice(0, 1200),
      workMode: j.workMode || 'unknown', workModeEvidence: j.workModeEvidence || '', ats: j.ats || '',
      trust: j.trust || 'ok', trustFlags: j.trustFlags || [], live: j.live || 'unknown',
    })),
  ).replace(/</g, '\\u003c');
  const links = manualLinks(meta.manualKeywords)
    .map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${n}</a>`)
    .join('');
  const sourceStats = Object.entries(meta.sourceCounts)
    .map(([k, v]) => `<span>${k}: <b>${v}</b></span>`)
    .join('');
  const mySkills = JSON.stringify(meta.mySkills);
  const appliedSeed = JSON.stringify(
    (meta.applied || []).map((a) => ({ ...a, key: a.key || jobKey(a) })),
  ).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Job Matches</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#1b1f24;--mute:#5f6b7a;--line:#e3e7ec;--accent:#2457d6;--good:#1b8a4a;--warn:#b26a00;--chip:#eef2f8;--new:#d6336c}
@media (prefers-color-scheme:dark){:root{--bg:#0f1216;--card:#171b21;--ink:#e6e9ee;--mute:#97a3b3;--line:#2a313a;--accent:#7aa2ff;--good:#4cc584;--warn:#e0a94a;--chip:#222832;--new:#ff6b9a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
header{padding:20px 16px 8px;max-width:1100px;margin:auto}h1{margin:0 0 4px;font-size:24px}.sub{color:var(--mute);font-size:13px}
.stats{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--mute);margin-top:6px}
.bar{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line)}
.controls{max-width:1100px;margin:auto;padding:10px 16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
input,select{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:7px 9px;font:inherit}
input[type=search]{flex:1;min-width:180px}label.ck{font-size:13px;display:flex;gap:4px;align-items:center;color:var(--mute)}
main{max-width:1100px;margin:auto;padding:12px 16px 40px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:10px 0}
.top{display:flex;gap:12px;align-items:flex-start}.score{min-width:46px;height:46px;border-radius:10px;display:grid;place-items:center;font-weight:700;color:#fff}
.t{flex:1;min-width:0}.title{font-weight:650;font-size:16px;color:var(--ink);text-decoration:none}.title:hover{color:var(--accent)}
.co{color:var(--mute);font-size:13.5px}.facts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.f{background:var(--chip);border-radius:6px;padding:2px 8px;font-size:12.5px}.f.pay{color:var(--good);font-weight:600}.f.warn{color:var(--warn)}
.new{background:var(--new);color:#fff;border-radius:5px;font-size:11px;padding:1px 6px;margin-left:6px;vertical-align:2px}
details{margin-top:8px}summary{cursor:pointer;color:var(--accent);font-size:13px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-top:8px;font-size:13.5px}@media(max-width:700px){.grid{grid-template-columns:1fr}}
h4{margin:10px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--mute)}ul{margin:0;padding-left:18px}
.chips span{display:inline-block;background:var(--chip);border-radius:5px;padding:1px 7px;margin:2px 3px 2px 0;font-size:12px}
.chips span.have{outline:1px solid var(--good);color:var(--good)}.snip{white-space:pre-wrap;font-size:12.5px;color:var(--mute);max-height:220px;overflow:auto;border-left:3px solid var(--line);padding-left:10px}
.links a{display:inline-block;margin:3px 10px 3px 0;font-size:13px;color:var(--accent)}.manual{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin:12px 0}
.empty{color:var(--mute);text-align:center;padding:40px}
.trust{border-radius:5px;font-size:11px;padding:1px 6px;margin-left:6px;vertical-align:2px;font-weight:600}
.trust.ok{background:#1b8a4a22;color:var(--good)}.trust.caution{background:#b26a0022;color:var(--warn)}.trust.risky{background:#c9252522;color:#c92525}
.card.risky{border-color:#c9252566}
.tabs{max-width:1100px;margin:auto;padding:8px 16px 0;display:flex;gap:4px}
.tab{background:none;border:0;border-bottom:3px solid transparent;color:var(--mute);font:600 14px system-ui,sans-serif;padding:8px 12px;cursor:pointer}
.tab.on{color:var(--ink);border-bottom-color:var(--accent)}
.applybtn{margin-left:auto;align-self:flex-start;background:var(--card);color:var(--good);border:1.5px solid var(--good);border-radius:8px;padding:6px 12px;font:600 13px system-ui,sans-serif;cursor:pointer;white-space:nowrap}
.applybtn:hover{background:var(--good);color:#fff}
.atable{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:14px}
.atable th,.atable td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
.atable th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--mute)}
.atable a{color:var(--accent)}.undo{background:none;border:1px solid var(--line);color:var(--mute);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px}
.atools{display:flex;gap:10px;align-items:center;margin:4px 0 12px}.atools button{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:13px}
@media(max-width:700px){.atable .hm{display:none}}
.agroup{margin:18px 0 8px;font-size:16px}.agroup .sub{font-weight:400}
select.status{padding:4px 6px;font-size:13px}
.appliedtag{margin-left:auto;align-self:flex-start;background:var(--chip);color:var(--mute);border-radius:8px;padding:6px 12px;font:600 13px system-ui,sans-serif;white-space:nowrap}
.cats{max-width:1100px;margin:auto;padding:8px 16px 0;display:flex;flex-wrap:wrap;gap:6px}
.cat{background:var(--card);border:1px solid var(--line);color:var(--mute);border-radius:999px;padding:5px 12px;font:600 13px system-ui,sans-serif;cursor:pointer}
.cat.on{background:var(--accent);border-color:var(--accent);color:#fff}.cat .n{font-weight:400;opacity:.8;margin-left:4px}
</style></head><body>
<header><h1>Job Matches — Kentucky &amp; Remote</h1>
<div class="sub">Generated ${meta.generated} · ${jobs.length} matches (${meta.newCount} new since last run) · ranked by fit with your resume</div>
<div class="stats">${sourceStats}</div></header>
<div class="bar"><div class="tabs"><button class="tab on" id="tabMatches">Matches</button><button class="tab" id="tabApplied">Applied</button></div><div class="cats" id="cats"></div><div class="controls" id="controls">
<input type="search" id="q" placeholder="Search title, company, skill…">
<select id="where"><option value="">KY + Remote</option><option value="Kentucky">Kentucky only</option><option value="Remote">Remote only</option></select>
<select id="src"><option value="">All sources</option></select>
<select id="sort"><option value="score">Best match</option><option value="new">Newest</option><option value="pay">Highest pay</option></select>
<label class="ck">Min score <input type="number" id="min" value="0" min="0" max="100" style="width:64px"></label>
<label class="ck"><input type="checkbox" id="onlyNew"> New only</label>
<label class="ck"><input type="checkbox" id="hasPay"> Pay listed</label>
<label class="ck"><input type="checkbox" id="hideRisky" checked> Hide risky</label>
<label class="ck"><input type="checkbox" id="onlyOk"> Verified only</label>
<label class="ck"><input type="checkbox" id="showApplied"> Show applied</label>
<span id="count" class="sub"></span></div></div>
<main>
<section id="appliedView" hidden>
<div class="atools"><span class="sub" id="acount"></span><button id="exportCsv">Download list (CSV)</button></div>
<div id="alist"></div>
</section>
<section id="matchesView">
<div class="manual"><b>Boards to check by hand</b> <span class="sub">(Indeed, Glassdoor, ZipRecruiter and Dice block automated access; these are pre-filtered searches)</span>
<div class="links">${links}</div></div>
<div id="list"></div></section></main>
<script>
const JOBS=${data};const MINE=new Set(${mySkills}.map(s=>s.toLowerCase()));
const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const srcs=[...new Set(JOBS.flatMap(j=>j.sources.map(s=>s.name)))].sort();srcs.forEach(s=>$('src').insertAdjacentHTML('beforeend','<option>'+esc(s)+'</option>'));
const color=s=>s>=70?'#1b8a4a':s>=50?'#2f7d9a':s>=35?'#b26a00':'#8a8f98';
const have=t=>{const l=t.toLowerCase();return MINE.has(l)||MINE.has(l.replace('.js',''))||(l==='postgresql'&&MINE.has('postgres'))||(l==='rest'&&MINE.has('rest api'))};
function card(j){
 const wm={remote:'Fully remote',hybrid:'Hybrid',onsite:'On-site',unknown:''}[j.workMode];
 const atsTip={Greenhouse:'Quick apply (Greenhouse, 1 page)',Lever:'Quick apply (Lever, 1 page)',Ashby:'Quick apply (Ashby, 1 page)',Workday:'Workday (needs account)',LinkedIn:'',iCIMS:'iCIMS (needs account)'}[j.ats]||'';
 const facts=[j.where,wm&&!j.where.includes(wm)&&!(wm==='Fully remote'&&j.where.includes('Remote'))?wm:'',atsTip,j.payText?'<span class="f pay">'+esc(j.payText)+'</span>':'<span class="f">Pay not listed</span>',j.jobType,j.seniority,
  j.yearsRequired!=null?j.yearsRequired+'+ yrs exp':'',j.degree,j.ageDays!=null?(j.ageDays===0?'Today':j.ageDays+'d ago'):'',j.applicants]
  .filter(Boolean).map(f=>f.startsWith('<span')?f:'<span class="f">'+esc(f)+'</span>').join('')+j.flags.map(f=>'<span class="f warn">'+esc(f)+'</span>').join('');
 const list=a=>a.length?'<ul>'+a.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'<span class="sub">Not found in posting</span>';
 const tl={ok:'✓ Looks legit',caution:'⚠ Check first',risky:'✕ Possible scam'}[j.trust];
 const tt=j.trustFlags.join(' • ')+(j.live==='open'?' • Link verified open':j.live==='unknown'?' • Could not verify link':'');
 return '<div class="card '+j.trust+'"><div class="top"><div class="score" style="background:'+color(j.score)+'">'+j.score+'</div><div class="t">'+
 '<a class="title" href="'+esc(j.url)+'" target="_blank" rel="noopener">'+esc(j.title)+'</a>'+(j.isNew?'<span class="new">NEW</span>':'')+'<span class="trust '+j.trust+'" title="'+esc(tt)+'">'+tl+'</span>'+
 '<div class="co">'+esc(j.company)+' · '+esc(j.location)+(j.industry?' · '+esc(j.industry):'')+'</div><div class="facts">'+facts+'</div></div>'+(appliedFor(j)?'<span class="appliedtag">Applied '+esc(appliedFor(j).date||'')+'</span>':'<button class="applybtn" data-key="'+esc(j.key)+'" title="Move to your Applied list">✓ Applied</button>')+'</div>'+
 '<details><summary>Details, requirements &amp; benefits</summary><div class="grid"><div>'+
 '<h4>Reliability check</h4>'+list(j.trustFlags.concat(j.live==='open'?['Posting link verified open']:j.live==='unknown'?['Couldn’t verify link (site blocks bots) — open it to confirm']:[]).concat(j.trustFlags.length?[]:['No scam warning signs found']))+
 (j.workModeEvidence?'<h4>Work arrangement</h4><div class="sub">'+esc(wm||'Unclear')+' — posting says: “'+esc(j.workModeEvidence)+'”</div>':'')+
 '<h4>Why it matched</h4>'+list(j.reasons)+'<h4>Benefits mentioned</h4><div class="chips">'+(j.benefits.length?j.benefits.map(b=>'<span>'+esc(b)+'</span>').join(''):'<span class="sub">None listed</span>')+'</div>'+
 '<h4>Tech they ask for <span style="text-transform:none">(green = on your resume)</span></h4><div class="chips">'+(j.techAsked.map(t=>'<span class="'+(have(t)?'have':'')+'">'+esc(t)+'</span>').join('')||'<span class="sub">—</span>')+'</div>'+
 '</div><div><h4>Requirements / qualifications</h4>'+list(j.req)+(j.pref.length?'<h4>Preferred</h4>'+list(j.pref):'')+'</div></div>'+
 (j.snippet?'<h4>Description excerpt</h4><div class="snip">'+esc(j.snippet)+'</div>':'')+
 (j.alsoListedAs&&j.alsoListedAs.length?'<h4>Also listed as (same job)</h4><ul>'+j.alsoListedAs.map(a=>'<li>'+esc(a)+'</li>').join('')+'</ul>':'')+
 '<h4>Apply / view</h4><div class="links">'+j.sources.map(s=>'<a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(s.name)+' ↗</a>').join('')+'</div></details></div>';}
// ---- Applied tracking (saved in this browser; seeded with applications recorded by the tool) ----
const SEED=${appliedSeed};const STORE='jobsearch.applied.v1';
// Status: 'waiting' | 'interviewing' | 'denied'. The newest statusDate wins between the tool's file
// (updated by the daily email check) and changes made in this browser.
function loadApplied(){let saved={};try{saved=JSON.parse(localStorage.getItem(STORE)||'{}')||{}}catch(e){}
 const m={};SEED.forEach(a=>m[a.key]={status:'waiting',statusDate:a.date,...a});
 Object.entries(saved).forEach(([k,v])=>{if(v===null){delete m[k];return}
  const s=m[k];if(s&&(s.statusDate||'')>(v.statusDate||'')){m[k]={...v,status:s.status,statusDate:s.statusDate,note:s.note}}else m[k]={status:'waiting',...s,...v}});return m}
function saveApplied(k,v){try{const s=JSON.parse(localStorage.getItem(STORE)||'{}')||{};s[k]=v;localStorage.setItem(STORE,JSON.stringify(s))}catch(e){}}
let APPLIED=loadApplied();
// A board job counts as applied if its key, its link, or its company + title match an application
// (titles get reworded between boards, e.g. "Software Engineer I – C#/.NET | Hybrid" vs "(Hybrid, Paducah)").
const nrm=s=>String(s||'').toLowerCase().replace(/\\b(inc|llc|ltd|corp|corporation|co)\\b\\.?/g,'').replace(/[^a-z0-9]/g,'');
const nurl=u=>{u=String(u||'').toLowerCase().split(/[?#]/)[0].replace(/\\/+$/,'');const li=u.match(/linkedin\\.com\\/jobs\\/view\\/(\\d+)/);return li?'li'+li[1]:u};
const TSTOP=new Set(['remote','hybrid','onsite','full','time','us','usa','and','the','of','ky','contract','eligible']);
const twords=t=>new Set(String(t||'').toLowerCase().replace(/\\b1\\b/g,'i').replace(/\\bjr\\b/g,'junior').split(/[^a-z0-9#+]+/).filter(w=>w&&!TSTOP.has(w)));
function appliedFor(j){if(APPLIED[j.key])return APPLIED[j.key];const u=nurl(j.url);const jw=twords(j.title);
 return Object.values(APPLIED).find(a=>(a.url&&nurl(a.url)===u)||(nrm(a.company)&&nrm(a.company)===nrm(j.company)&&(()=>{const aw=twords(a.title);const [s,l]=aw.size<jw.size?[aw,jw]:[jw,aw];return s.size>=2&&[...s].every(w=>l.has(w))})()))}
const today=()=>new Date().toISOString().slice(0,10);
function markApplied(key){const j=JOBS.find(x=>x.key===key);if(!j)return;
 const v={key,title:j.title,company:j.company,where:j.where,payText:j.payText,url:j.url,date:today(),status:'waiting',statusDate:today()};APPLIED[key]=v;saveApplied(key,v);render();renderApplied()}
function undoApplied(key){delete APPLIED[key];saveApplied(key,null);render();renderApplied()}
function setStatus(key,status){const a=APPLIED[key];if(!a)return;a.status=status;a.statusDate=new Date().toISOString();saveApplied(key,a);renderApplied()}
const GROUPS=[['interviewing','🟢 Interviewing','In the interview process'],['waiting','⏳ Waiting to hear back','No response yet'],['denied','🔴 Denied','Not moving forward']];
function renderApplied(){const all=Object.values(APPLIED);
 $('tabApplied').textContent='Applied ('+all.length+')';
 const cnt=s=>all.filter(a=>(a.status||'waiting')===s).length;
 $('acount').textContent=all.length+' application'+(all.length===1?'':'s')+' · '+cnt('interviewing')+' interviewing · '+cnt('waiting')+' waiting · '+cnt('denied')+' denied';
 if(!all.length){$('alist').innerHTML='<div class="empty">No applications yet. Click “✓ Applied” on a job to move it here.</div>';return}
 const sel=a=>'<select class="status" data-status="'+esc(a.key)+'">'+GROUPS.map(([v,l])=>'<option value="'+v+'"'+((a.status||'waiting')===v?' selected':'')+'>'+l.replace(/^\\S+ /,'')+'</option>').join('')+'</select>';
 $('alist').innerHTML=GROUPS.map(([s,label,sub])=>{const rows=all.filter(a=>(a.status||'waiting')===s).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  return '<h3 class="agroup '+s+'">'+label+' <span class="sub">('+rows.length+') · '+sub+'</span></h3>'+(rows.length?'<table class="atable"><thead><tr><th>Applied</th><th>Job</th><th class="hm">Where</th><th class="hm">Pay</th><th>Status</th><th></th></tr></thead><tbody>'+
  rows.map(a=>'<tr><td>'+esc(a.date||'')+'</td><td><a href="'+esc(a.url||'#')+'" target="_blank" rel="noopener"><b>'+esc(a.title)+'</b></a><div class="sub">'+esc(a.company)+(a.note?' · '+esc(a.note):'')+'</div></td><td class="hm">'+esc(a.where||'')+'</td><td class="hm">'+esc(a.payText||'')+'</td><td>'+sel(a)+'</td><td><button class="undo" data-undo="'+esc(a.key)+'" title="Remove from Applied">Undo</button></td></tr>').join('')+
  '</tbody></table>':'<div class="sub" style="padding:6px 2px 14px">None</div>')}).join('')}
function showTab(t){const ap=t==='applied';$('appliedView').hidden=!ap;$('matchesView').hidden=ap;$('controls').style.display=ap?'none':'';$('cats').style.display=ap?'none':'';
 $('tabApplied').classList.toggle('on',ap);$('tabMatches').classList.toggle('on',!ap);try{localStorage.setItem('jobsearch.tab',t)}catch(e){}}
$('tabMatches').onclick=()=>showTab('matches');$('tabApplied').onclick=()=>showTab('applied');
document.addEventListener('click',e=>{const b=e.target.closest('[data-key]');if(b&&b.classList.contains('applybtn'))markApplied(b.dataset.key);
 const u=e.target.closest('[data-undo]');if(u)undoApplied(u.dataset.undo)});
document.addEventListener('change',e=>{const s=e.target.closest('[data-status]');if(s)setStatus(s.dataset.status,s.value)});
$('exportCsv').onclick=()=>{const rows=Object.values(APPLIED);const c=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const csv='Date,Title,Company,Status,Where,Pay,URL\\r\\n'+rows.map(a=>[a.date,a.title,a.company,a.status||'waiting',a.where,a.payText,a.url].map(c).join(',')).join('\\r\\n');
 const l=document.createElement('a');l.href=URL.createObjectURL(new Blob(['\\uFEFF'+csv],{type:'text/csv'}));l.download='applied-jobs.csv';l.click()};

// ---- Category tabs (Software Engineering by default; remembered in this browser) ----
const CATS=${JSON.stringify(CATEGORIES)};let CAT='Software Engineering';try{CAT=localStorage.getItem('jobsearch.cat')||CAT}catch(e){}
if(CAT!=='All'&&!CATS.includes(CAT))CAT='Software Engineering';
function renderCats(){const open=JOBS.filter(j=>$('showApplied').checked||!appliedFor(j));const n=c=>open.filter(j=>c==='All'||j.cat===c).length;
 $('cats').innerHTML=['All'].concat(CATS).filter(c=>c==='All'||c===CAT||n(c)).map(c=>'<button class="cat'+(c===CAT?' on':'')+'" data-cat="'+esc(c)+'">'+esc(c)+'<span class="n">'+n(c)+'</span></button>').join('')}
$('cats').addEventListener('click',e=>{const b=e.target.closest('[data-cat]');if(!b)return;CAT=b.dataset.cat;try{localStorage.setItem('jobsearch.cat',CAT)}catch(e){}render()});
function render(){const q=$('q').value.toLowerCase(),w=$('where').value,s=$('src').value,min=+$('min').value||0;
 $('tabMatches').textContent='Matches ('+JOBS.filter(j=>!appliedFor(j)).length+')';renderCats();
 let r=JOBS.filter(j=>($('showApplied').checked||!appliedFor(j))&&(CAT==='All'||j.cat===CAT)&&j.score>=min&&(!w||j.where.includes(w))&&(!s||j.sources.some(x=>x.name===s))&&(!$('onlyNew').checked||j.isNew)&&(!$('hasPay').checked||j.payText)&&(!$('hideRisky').checked||j.trust!=='risky')&&(!$('onlyOk').checked||j.trust==='ok')&&
  (!q||(j.title+' '+j.company+' '+j.techAsked.join(' ')+' '+j.location+' '+j.snippet).toLowerCase().includes(q)));
 const so=$('sort').value;r.sort(so==='new'?(a,b)=>(b.postedAt||'').localeCompare(a.postedAt||''):so==='pay'?(a,b)=>b.payAnnual-a.payAnnual:(a,b)=>b.score-a.score);
 $('count').textContent=r.length+' shown';$('list').innerHTML=r.map(card).join('')||'<div class="empty">No jobs match these filters.</div>';}
['q','where','src','sort','min','onlyNew','hasPay','hideRisky','onlyOk','showApplied'].forEach(id=>$(id).addEventListener('input',render));render();renderApplied();
try{if(localStorage.getItem('jobsearch.tab')==='applied')showTab('applied')}catch(e){}
</script></body></html>`;
}
