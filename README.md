# UX Career Command Center — Foundation

Phase 1 scaffold: a personal AI-powered CRM for UX/product design job searching. This build ships the app shell only — auth, protected routes, dashboard layout, sidebar nav, and deployment config. No job-tracking functionality yet (that's Phase 2).

## Stack
Next.js 14 (App Router) · TypeScript · Tailwind CSS · ShadCN-style UI primitives · Supabase Auth (`@supabase/ssr`) · Vercel-ready

## What's included
- **Auth**: email/password sign up & sign in via Supabase, server actions in `app/actions/auth.ts`, email-confirmation callback at `app/auth/callback/route.ts`
- **Protected routes**: `middleware.ts` refreshes the Supabase session and redirects unauthenticated users away from `/dashboard`; the `(dashboard)` layout re-checks server-side as a second gate
- **Dashboard shell**: dark "console" sidebar (desktop) + slide-in drawer (mobile), topbar with theme toggle and account menu, placeholder metric cards
- **Dark mode**: `next-themes`, system-aware, toggle in the topbar
- **Design tokens**: CSS variables in `app/globals.css` / `tailwind.config.ts` — a cool paper background, deep signal-blue primary, and a dark-ink sidebar that stays constant across light/dark mode, so navigation always reads as "the console"
- **Supabase clients**: browser (`lib/supabase/client.ts`), server (`lib/supabase/server.ts`), and middleware (`lib/supabase/middleware.ts`) variants, split per Supabase's SSR guidance

## Setup

```bash
npm install
cp .env.local.example .env.local
```

Fill in `.env.local` from your Supabase project's **Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

In the Supabase dashboard, under **Authentication → URL Configuration**, add:
- Site URL: `http://localhost:3000` (and your Vercel URL once deployed)
- Redirect URL: `http://localhost:3000/auth/callback` (and the Vercel equivalent)

Then run:

```bash
npm run dev
```

Visit `http://localhost:3000` — it redirects to `/login`. Sign up, confirm the email Supabase sends, sign in, and you'll land on `/dashboard`.

## Deploying to Vercel
1. Push this repo to GitHub.
2. Import it in Vercel.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as Environment Variables (Production + Preview).
4. Add your Vercel domain to Supabase's Site URL / Redirect URLs as above.
5. Deploy — no other config needed, `next.config.mjs` is left at defaults.

## Project structure
```
app/
  (auth)/login, (auth)/signup      — public auth pages
  (dashboard)/dashboard            — protected dashboard home
  auth/callback                    — Supabase email-confirm callback
  actions/auth.ts                  — signIn / signUp / signOut server actions
components/
  ui/                              — button, input, card, sheet, dropdown-menu, etc.
  sidebar.tsx, mobile-sidebar.tsx  — desktop rail + mobile drawer
  topbar.tsx, theme-toggle.tsx     — dashboard chrome
lib/
  supabase/                        — client / server / middleware Supabase helpers
  nav-links.tsx                    — sidebar nav config (Jobs/Resumes are disabled placeholders for Phase 2)
```

## Next steps (Phase 2)
- Job Database: Supabase tables + server actions for applications
- Wire up the disabled "Job Pipeline" / "Resume Library" nav items
- Gemini-backed AI prompts, stored separately per the architecture rules
