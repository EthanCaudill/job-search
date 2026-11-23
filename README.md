# Job Search Automation

> Built with Claude Code. I made the product and design calls (what counts as a good match, how to
> spot a fake "remote" job, what the dashboard should show); AI wrote most of the code under review.

Finds **Kentucky** and **remote (US)** software jobs, ranks them against my resume, and builds a
filterable HTML report with pay, job type, seniority, years of experience asked, degree,
benefits, requirements/qualifications, and the tech stack each posting asks for.

## Run it

```powershell
cd C:\Users\Ethan\job-search
node search.js --open      # full run (~30–45 min with the wide search), opens the report
node search.js --quick     # fewer queries, ~1 min, for testing
```

Output:
- `reports/latest.html`: the dashboard (search, filter KY/Remote, sort by match/newest/pay, "new only")
- `reports/jobs-YYYY-MM-DD.csv`: the same data for Excel/Sheets
- `data/latest.json`: raw results
- `data/seen.json`: remembers postings already seen, so later runs mark fresh ones **NEW**

## Sources

| Source | What | How |
|---|---|---|
| LinkedIn | KY + US-remote, entry/associate level, last N days | public logged-out job pages, rate-limited |
| Himalayas | remote, US | public API |
| Remotive | remote software-dev | public API |
| RemoteOK | remote | public API |
| Jobicy | remote, USA | public API |
| We Work Remotely | remote programming | RSS |
| HN "Who is hiring?" | this month's thread, remote/KY | Algolia HN API |
| SimplifyJobs New Grad | curated new-grad roles | GitHub JSON |

**Indeed, Glassdoor, ZipRecruiter, Dice** block automated access, so the report has one-click
pre-filtered searches for them (plus Google Jobs, Built In, Wellfound, Handshake, USAJobs and the
Kentucky Career Center) at the top.

## Tuning: `config.json`

- `maxAgeDays`: how far back to look (default 21)
- `minScore`: hide weak matches (0–100)
- `maxYearsRequired`: drop postings asking for more years than this
- `includeInternships`: `false` by default (graduating Dec 2026)
- `linkedin.queries`: search terms; `experienceLevels` `1,2,3` = internship, entry, associate
- `titleInclude` / `titleExclude`: regexes on the job title (excludes senior/staff/lead/manager…)
- `resumeSkills`: skill → weight; drives the match score. Update when the resume changes.
- `kentucky.cities`: reference list of KY cities

## Applied tab

Click **✓ Applied** on a job to move it to the **Applied** tab. Applications are grouped into
🟢 **Interviewing**, ⏳ **Waiting to hear back** and 🔴 **Denied**. Change a status with the dropdown on
each row. The daily email check also updates `data/applied.json` automatically when an interview
invite, coding test, offer or rejection arrives, and rebuilds the report. Rebuild by hand with
`node build-report.js --open`.

## Strictly remote rule

Outside Kentucky, a job must be **fully remote**. The tool reads each description for the real
arrangement (it doesn't trust board labels, since LinkedIn's "remote" filter lets on-site jobs through):

- **Dropped:** "hybrid", "3 days a week in office", "in-office/on-site role", "must relocate",
  "(Hybrid)" in the title/location, "not remote"
- **Kept:** "fully/100% remote", "remote-first", "remote within the US", "work from home", or
  postings from remote-only boards (Remotive, RemoteOK, Himalayas, Jobicy, We Work Remotely)
- LinkedIn jobs tied to a city that never say they're remote are dropped.
- Kentucky jobs may be hybrid or on-site; the report labels them "Kentucky (hybrid)" etc.
- Each card shows the exact phrase that decided the arrangement, under "Work arrangement".

## Scam / reliability check

Every run screens each posting and shows a badge: **✓ Looks legit**, **⚠ Check first**, or
**✕ Possible scam**. Risky ones are hidden by default ("Hide risky" toggle). Postings whose links
are dead or "no longer accepting applications" are removed automatically.

- **Risky:** contact via Telegram/WhatsApp, equipment-purchase/check-deposit scams, upfront fees,
  crypto/gift-card pay, reshipping, asking for SSN/bank info, train-and-place repayment programs,
  word-for-word text reused by a different company, or watchlist entries starting with `!`
- **Caution:** free-email recruiters, "no experience needed", urgency pressure, AI-training gig
  work, talent-pool/future postings, unnamed companies, Google-Form applications, watchlist entries
- **Info only:** staffing agencies (real jobs through a middleman), thin descriptions
- Anti-scam disclaimers ("we will never contact you on WhatsApp") are recognized and not flagged.
- Add companies to `watchlist` in `config.json` (regex → reason; prefix the reason with `!` to mark it risky).
- `node recheck.js --open` re-screens the last results without searching again.

No automated check is perfect. Before giving anyone personal info, confirm the job is also on the
company's own careers page and that recruiter emails come from the company's domain.

## How scoring works (0–100)

- up to 45 pts for resume skills found in the posting (Laravel, Angular, TypeScript, PHP weigh most)
- up to 25 pts for title fit (software/full-stack/web developer; your stack named in the title)
- +20 for an entry/junior/new-grad/associate title (only +5 if it still asks for 3+ years); −10 for "Mid-Senior"
- required years graded separately: ≤1 yr +8, 2 yrs 0, 3 yrs −15, 4+ yrs −25 ("preferred" years count much less)
- +5 for Kentucky; −10 for remote roles that seem limited to specific other states

## Agent workflow (Claude Code + MCP)

The search itself is plain, deterministic Node.js: the same listing always gets the same score.
On top of it, Claude Code runs a few scheduled and on-demand jobs:

- **Daily search:** runs `search.js` and `build-report.js`, then summarizes the new matches.
- **Inbox check (Gmail via MCP, read-only):** reads replies from employers and updates
  `data/applied.json` (interviewing / waiting / denied).
- **Application helper (Chrome via MCP):** fills out application forms from a private profile file
  of approved answers. See `APPLYING.md`.

Guardrails are hard rules, not suggestions: email access is read-only, the agent **never clicks
Submit**, it only enters answers that exist in the profile, and it leaves consent and
self-identification questions to the person applying.

## Privacy

Personal files (the application profile, cover letters, search results and reports) are listed in
`.gitignore` and are not part of this repo.
