# UX Career Command Center

A personal AI-powered CRM for UX/Product Design job searching — centralizes job discovery, tailored applications,
detailed pipeline tracking, interview prep, recruiter/contract relationships, and offer negotiation so you spend
less time re-processing the same information.

## Stack

Next.js 14 (App Router) · TypeScript · React 18 · Tailwind CSS · shadcn/ui (Radix primitives) · NextAuth v5 beta
(Credentials) · Neon Serverless Postgres · Drizzle ORM · Gemini (`@google/genai`) · Vercel (hosting + Cron)

## Features

- **Auth** — email/password via NextAuth v5, protected `/dashboard` routes, user-scoped data throughout.
- **Job discovery** — save search criteria (titles/keywords, location, employment type) and the app resolves
  matching company boards across Greenhouse, Lever, Ashby, and SmartRecruiters, then polls them on a schedule.
  You can also watch a specific company's board directly. See **Job discovery** below for how this actually works
  and its real limitations.
- **Duplicate detection** — exact (same source + source job ID) and likely (same company + title) duplicate
  matching; nothing is ever silently deleted, you resolve flagged repeats from the Discovery page.
- **AI job analysis** — Gemini extracts summary, seniority, employment type, salary range, responsibilities,
  required/nice-to-have skills, and ATS keywords from a posting. Re-analyzable; history kept.
- **Resume Library** — store resume text; Gemini extracts skills, experience summary, and job titles held.
- **Match scoring** — 0–100 fit score between a resume and a job, with strengths/gaps/recommendations and
  presentation-layer tiers (A >=85, B >=70, C >=55, D <55).
- **Detailed pipeline** — Discovered -> Interested -> Applying -> Applied -> Recruiter Screen -> Hiring Manager
  Interview -> Portfolio Review -> Panel Interview -> Final Round -> Offer / Rejected / Withdrawn. Pre-pipeline
  data (`saved`, `interviewing`, `archived`) is preserved and shown as legacy buckets — see `lib/pipeline.ts`.
- **AI Application Assistant** — for a (job, resume) pair: keyword-gap analysis, tailoring recommendations,
  which real experience to foreground, application strategy notes, a cover-letter draft, and a recruiter outreach
  message. Never invents experience; regenerating keeps prior drafts in history.
- **Offer / Negotiation / Onboarding Center** — once a job reaches Offer: an evaluation checklist, a negotiation
  guide, questions to ask before accepting, negotiation talking points, and a 30-60-90 onboarding plan. Works only
  from compensation details you enter yourself — never fabricates market-rate numbers.
- **Interview Prep Center** — company-research guidance, role-specific questions, STAR-story suggestions grounded
  in your resume, portfolio recommendations, and recruiter/hiring-manager/portfolio-presentation prep.
- **Recruiter / Contract CRM** — agencies, contacts, a status pipeline, contact history, follow-ups, and contract
  opportunities.
- **Dashboard & weekly report** — pipeline stats, activity, conversion/rejection signals, top matches, recruiter
  activity, and a Gemini-generated weekly summary + recommendations (also runnable on a schedule).

## Job discovery — how it actually works (read this before configuring it)

**None of Greenhouse, Lever, Ashby, or SmartRecruiters expose a public "search every posting on our platform"
endpoint.** Each only returns postings for a specific company's board once you already know that board's
token/slug (`lib/ats/*.ts`). Workday has no stable, officially-documented public API at all — see
`lib/ats/workday.ts`.

So "search-driven discovery" here is two steps, not one:

1. **Resolve candidate boards** (`lib/discovery/board-resolver.ts`) — a saved search's keywords/location are used
   to run a site-scoped web search (`site:boards.greenhouse.io <keywords>`, etc.) via a configurable web-search
   provider, and any ATS-hosted board URLs in the results are added to your watched boards automatically. This
   requires `GOOGLE_SEARCH_API_KEY` / `GOOGLE_SEARCH_ENGINE_ID` (a Google Programmable Search Engine — see
   `.env.local.example`). **Without it configured, saved searches can still be created but board resolution will
   report a clear error instead of silently finding nothing.**
