# How Claude fills applications (playbook)

Rules: **never click Submit**. Use only `application-profile.json`; anything `null` stays blank
and goes on the "needs Ethan" list. Stop at the Review page and report.

## Setup (once per session)
1. **Use Claude in Chrome**, not the built-in browser. It can upload the resume PDF and uses
   Ethan's existing sign-ins (LinkedIn, Google) and password manager.
2. Optional: **Simplify Copilot** extension (free) fills Workday/Greenhouse/Lever/iCIMS from a
   profile in one click. If installed, run it first, then Claude only fixes gaps.

## Order of attack per job
1. Before opening the form, read the posting and confirm it's really KY or remote (LinkedIn's
   remote filter is unreliable). Skip if onsite/hybrid outside KY.
2. Prefer the company's own ATS link over LinkedIn.
3. Read the whole form at once (one `read_page`/JS dump of every input with its label), plan all
   answers, then fill everything in **one batch**. Screenshot once at the end to verify, not after
   every field.

## Workday (myworkdayjobs.com)
- Choose **Autofill with Resume** and upload the PDF; it pre-fills contact, work and education.
  Then only *verify and fix*: Workday's parser often garbles dates, titles and degree names.
- Needs an account per company → Ethan creates it (password).
- Dropdowns: click the button, then pick the option by its exact text. Pick the **most specific
  match** from the profile's preference list (e.g. "Bachelor of Computer Science" over
  "Bachelor of Science (BS)"). Changing Degree clears Field of Study, so set Degree first.
- Dates: click the **month segment** and type `MMYYYY` in one go (e.g. `052026`); don't type into
  the year box separately.
- Field of Study is a search prompt: type, press Enter, pick the closest option.
- Steps: My Information → My Experience → Application Questions → Voluntary Disclosures →
  Self Identify → Review. Fill 1–3; leave disclosure/self-ID for Ethan.

## Greenhouse / Lever / Ashby (boards.greenhouse.io, jobs.lever.co, jobs.ashbyhq.com)
- Single page, no account. Upload the resume, fill the text fields in one batch, answer
  dropdowns, leave EEO/demographic questions for Ethan. These are much faster than Workday,
  so do them first.

## LinkedIn Easy Apply
- Works in Ethan's Chrome (already signed in). Multi-step modal; same rules, and stop at
  "Review your application".