2. **Poll known boards** (`app/actions/ats.ts`, `runDiscoveryForSource`) — every watched board (resolved
   automatically or added by hand) is fetched, filtered to design roles (plus the saved search's own
   keywords/location if it came from one), deduplicated, persisted, and analyzed with Gemini. This step needs no
   extra API key.

This is a **best-effort discovery mechanism, not a guarantee of completeness** — a company's board won't surface
if it isn't indexed by the search provider, or if its careers page doesn't link the ATS-hosted board URL directly.
The fallback, always available with no extra configuration: watch a specific board by its token directly, or paste
a posting under "Add job" (works for Workday employers too, since that ATS can't be polled automatically).

## Setup

```bash
npm install
cp .env.local.example .env.local
```

Fill in `.env.local`:

- `DATABASE_URL` — pooled connection string from your Neon project.
- `AUTH_SECRET` — `npx auth secret`.
- `NEXT_PUBLIC_SITE_URL` — `http://localhost:3000` locally, your deployed URL in production.
- `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`) — from https://aistudio.google.com/apikey.
- `CRON_SECRET` — any random string; also set on Vercel (see **Scheduled jobs** below).
- `GOOGLE_SEARCH_API_KEY` / `GOOGLE_SEARCH_ENGINE_ID` — optional, only needed for search-driven job discovery (see
  above). Everything else works without it.

Apply the schema (additive-only — see `lib/db/migrations/0001_pipeline_and_ats.sql` for the exact SQL if you'd
rather review it than push):

```bash
npm run db:push
```

Then:

```bash
npm run dev
```

## Scheduled jobs (Vercel Cron)

Configured in `vercel.json`, all protected by `CRON_SECRET` (Vercel automatically sends it as
`Authorization: Bearer $CRON_SECRET` once that env var is set — no extra config needed beyond setting the var):

| Route | Schedule | What it does |
|---|---|---|
| `/api/cron/discovery-resolve` | daily, 12:00 UTC | Re-resolves every enabled saved search into watched boards |
| `/api/cron/ats-refresh` | daily, 13:00 UTC | Polls every watched board for new postings |
| `/api/cron/weekly-report` | Mondays, 14:00 UTC | Generates each user's weekly report (skips if one already exists for the week) |

All three are idempotent — safe to trigger manually or re-run without creating duplicates.

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Add the env vars above (Production + Preview) — including `CRON_SECRET` so scheduled jobs authenticate.
4. Deploy. `vercel.json` registers the Cron schedules automatically.

## Project structure

```
app/
  (auth)/login, (auth)/signup            — public auth pages
  (dashboard)/dashboard                  — pipeline stats + weekly report
  (dashboard)/discovery                  — saved searches, watched boards, duplicate review queue
  (dashboard)/jobs, jobs/[id]            — pipeline list/detail, stage select, re-analyze, match scoring
  (dashboard)/jobs/[id]/interview-prep   — Interview Prep Center
  (dashboard)/jobs/[id]/application-package — AI Application Assistant
  (dashboard)/jobs/[id]/offer            — Offer / Negotiation / Onboarding Center
  (dashboard)/resumes, recruiters, contracts
  actions/                               — server actions (one file per feature area)
  api/auth/[...nextauth]                 — NextAuth route
  api/cron/*                             — scheduled job routes (see above)
lib/
  ai/                                    — gemini.ts (client), prompts.ts, schemas.ts (zod)
  ats/                                   — per-provider source adapters + normalization + dedupe
  discovery/                             — web-search provider + board resolver + search-criteria matching
  auth/require-user.ts, db/              — auth helper, Drizzle client + schema + migrations
  pipeline.ts                            — pipeline stage order/labels, match-score tiers
```

## Known limitations

- **ATS discovery is best-effort**, not exhaustive — see "Job discovery" above.
- The Greenhouse/Lever/Ashby/SmartRecruiters adapters are written against each provider's documented public API
  shape but haven't been exercised against a live board in every environment — verify with one real board token
  after your first deploy.
- SmartRecruiters' list endpoint doesn't include full posting text, so the adapter does a second per-posting fetch
  for anything that already looks like a design role — fine at personal-search scale, not built for high volume.
- Interview prep's "company research" is general AI guidance, not live company news — Gemini's structured-output
  mode isn't combined with search grounding here, so nothing is ever labeled as current/recent research it didn't
  actually perform.
