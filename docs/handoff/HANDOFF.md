# InterviewHub AI — Project Handoff & Testing Guide

| | |
|---|---|
| **Repository** | `coderashhar/RecruitEasy` (npm workspace name `interviewhub-ai`) |
| **Branch documented** | `claude/interviewhub-ui-redesign-e38220` (PR #19, "Broadsheet" UI redesign) on top of `main` @ `f05ddc9` |
| **Documented on** | 16 September 2026 |
| **Verified against** | The source code on that branch, plus a local run (web on `:3000`, realtime on `:4000`) against the team's dev Neon database |
| **Audience** | Developers, QA testers and reviewers who have never seen the project |

> **How to use this document.** Sections 1–2 get you running. Sections 3–4 explain every screen. Sections 5–10 are the test plan: execute the tables top to bottom and fill in *Actual Result*, *Status* and *Tester Notes*. Report problems with the template in section 11, and sign off with the checklist in section 12.

**Status legend used throughout:** ✅ Working / implemented · ⚠️ Partially implemented or needs verification · ❌ Not implemented or broken

---

## 1. Project Status

### 1.1 What the project does

InterviewHub AI puts a whole technical interview into one browser tab:

- **Video call:** LiveKit.
- **Shared code editor:** Monaco + Yjs, with a sandboxed **Run** button backed by Judge0.
- **In-room chat.**
- **Advisory integrity signals:** tab switches, pastes and leaving full screen.

The hiring workflow sits around the interview. Candidates apply with a résumé, which gets an **ATS score**. Recruiters manage a **pipeline**, **schedule** interviews, **compare** candidates, collect **structured feedback** and read **analytics**. Admins read an **audit log** and process **GDPR data-deletion requests**.

**Main use case:** a small hiring team runs a coding interview end-to-end without juggling Zoom, CoderPad, a résumé scanner and a spreadsheet. The full product scope is in [`PRD.md`](../../PRD.md).

### 1.2 Current implementation status

The core product is **feature-complete for an MVP**. The PRD's Phase 1–5 work is merged into `main`: pipeline, scheduling, room, execution, ATS, notifications, recording, analytics, admin compliance.

The branch documented here adds a full UI redesign plus seven new index pages. The web app type-checks, lints, passes **312 unit tests** (plus 13 in the realtime service) and builds for production.

Several features depend on **optional external services**. Without them, the app degrades rather than crashing:

| Service | Without it |
|---|---|
| LiveKit | No video and no recording |
| Judge0 | Run reports "execution service unavailable" |
| Cloudflare R2 | Résumés aren't stored, so downloads 404 |
| Resend | No emails; in-app notifications still work |
| Gemini | Falls back to keyword-heuristic ATS scoring; résumé polish is unavailable |
| Google Calendar | The Calendar settings page says syncing isn't set up; invites still go out as `.ics` email attachments |

### 1.3 Technologies

| Layer | Technology (version from `package.json`) |
|---|---|
| Monorepo | Turborepo 2.5, npm workspaces (`npm@10.9.3`), Node ≥ 20 (tested on Node 22.20) |
| Web app | Next.js **16.3.3** App Router, React **19.2.8**, TypeScript 5.7 |
| UI | Tailwind CSS 4.3, shadcn (`base-nova` style on Base UI 1.7), `lucide-react`, `next-themes`, `sonner` toasts, Geist / Geist Mono fonts |
| Auth | Clerk (`@clerk/nextjs` 7.8) — sign-in, sign-up, sessions; role stored in Clerk `publicMetadata.role` |
| Database | PostgreSQL (Neon serverless) via Prisma **6.5** (`packages/db`) |
| Shared contracts | Zod 4 schemas (`packages/types`) |
| Realtime service | Node + Socket.io 4.8 + Yjs 13.6 (`apps/realtime`), run with `tsx` |
| Code editor | Monaco (`monaco-editor` 0.56, `@monaco-editor/react`), `y-monaco` binding |
| Code execution | Judge0 (self-hosted Docker stack in `infra/judge0`) |
| Video / recording | LiveKit Cloud (`livekit-client`, `@livekit/components-react`, `livekit-server-sdk` Egress) |
| File storage | Cloudflare R2 through the AWS S3 SDK (`@aws-sdk/client-s3`) |
| Email | Resend (+ `.ics` calendar attachments built in-house) |
| AI | Google Gemini `gemini-2.0-flash` (`@google/generative-ai`) for ATS scoring and résumé polish |
| Résumé parsing | `pdf-parse` (PDF), `mammoth` (DOCX) |
| Tests | Vitest 4 (web + realtime; realtime has a real Postgres integration test) |
| Deploy targets | Web → Vercel (`apps/web/vercel.json`); realtime + Judge0 + Caddy → one VPS (`infra/caddy`) |

### 1.4 Architecture overview

```mermaid
flowchart LR
  B[Browser] -- HTTPS pages + Server Actions --> W[apps/web<br/>Next.js :3000]
  B -- Socket.io + JWT --> R[apps/realtime<br/>Socket.io + Yjs :4000]
  B -- WebRTC --> L[(LiveKit Cloud)]
  W -- Prisma --> DB[(Neon Postgres)]
  R -- Prisma --> DB
  W -- POST /internal/broadcast --> R
  W -- REST + token --> J[Judge0 :2358]
  W -- S3 API --> S[(Cloudflare R2)]
  W -- API --> C[(Clerk)]
  W -- API --> E[(Resend)]
  W -- API --> G[(Gemini)]
  L -- webhook --> W
  X[cron container / curl] -- Bearer CRON_SECRET --> W
```

- **`apps/web`** renders every page and runs all business logic in **Server Actions** and a few **Route Handlers**. `middleware.ts` does the first role check. Every page and action re-checks the role and scopes its queries to the caller's organisation.
- **`apps/realtime`** holds one in-memory Yjs document per interview room. It relays editor updates, presence and awareness (cursors), and persists chat and integrity signals. It snapshots the editor to `code_documents` 10 s after the last edit. It verifies a short-lived HS256 JWT minted by the web app with the shared `REALTIME_JWT_SECRET`.
- **`packages/db`** holds the Prisma schema, 12 migrations and the seed script. **`packages/types`** holds the Zod schemas shared across the process boundary.
- **Tenancy:** every user currently lands in one organisation, slug `default`. The schema carries `orgId` everywhere, so real multi-tenancy is a later data migration.

### 1.5 Major modules

| Module | Where in code |
|---|---|
| Auth, onboarding and roles | `middleware.ts`, `lib/auth.ts`, `lib/users.ts`, `lib/provisioning.ts`, `app/onboarding`, `scripts/set-role.ts` |
| Jobs and applying | `app/jobs`, `lib/apply.ts`, `lib/resume-parser.ts`, `lib/storage.ts` |
| ATS scoring and résumé polish | `lib/ats-scoring.ts`, `lib/resume-polish.ts`, `app/candidate/applications/[id]/ats` |
| Pipeline, shortlist and compare | `app/recruiter/page.tsx`, `components/pipeline/*`, `lib/applications.ts`, `lib/candidate-profile.ts`, `app/recruiter/compare` |
| Scheduling and lifecycle | `components/schedule/schedule-flow.tsx`, `lib/scheduling.ts`, `lib/availability.ts`, `lib/interview-lifecycle.ts` |
| Notices, reminders and email | `lib/interview-notices.ts`, `lib/email*.ts`, `lib/ics.ts`, `lib/notifications.ts`, `app/api/cron/reminders` |
| Interview room | `app/interview/[id]`, `components/interview/*`, `apps/realtime/src/*` |
| Code execution and practice | `lib/execution.ts`, `lib/judge0.ts`, `lib/practice.ts`, `lib/rate-limit.ts` |
| Recording and retention | `lib/recording.ts`, `app/api/livekit/webhook`, `lib/retention.ts`, `app/api/cron/retention` |
| Feedback | `lib/feedback.ts`, `app/recruiter/interviews/[id]/feedback-form.tsx` |
| Analytics | `lib/analytics.ts`, `components/analytics/charts.tsx` |
| Admin: audit and deletion | `lib/audit.ts`, `lib/audit-format.ts`, `lib/data-deletion.ts`, `app/admin/*` |
| Design system ("Broadsheet") | `app/globals.css`, `components/broadsheet/*`, `components/ui/*` |

### 1.6 Feature status

#### ✅ Working / implemented

| Feature | Notes |
|---|---|
| Sign-up / sign-in / sign-out (Clerk) | Clerk-hosted components at `/sign-in`, `/sign-up`; sign-out via the avatar menu |
| Onboarding role picker | CANDIDATE / RECRUITER / INTERVIEWER; ADMIN is deliberately not offered |
| Role-based access (middleware + page + Server Action) | Wrong role redirects to its own dashboard |
| Candidate job board + apply with résumé (PDF/DOCX ≤ 5 MB) | One application per job enforced by a DB unique index |
| ATS scoring (Gemini, keyword-heuristic fallback) | Runs after apply; report at `/candidate/applications/[id]/ats` |
| Résumé polish (Gemini) | Max 3 attempts per application (lifetime) |
| Recruiter pipeline: search, status filter, shortlist filter, sort, multi-select, bulk "Move to", Compare (2–4) | |
| Candidate profile: status change, shortlist, résumé download, skills, feedback summary, interviews | |
| Post job, add candidate to job | |
| 3-step scheduling with conflict-aware weekly grid | Conflicts re-checked server-side on confirm |
| Reschedule, cancel, mark in progress / completed / no-show | Legal-transition checks and optimistic locking |
| Invites + reschedule/cancel emails with `.ics` attachments; 24 h / 1 h reminders | Emails need Resend; reminders need the cron call |
| In-app notifications (bell, polling every 30 s) + candidate notifications page | |
| Interview room: shared editor with live cursors, language switch, chat with history, presence, token refresh on reconnect | |
| Code Run in room (visible to all participants) and solo Practice (30 runs/hour) | Needs Judge0 |
| Integrity signals (tab blur, paste length, full-screen exit), candidate-only, advisory | |
| Structured feedback (3 rubric scores 1–5, notes, recommendation) — one per interviewer, resubmittable | |
| Analytics: completion rate, hires, active applications, weekly charts, status bars, ATS by job, interviewer table, 30/90-day range | |
| Audit log with filters (action, actor), keyset paging, readable sentences | |
| Candidate data-deletion request → admin approve (counts scope, type DELETE) / decline with reason | Deletes DB rows, R2 files, Clerk account |
| Recording retention sweep (`RECORDING_RETENTION_DAYS`) | Opt-in |
| Google Calendar sync (PRD FR-5.3) — connect at **Calendar** in the sidebar, any role | Interviews are written to each connected participant's own calendar, patched on reschedule and deleted on cancellation; their Google busy times are merged into the scheduling grid. Needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `CALENDAR_TOKEN_KEY` |
| Light / dark / auto theme; responsive shell with mobile drawer | |
| Error and 404 boundaries per section; inline form errors; user-facing copy kept free of vendor and configuration detail (`lib/error-copy.ts` filters anything that isn't an authored sentence) | Operator detail goes to the server log |

#### ⚠️ Partially implemented / needs verification

| Area | What's partial |
|---|---|
| Video calls & recording (LiveKit) | Implemented but **not verified in this handoff run** (no LiveKit keys in the tested environment). Recording also needs R2 plus a public webhook URL (use a tunnel locally). The free LiveKit plan allows about 1 recorded hour/month and 2 concurrent recordings. |
| Code execution (Judge0) | Implemented; needs the Docker stack. Without it, every Run shows "The execution service is unavailable." |
| Email delivery (Resend) | Implemented; without `RESEND_API_KEY` emails are skipped silently (in-app notifications still appear). |
| Reminders & retention | The logic exists, but nothing calls the cron routes locally. Trigger them by hand with `curl` (section 7). |
| Organisations / multi-tenancy | Everyone joins the single "Default Organization". No org creation, invites or switching. |
| OBSERVER participant role | Recruiters/admins add observers when scheduling (step 1) or later from the interview page (Participants → Add an observer, while the interview is Scheduled or In progress). Observers can watch, see live cursors and chat; the editor is read-only and Run is refused, both enforced server-side. Removing an observer does not disconnect them if they're already in the room; the change applies when their session token next refreshes. |
| Scheduling grid | Shows Mon–Fri 08:00–18:59 local time by default; the **Weekend** and **06:00–22:59** toggles widen it. Half-hour and night starts still need the "exact time" input. The candidate's timezone isn't known (see *Candidate availability / timezone capture* below). |

#### ❌ Not implemented / broken

| Item | Detail |
|---|---|
| Organisation / team management UI, user invites | Not built |
| Candidate availability / timezone capture | Not stored anywhere |
| Export CSV (analytics, audit), retrying failed deletions, feedback drafts, cancellation reasons, device-check lobby | Not built (they appear in the design only) |
| Custom loading states | There is no `loading.tsx` anywhere, so navigation shows no skeletons. (Error and 404 pages **do** exist: `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, plus per-section boundaries under `recruiter`, `candidate`, `admin`, `jobs` and `interview`.) |
| Upstash Redis rate limiting | `UPSTASH_REDIS_REST_URL/TOKEN` are in `.env.example` but **unused**; rate limits are stored in Postgres (`rate_limit_hits`) |

### 1.7 Known bugs and issues found during inspection

| # | Severity | Issue | Where | How to see it |
|---|---|---|---|---|
| KI-01 | ~~Medium~~ **Fixed** | `npm run set-role --workspace=web -- <email> <ROLE>` used to fail with "CLERK_SECRET_KEY is not set", because a plain `tsx` process doesn't load `.env.local` the way Next.js does. The npm script now passes `--env-file=.env.local` | `apps/web/package.json` script | Run the README command against a signed-up account |
| KI-02 | ~~Medium~~ **Fixed** | Errors thrown by the **Post job** and **Add candidate** forms (e.g. duplicate application) used to show the generic Next.js error screen. Both actions now return the message, the forms show it in a red banner above the fields and keep what was typed, and the app has its own error and 404 boundaries | `app/recruiter/jobs/new/*`, `app/recruiter/applications/new/*`, `app/**/error.tsx`, `app/**/not-found.tsx` | Add the same candidate to the same job twice — expect the inline banner |
| KI-03 | ~~Medium~~ **Fixed** | The **integrity signals** list on the interview detail page was unbounded — one real interview had hundreds of "Switched away from the tab" rows, making the page ~6,000 px tall. The page now lists the first 20 with per-type totals above them, and loads only those 20 rows: the totals are counted in the database | `app/recruiter/interviews/[id]/page.tsx`, `lib/queries.ts` | Open an interview where the candidate alt-tabbed a lot — expect "Switched away from the tab × N", 20 rows, then "+N more not shown" |
| KI-15 | ~~Medium~~ **Fixed** | User-facing errors named vendors and environment variables ("Set R2_ACCOUNT_ID…", "LiveKit's recording limit", "AI service not configured"), and the error page printed raw thrown messages including Prisma dumps | `lib/resume-availability.ts`, `lib/error-copy.ts`, `lib/recording.ts`, `lib/resume-polish.ts` | Click Résumé with storage unset — expect one short line, and the detail in the terminal |
| KI-04 | ~~Low~~ **Fixed** | `POST /api/notifications` with a non-JSON body now returns **400** with `{"error":"Expected a JSON body…"}`; non-string ids are dropped | `app/api/notifications/route.ts` | `curl -X POST -d 'x'` with a session cookie |
| KI-05 | Low | Scheduling grid: **past slots look identical to free ones** (only disabled), so a tester can't tell why a click does nothing | `components/schedule/schedule-flow.tsx` | Step 2 on a Wednesday: Monday cells can't be selected |
| KI-06 | Low | Audit-log empty state with an unknown actor reads "**Nobody has no** … entries" (double negative) | `app/admin/audit/page.tsx` | `/admin/audit?action=privacy.data_deleted&actor=unknown` |
| KI-07 | Low | Analytics "Interviewers" table: the right-most column ("Outstanding") is clipped at ~1450 px wide | `app/recruiter/analytics/page.tsx` | Open analytics at desktop width |
| KI-08 | Low | The candidate profile's status dropdown shows raw enum values (`INTERVIEWING`) while everywhere else shows "Interviewing" | `components/pipeline/application-status-select.tsx` | Open any candidate profile as a recruiter |
| KI-09 | ~~Low~~ **Fixed** | **Post job** now redirects to `/recruiter/jobs` | `app/recruiter/jobs/new/actions.ts` | Post a job |
| KI-10 | ~~Low~~ **Fixed** | Interviews whose slot has passed stay **Scheduled** — still by design, since only the people involved know whether it happened. What changed: 30 minutes after the slot ends (the join token's own grace period), the room clock stops counting overtime and reads "slot ended 3 days ago"; lists show **Outcome needed** (staff) or **Awaiting outcome** (candidate) instead of "Scheduled"; Join links are replaced by "Record outcome"; and the interview page asks for the outcome | `lib/interview-timing.ts` | Open an old scheduled interview |
| KI-11 | ~~Info~~ **Fixed** | The notifications page wasn't in the sidebar, the bell dropdown had no "view all" link, and only candidates had a page at all — staff could never get back to a notification once read. It now lives at `/notifications` for every role (`/candidate/notifications` redirects there), is linked from the candidate sidebar and from **View all notifications** in the bell, and shows times in the viewer's timezone instead of the server's | `app/notifications`, `components/layout/notification-bell.tsx` | Open the bell, click **View all notifications** |
| KI-12 | ~~Info~~ **Fixed** | Application status could move from any state to any state, and every move emailed the candidate. Still no full state machine, by design: moves between open stages are routine corrections. What changed: leaving **Hired** or **Rejected** asks for confirmation first, and the server refuses it unconfirmed; setting the status an application already has writes and sends nothing; bulk **Move to** skips hired and rejected rows and says so. Overturns are marked in the audit log | `lib/application-status.ts`, `lib/applications.ts` | On a candidate's page, change a Rejected application to Screening — expect a confirmation |
| KI-13 | Info | Closing a deletion request whose account is already gone is recorded as **Declined** with the reason "The account was already removed." | `components/privacy/deletion-request-actions.tsx` | Needs a request whose user row was deleted |
| KI-14 | Info | In development, the Next.js dev-tools badge covers the sidebar's "Light" theme button | Dev only | `npm run dev` |

No `TODO`/`FIXME` markers exist in the tracked source.

**Security scan:** no real secrets, keys or connection strings are committed — in tracked files *or* in git history. `.env*` and `judge0.conf` have never been committed.

### 1.8 Known limitations

- **Single organisation.** Every real account shares data with every other account, including the seed data.
- **Clerk session token must be customised** (section 2.3), or every signed-in user loops back to `/onboarding`.
- **Role changes need a fresh session token.** After `set-role`, the old role lingers until Clerk refreshes the token (about a minute), or until you sign out and back in.
- **Neon cold starts.** The first query after idle can take 3–10 s; `connect_timeout=30` must be on every `DATABASE_URL`.
- **Rate limits:**
  - Practice runs: 30 per candidate per rolling hour.
  - Résumé polish: 3 per application, forever.
  - Chat: 20 messages / 10 s per socket.
  - Integrity signals: 60 / min per socket.
- **Size limits:** résumé ≤ 5 MB and PDF/DOCX only; image-only PDFs are rejected. Code ≤ 50,000 chars, stdin ≤ 10,000, chat message ≤ 2,000, feedback notes ≤ 5,000, job description ≤ 10,000, skills ≤ 50 × 80 chars.
- **Interview duration:** 15–240 minutes in 15-minute steps. The join token lives for the duration + 30 minutes and refreshes automatically on reconnect.
- **Times:** stored as UTC instants and shown in the viewer's timezone. Server-rendered times briefly show "UTC" before hydrating to local time.

---

## 2. Local Setup Guide

### 2.1 Prerequisites

| Requirement | Version / detail | Needed for |
|---|---|---|
| Git | any recent | cloning |
| Node.js | **≥ 20.9** (tested on 22.20). `nvm install 22` recommended | everything |
| npm | **10.9.x** (pinned via `packageManager`) — ships with Node 22 | installs, scripts |
| PostgreSQL | A **Neon** project (free tier) — or any Postgres 15+ reachable by URL | required |
| Clerk account | Free "development" instance | required (auth) |
| Docker Desktop | with Compose v2 | optional — Judge0 (Run button) |
| LiveKit Cloud project | free Build plan | optional — video, recording |
| Cloudflare R2 bucket + API token | | optional — résumé storage, recordings |
| Resend account + verified sender | | optional — email |
| Google AI Studio API key (Gemini) | | optional — AI ATS scoring, résumé polish |
| `openssl` | for generating secrets | setup |
| A tunnel (e.g. `ngrok`) | | optional — LiveKit webhook to localhost |

### 2.2 Repository setup

```bash
git clone https://github.com/coderashhar/RecruitEasy.git
cd RecruitEasy
git checkout claude/interviewhub-ui-redesign-e38220   # or main once PR #19 is merged
npm install                                            # installs all workspaces
```

`npm install` runs `prisma generate` through `@prisma/client`'s postinstall. If types for `@interviewhub/db` are missing, run `npm run db:generate` (section 2.4).

### 2.3 Environment configuration

There are **three env files**, plus two optional ones for infrastructure. Copy the examples first:

```bash
cp apps/web/.env.example      apps/web/.env.local
cp apps/realtime/.env.example apps/realtime/.env
cp packages/db/.env.example   packages/db/.env
# optional, only if running Judge0 locally:
cp infra/judge0/judge0.conf.example infra/judge0/judge0.conf
```

> **Security.**
> - Never commit these files; they're already in `.gitignore`.
> - Never paste real values into tickets, chat or this document.
> - Variables prefixed `NEXT_PUBLIC_` are **compiled into the browser bundle** — only put public identifiers there, never secrets.

Generate each random secret with:

```bash
openssl rand -hex 32
```

#### `apps/web/.env.local` — the Next.js app

| Variable / Key | Exact Name | Required? | Where to Get It | Where to Put It | Purpose |
|---|---|---|---|---|---|
| Clerk publishable key | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | **Required** · 🌐 public | Clerk Dashboard → your app → **API Keys** → Publishable key | `apps/web/.env.local` | Initialises Clerk in the browser |
| Clerk secret key | `CLERK_SECRET_KEY` | **Required** · 🔒 secret | Clerk Dashboard → **API Keys** → Secret key | `apps/web/.env.local` | Server-side auth, onboarding metadata updates, `set-role` script, deleting Clerk users on data deletion |
| Sign-in path | `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Required · 🌐 public | Use `/sign-in` | `apps/web/.env.local` | Where Clerk sends signed-out users |
| Sign-up path | `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Required · 🌐 public | Use `/sign-up` | `apps/web/.env.local` | Clerk sign-up route |
| Post-sign-in redirect | `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Required · 🌐 public | Use `/onboarding` | `apps/web/.env.local` | Landing spot after sign-in when no redirect is given |
| Post-sign-up redirect | `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | Required · 🌐 public | Use `/onboarding` | `apps/web/.env.local` | New users pick a role first |
| Database URL | `DATABASE_URL` | **Required** · 🔒 secret | Neon Console → project → **Connection string** (pooled). Append `&connect_timeout=30` **inside** the closing quote | `apps/web/.env.local` | Prisma connection for the web app |
| Realtime service URL | `NEXT_PUBLIC_REALTIME_URL` | Required for the room · 🌐 public | Local: `http://localhost:4000`; prod: your VPS domain | `apps/web/.env.local` | Browser connects Socket.io here; server posts broadcasts here |
| Realtime shared secret | `REALTIME_JWT_SECRET` | Required for the room · 🔒 secret | Generate with `openssl rand -hex 32` — **identical** in `apps/realtime/.env` | `apps/web/.env.local` | Signs room join tokens; authenticates `/internal/broadcast` |
| LiveKit API key | `LIVEKIT_API_KEY` | Optional (video) · 🔒 secret | LiveKit Cloud → project → **Settings → Keys** | `apps/web/.env.local` | Mint video tokens, start/stop Egress, verify webhooks |
| LiveKit API secret | `LIVEKIT_API_SECRET` | Optional (video) · 🔒 secret | Same screen as above | `apps/web/.env.local` | Same as above |
| LiveKit server URL | `NEXT_PUBLIC_LIVEKIT_URL` | Optional (video) · 🌐 public | LiveKit Cloud project URL, `wss://<project>.livekit.cloud` | `apps/web/.env.local` | Browser connects to the call; Egress client host |
| Judge0 URL | `JUDGE0_URL` | Optional (Run) · 🔒 server-only | `http://localhost:2358` when running `infra/judge0`; prod: `https://<JUDGE0_DOMAIN>` | `apps/web/.env.local` | Code execution endpoint (never exposed to the browser) |
| Judge0 token | `JUDGE0_AUTH_TOKEN` | Optional (Run) · 🔒 secret | The `AUTHN_TOKEN` you generated in `infra/judge0/judge0.conf` | `apps/web/.env.local` | Sent as `X-Auth-Token` to Judge0 |
| R2 account ID | `R2_ACCOUNT_ID` | Optional (files) · 🔒 secret | Cloudflare Dashboard → **R2** → Account ID | `apps/web/.env.local` | Builds the endpoint `https://<id>.r2.cloudflarestorage.com` |
| R2 access key ID | `R2_ACCESS_KEY_ID` | Optional (files) · 🔒 secret | Cloudflare → R2 → **Manage API tokens** → create token (Object Read & Write) | `apps/web/.env.local` | S3 credentials; also reused by LiveKit Egress to upload recordings |
| R2 secret access key | `R2_SECRET_ACCESS_KEY` | Optional (files) · 🔒 secret | Same token creation screen | `apps/web/.env.local` | S3 credentials |
| R2 bucket | `R2_BUCKET` | Optional · 🔒 server-only | Name of a bucket you create in R2 (default in code: `interviewhub`) | `apps/web/.env.local` | Where résumés and recordings are stored |
| Upstash URL | `UPSTASH_REDIS_REST_URL` | **Not used by code** | — | (leave blank) | Leftover from the plan; rate limits use Postgres |
| Upstash token | `UPSTASH_REDIS_REST_TOKEN` | **Not used by code** | — | (leave blank) | Same |
| Resend API key | `RESEND_API_KEY` | Optional (email) · 🔒 secret | Resend → **API Keys** → Create | `apps/web/.env.local` | Sends invites, reminders, status emails |
| Sender address | `EMAIL_FROM` | Optional · 🔒 server-only | A sender on a domain verified in Resend, e.g. `"InterviewHub AI <noreply@yourdomain.com>"`. Default in code: `InterviewHub AI <noreply@interviewhub.dev>` | `apps/web/.env.local` | From header and calendar ORGANIZER |
| Public app URL | `NEXT_PUBLIC_APP_URL` | Optional · 🌐 public | `http://localhost:3000` locally; deployed origin in prod | `apps/web/.env.local` | Links in emails and `.ics` invites |
| Cron secret | `CRON_SECRET` | Required to use cron routes · 🔒 secret | Generate with `openssl rand -hex 32`; same value in `infra/caddy/.env` in prod | `apps/web/.env.local` | `Authorization: Bearer` gate for `/api/cron/*`; unset means every cron call gets 401 |
| Recording retention | `RECORDING_RETENTION_DAYS` | Optional | Positive integer of your choice, e.g. `90` | `apps/web/.env.local` | Deletes recordings N days after they finish; unset keeps them forever |
| Gemini API key | `GEMINI_API_KEY` | Optional (AI) · 🔒 secret | Google AI Studio → **Get API key** | `apps/web/.env.local` | LLM ATS scoring and résumé polish |

#### `apps/realtime/.env` — the Socket.io + Yjs service

| Variable / Key | Exact Name | Required? | Where to Get It | Where to Put It | Purpose |
|---|---|---|---|---|---|
| Port | `PORT` | Optional (default `4000`) | Choose | `apps/realtime/.env` | Listen port |
| Shared secret | `REALTIME_JWT_SECRET` | **Required** · 🔒 secret — the service **refuses to start** without it | Same value as in `apps/web/.env.local` | `apps/realtime/.env` | Verifies join tokens and the internal broadcast header |
| Database URL | `DATABASE_URL` | **Required** · 🔒 secret | Same Neon string (with `connect_timeout=30`) | `apps/realtime/.env` | Code snapshots, chat, integrity signals |
| Allowed origins | `CORS_ORIGIN` | Optional (default `http://localhost:3000`) | Comma-separated list of web origins | `apps/realtime/.env` | Socket.io CORS |

#### `packages/db/.env` — Prisma CLI (migrate, studio, seed)

| Variable / Key | Exact Name | Required? | Where to Get It | Where to Put It | Purpose |
|---|---|---|---|---|---|
| Database URL | `DATABASE_URL` | **Required** · 🔒 secret | Same Neon string | `packages/db/.env` | Used by `prisma migrate`, `prisma studio`, `db:seed` |

#### Infrastructure (optional)

| Variable / Key | Exact Name | Required? | Where to Get It | Where to Put It | Purpose |
|---|---|---|---|---|---|
| Judge0 Redis password | `REDIS_PASSWORD` | Required by Judge0 · 🔒 secret | `openssl rand -hex 32` | `infra/judge0/judge0.conf` | Internal Redis auth |
| Judge0 Postgres password | `POSTGRES_PASSWORD` | Required by Judge0 · 🔒 secret | `openssl rand -hex 32` | `infra/judge0/judge0.conf` | Internal Judge0 DB |
| Judge0 API token | `AUTHN_TOKEN` | Required by Judge0 · 🔒 secret | `openssl rand -hex 32`; copy into `JUDGE0_AUTH_TOKEN` | `infra/judge0/judge0.conf` | Rejects unauthenticated submissions |
| Realtime domain | `REALTIME_DOMAIN` | Prod VPS only | Your DNS name for the realtime service | env read by `infra/caddy/docker-compose.yml` (e.g. `infra/caddy/.env`) | Caddy TLS + reverse proxy |
| Judge0 domain | `JUDGE0_DOMAIN` | Prod VPS only | Your DNS name for Judge0; Vercel's `JUDGE0_URL` is `https://` + this | `infra/caddy/.env` | Caddy TLS; proxies only `POST /submissions` to Judge0, 404 for everything else |
| App origin for cron | `APP_URL` | Prod VPS only | Deployed web origin | `infra/caddy/.env` | The `cron` container calls `$APP_URL/api/cron/*` every 10 min |
| Cron secret | `CRON_SECRET` | Prod VPS only · 🔒 secret | Same as web | `infra/caddy/.env` | Bearer token for cron calls |

#### Dashboard settings that are not env vars (but are required)

1. **Clerk → Sessions → Customize session token.** Add exactly:
   ```json
   { "metadata": "{{user.public_metadata}}" }
   ```
   Without it, `sessionClaims.metadata.role` is always empty and every signed-in user is redirected to `/onboarding` forever.
2. **LiveKit Cloud → Settings → Webhooks** (only for recording). Add `<public app origin>/api/livekit/webhook`, signed with the same API key as `LIVEKIT_API_KEY`. Locally, expose port 3000 with `ngrok http 3000` and use that URL. Without it, recordings stay "saving" forever.

#### Example (placeholders only)

```env
# apps/web/.env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/onboarding
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/onboarding
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require&connect_timeout=30"
NEXT_PUBLIC_REALTIME_URL=http://localhost:4000
REALTIME_JWT_SECRET=generate_with_openssl_rand_hex_32
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=generate_with_openssl_rand_hex_32
```

> **Quoting trap:** keep `&connect_timeout=30` **inside** the quotes. `...require"&connect_timeout=30` breaks the connection outright.

### 2.4 Database setup

1. **Create a database.** In Neon, create a project, or better, **a branch of your own** so you don't share state with teammates. Copy the pooled connection string into all three env files (with `connect_timeout=30`).
2. **Apply the schema** (12 migrations under `packages/db/prisma/migrations`):
   ```bash
   # a fresh, personal database:
   npm run db:migrate
   # a database others already use (applies pending migrations, never prompts to reset):
   npm run migrate:deploy --workspace=@interviewhub/db
   ```
   > **Never** run `prisma migrate reset` against the shared dev database.
3. **Generate the Prisma client** (after any schema change):
   ```bash
   npm run db:generate
   ```
4. **Seed sample data** (optional, idempotent, clears previously seeded rows first):
   ```bash
   npm run db:seed
   ```
   This creates:
   - The org `default` ("Default Organization").
   - Users: Rae Recruiter, Ivan Interviewer, Ada Admin, and candidates Alice / Bob / Carol Applicant. They have `clerkId` values starting `seed_`, so **they cannot sign in**.
   - Jobs: Backend Engineer, Frontend Engineer.
   - Applications: Alice (INTERVIEWING, with an ATS report), Bob (SCREENING), Carol (APPLIED).
   - One interview for Alice with Ivan, 24 h after the seed time.
5. **Inspect data** at any time:
   ```bash
   npm run db:studio          # opens Prisma Studio in the browser
   ```

**Tables created:** `organizations`, `users`, `jobs`, `applications`, `resumes`, `ats_reports`, `interviews`, `interview_participants`, `code_documents`, `executions`, `recordings`, `feedback`, `chat_messages`, `integrity_signals`, `notifications`, `audit_logs`, `rate_limit_hits`, `data_deletion_requests`. Details are in section 8.

### 2.5 External services

| Service | Required? | Configure | What breaks without it |
|---|---|---|---|
| **Clerk** | Yes | Create an app; copy the two keys; add the session-token customisation (2.3). The default email/password + email-code sign-up is fine. | Nothing works (every route except `/` needs auth) |
| **Neon Postgres** | Yes | Project or branch → pooled string | Nothing works |
| **Realtime service** (`apps/realtime`) | For the interview room | Runs with `npm run dev`; shares `REALTIME_JWT_SECRET` | Room shows "Connecting…", no editor or chat |
| **Judge0** | For Run and Practice | `cd infra/judge0 && cp judge0.conf.example judge0.conf` → fill `REDIS_PASSWORD`, `POSTGRES_PASSWORD`, `AUTHN_TOKEN` → `docker compose up -d` → `curl http://localhost:2358/languages` lists languages | Run returns FAILED "The execution service is unavailable…"; practice runs are refunded |
| **LiveKit Cloud** | For video, screen share, recording | Keys + URL in web env; webhook for recording | The video area is hidden in the room; editor and chat still work |
| **Cloudflare R2** | For résumé files and recordings | Bucket + API token | Upload is skipped (the application still saves); "Résumé" download returns 404 "file storage may not be configured"; recording refuses to start |
| **Resend** | For emails | API key + verified sender domain | Emails silently skipped; in-app notifications still created |
| **Google Gemini** | For AI scoring and polish | API key | ATS falls back to HEURISTIC scoring; Polish shows "Resume polishing is not available — AI service not configured." |

### 2.6 Running the application

```bash
npm run dev
```

Turborepo starts both apps in parallel:

| Service | URL | Health check |
|---|---|---|
| Web app (`apps/web`, `next dev`) | <http://localhost:3000> | Landing page renders |
| Realtime (`apps/realtime`, `tsx watch`) | <http://localhost:4000> | `curl http://localhost:4000/healthz` returns `ok` |
| Judge0 (optional, Docker) | <http://localhost:2358> | `curl http://localhost:2358/languages` |
| Prisma Studio (optional) | printed by `npm run db:studio` | — |

Run the apps individually:

```bash
npm run dev --workspace=web                       # web only
npm run dev --workspace=@interviewhub/realtime    # realtime only
```

Quality gates. All four must pass before a PR, per `CLAUDE.md`:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

`apps/realtime/src/server.integration.test.ts` boots the real server against a real Postgres. It needs `DATABASE_URL` in `apps/realtime/.env` and takes ~17 s.

**Give yourself a role.** Sign up at `/sign-up`, then pick Candidate / Recruiter / Interviewer on `/onboarding`. To grant ADMIN, or to switch roles for testing, from the repo root:

```bash
npm run set-role --workspace=web -- someone@example.com ADMIN
```

Then refresh the session: sign out and in again, or wait about a minute.

**Recommended test accounts.** Create four Clerk users, ideally with `+alias` email addresses:

| Account | Role | How to get it |
|---|---|---|
| `qa+candidate@…` | CANDIDATE | Onboarding |
| `qa+recruiter@…` | RECRUITER | Onboarding |
| `qa+interviewer@…` | INTERVIEWER | Onboarding |
| `qa+admin@…` | ADMIN | Onboarding as Recruiter, then `set-role … ADMIN` |

Use separate browsers or profiles (or one private window) to hold two sessions at once.

### 2.7 Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Every signed-in user bounces to `/onboarding` forever | Clerk session token not customised | Add `{ "metadata": "{{user.public_metadata}}" }` in Clerk → Sessions → Customize session token; sign out/in |
| `Can't reach database server at …` | Neon branch waking from idle, or `connect_timeout` missing or outside the quotes | Add `&connect_timeout=30` inside the quotes in all three env files; retry |
| Realtime crashes with `REALTIME_JWT_SECRET is not set — refusing to start` | Missing `apps/realtime/.env` | Create it with the same secret as web |
| Room stuck on "Connecting…" / "Session expired" | Secrets differ between web and realtime, realtime not running, or wrong `NEXT_PUBLIC_REALTIME_URL` / `CORS_ORIGIN` | Make the secrets identical; `curl localhost:4000/healthz`; restart both |
| `set-role` prints `CLERK_SECRET_KEY is not set` | `apps/web/.env.local` missing or has no `CLERK_SECRET_KEY` (KI-01, the script not reading that file, is fixed) | Copy `.env.example` to `.env.local` and fill it in |
| Role change not reflected | Old session token | Sign out/in, or wait ~60 s and reload |
| Run always says "execution service is unavailable" | Judge0 not running or token mismatch | `docker compose ps` in `infra/judge0`; `JUDGE0_AUTH_TOKEN` must equal `AUTHN_TOKEN` |
| "Résumé" download says file storage may not be configured | R2 env missing | Fill the `R2_*` vars, then apply again (old uploads were never stored) |
| No video area in the room | LiveKit env missing | Set `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`; restart `next dev` (public vars are baked at start) |
| Recording stuck at "Saving recording" | LiveKit webhook not reaching the app | Configure the webhook to a public URL (ngrok) |
| No emails arrive | `RESEND_API_KEY` unset or sender domain unverified | Check Resend logs; the in-app bell should still show the notice |
| Reminders never sent | Nothing calls the cron route locally | `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reminders` |
| `npm run build` fails with module-not-found inside `packages/*` | A `.js` extension added to a relative import in `packages/types` or `packages/db` | Keep relative specifiers extensionless (see `CLAUDE.md`, Turbopack note) |
| Type errors about `LayoutProps` / `PageProps` | Next typegen hasn't run yet | Run `npm run build` (or start `next dev` once) |
| Port 3000 or 4000 already in use | Another checkout is running | `lsof -iTCP:3000 -sTCP:LISTEN`, stop it or change `PORT` |

---

## 3. Application Pages & User Flows

### 3.1 Route map

**Access rule.** The first gate is `middleware.ts`:

- Public paths: `/`, `/sign-in*`, `/sign-up*`, `/api/cron/*`, `/api/livekit/webhook`.
- Everything else requires a Clerk session.
- Signed in with no role → only `/onboarding`.
- `/recruiter*` → RECRUITER, INTERVIEWER, ADMIN.
- `/admin*` → ADMIN.
- `/candidate*` → CANDIDATE.

Every page then **re-checks** with `requireCurrentUser([...roles])`. A wrong role is redirected to its own dashboard: CANDIDATE → `/candidate`; INTERVIEWER, RECRUITER, ADMIN → `/recruiter`.

| # | Page | Route | Roles | Screenshot |
|---|---|---|---|---|
| P01 | Landing | `/` | Public | ✅ |
| P02 | Sign in | `/sign-in` | Public (signed-out) | ⚠️ manual |
| P03 | Sign up | `/sign-up` | Public (signed-out) | ⚠️ manual |
| P04 | Onboarding (role picker) | `/onboarding` | Signed in (any; intended for no-role users) | ✅ |
| P05 | Candidate overview | `/candidate` | CANDIDATE | ✅ |
| P06 | Candidate applications | `/candidate/applications` | CANDIDATE | ✅ |
| P07 | ATS report | `/candidate/applications/[id]/ats` | CANDIDATE (own application) | ⚠️ manual |
| P08 | Candidate interviews | `/candidate/interviews` | CANDIDATE | ✅ |
| P09 | Practice | `/candidate/practice` | CANDIDATE | ✅ |
| P10 | Notifications | `/notifications` | All roles | ✅ |
| P11 | Your data (privacy) | `/candidate/data` | CANDIDATE | ✅ |
| P12 | Open positions | `/jobs` | CANDIDATE | ✅ |
| P13 | Job detail & apply | `/jobs/[id]` | CANDIDATE | ✅ |
| P14 | Pipeline (recruiter/admin) · Today (interviewer) | `/recruiter` | RECRUITER, ADMIN · INTERVIEWER | ✅ both |
| P15 | Interviews list | `/recruiter/interviews` | RECRUITER, ADMIN (all org) · INTERVIEWER (own) | ✅ both |
| P16 | Interview detail | `/recruiter/interviews/[id]` | RECRUITER, INTERVIEWER, ADMIN (org-scoped) | ✅ |
| P17 | Feedback due | `/recruiter/feedback` | RECRUITER, INTERVIEWER, ADMIN | ✅ |
| P18 | Candidates (read-only pipeline) | `/recruiter/candidates` | RECRUITER, INTERVIEWER, ADMIN | ✅ |
| P19 | Candidate profile | `/recruiter/candidates/[applicationId]` | RECRUITER, INTERVIEWER, ADMIN | ✅ |
| P20 | Compare candidates | `/recruiter/compare?ids=a,b[,c,d]` | RECRUITER, INTERVIEWER, ADMIN | ✅ |
| P21 | Jobs list | `/recruiter/jobs` | RECRUITER, INTERVIEWER, ADMIN | ✅ |
| P22 | Post a job | `/recruiter/jobs/new` | RECRUITER, ADMIN | ✅ |
| P23 | Add a candidate | `/recruiter/applications/new` | RECRUITER, ADMIN | ✅ |
| P24 | Schedule an interview (3 steps) | `/recruiter/schedule[?applicationId=&round=]` | RECRUITER, ADMIN | ✅ ×3 |
| P25 | Hiring analytics | `/recruiter/analytics[?range=30\|90]` | RECRUITER, ADMIN | ✅ light + dark |
| P26 | Interview room | `/interview/[id]` | Any role, **participants of that interview only** (others get 404) | ✅ |
| P27 | Admin index | `/admin` → redirects to `/admin/audit` | ADMIN | — |
| P28 | Audit log | `/admin/audit[?action=&actor=&after=]` | ADMIN | ✅ + empty state |
| P29 | Data deletion requests | `/admin/deletion-requests` | ADMIN | ✅ |
| — | Résumé download (route handler) | `/recruiter/candidates/[applicationId]/resume` | RECRUITER, INTERVIEWER, ADMIN | n/a (file) |

**Shared shell** (every page except P01–P04 and P26):

- **Sidebar** (≥ 1024 px): wordmark, role-specific navigation with counts, and your name, role and organisation. It also has the Light / Dark / Auto theme switch.
- **Top bar:** notification bell (polls `GET /api/notifications` every 30 s; unread badge; dropdown with "Mark all read") and the Clerk avatar menu (manage account, **Sign out**).
- **Below 1024 px:** a 54 px top bar with a hamburger that opens the navigation drawer and shows the current page title.

| Role | Sidebar items (count shown when > 0) |
|---|---|
| CANDIDATE | Overview · Applications (n) · Interviews (upcoming n) · Practice · Browse jobs · *Privacy:* Your data |
| INTERVIEWER | Today · My interviews (n) · Feedback due (n, amber) · Candidates |
| RECRUITER | *Hiring:* Pipeline (active n) · Interviews (upcoming n) · Schedule · Jobs · Analytics |
| ADMIN | Recruiter items + *Administration:* Audit log · Deletion requests (pending n, red) |

### 3.2 Page details

> **Notation.**
> - **Actions** are Next.js Server Actions (POST requests made by the page itself, not a public REST API).
> - **DB** lists the tables read (R) or written (W).
> - Pages are server-rendered on every request: there is no custom loading skeleton. A thrown error renders the section's **error boundary** (in-shell, with *Try again*), and `notFound()` renders the section's **404 page**.

#### P01 · Landing — `/`
- **Purpose:** Marketing entry point.
- **Access:** Anyone.
- **UI:** Wordmark, "Sign in" link, headline, **Get started** (→ `/sign-up`) and **Sign in** (→ `/sign-in`) buttons, three product pillars.
- **API / DB:** None.
- **States:** Static page. It renders the same when signed in; there's no auto-redirect to the dashboard.

#### P02 / P03 · Sign in / Sign up — `/sign-in`, `/sign-up`
- **Purpose:** Clerk-hosted authentication.
- **Access:** Anyone; signed-in users are redirected by Clerk.
- **UI:** Clerk `<SignIn />` / `<SignUp />` components with email + password or email code, depending on the Clerk instance settings.
- **Flow:** After success → `NEXT_PUBLIC_CLERK_*_FALLBACK_REDIRECT_URL` (`/onboarding`) → middleware sends users who already have a role to their dashboard.
- **Errors:** Clerk inline messages (wrong password, unverified email, etc.).

#### P04 · Onboarding — `/onboarding`
- **Purpose:** Choose your side of the table once.
- **Access:** Signed-in.
- **UI:** Three rows — Candidate, Recruiter, Interviewer — each with **Continue**; a note that admin access is granted separately.
- **Action:** `setRole(formData{role})`. It rejects any role that isn't self-assignable (so never ADMIN) and refuses to overwrite an existing role (redirects to your dashboard instead). It creates your `users` row (in org `default`) *before* writing Clerk `publicMetadata.role`.
- **DB:** W `users`; R/W `organizations` (upsert default).
- **Success:** Redirect to `/candidate` or `/recruiter`.
- **Errors:** "Invalid role submitted"; "Your Clerk account has no email address…" (generic error page).

#### P05 · Candidate overview — `/candidate`
- **Purpose:** Where each application stands; your next interview.
- **UI:**
  - "Hello, {first name}" and a summary line.
  - A dark "act now" panel for the **next upcoming interview**: date/time, relative time, round, duration, interviewers, **Open interview room**. It pulses when within an hour or in progress.
  - The integrity-monitoring disclosure.
  - **Your applications:** up to 6 rows with status chip, applied date, ATS score and an **Open** link to the ATS report when a score exists.
  - **Practice** block with **Start practising**.
  - **Your data:** recordings held, retention days, **Request deletion** link.
- **DB:** R `applications`, `resumes`, `ats_reports`, `interviews`, `interview_participants`, `recordings`, `data_deletion_requests`.
- **Empty state:** "No interviews scheduled"; "You haven't applied to anything yet. Browse open jobs".

#### P06 · Candidate applications — `/candidate/applications`
- **UI:** **In progress** and **Decided** (Hired/Rejected) sections; rows as on P05; **Browse jobs** button.
- **Empty state:** "Nothing in progress."

#### P07 · ATS report — `/candidate/applications/[id]/ats`
- **Purpose:** Show how the résumé scores against the job.
- **Access:** The owning candidate only; any other id → 404.
- **UI:**
  - Score out of 100 with a bar, and the scoring source: AI (model name) or keyword analysis.
  - **Skills match:** Matched / Partial / Missing.
  - **Missing keywords.**
  - **Suggestions:** category + message.
  - **Polish** button, which returns section-by-section rewrites (original struck through, suggestion, reason).
- **Action:** `requestPolish(applicationId)`. It needs `GEMINI_API_KEY` and parsed résumé text; capped at 3 per application.
- **DB:** R `applications`, `resumes`, `ats_reports`; W `rate_limit_hits` (polish); W `audit_logs` (`resume.polished`).
- **States:**
  - "Your résumé is being analysed. Check back in a moment." — while scoring hasn't finished.
  - "No résumé uploaded for this application."
  - Polish errors are shown inline in red.

#### P08 · Candidate interviews — `/candidate/interviews`
- **UI:** **Upcoming** (date/time, job, round, duration, interviewers, **Open room**) plus the integrity disclosure; **History** with a status chip.
- **Empty state:** "Nothing scheduled yet. Invites arrive by email too."; "No past interviews."

#### P09 · Practice — `/candidate/practice`
- **Purpose:** Solo timed practice in the same editor as the room.
- **UI:**
  - Problem list: FizzBuzz, Reverse the words, Two sum, Balanced brackets, each with a difficulty chip.
  - Problem statement with sample input and expected output.
  - Editor toolbar: language select, **Reset code**, "N of 30 runs left this hour", **Run**.
  - Monaco editor, **Input (stdin)** box with a "use sample" link, output panel.
  - Runs against the sample input are checked against the expected output.
- **Action:** `runPractice({language, source, stdin})`.
- **DB:** W/R `rate_limit_hits` (key `practice:<userId>`).
- **Errors:** "You've used all 30 practice runs for this hour. Try again later."; Judge0 down gives a FAILED result and the run is refunded.

#### P10 · Notifications — `/notifications`
- **UI:** Every role; reached from the candidate sidebar and the bell's **View all notifications**. `/candidate/notifications` redirects here. Last 50 notifications. Unread ones have a blue left rule; read ones are dimmed. Each links to its target. **Mark all read** appears when anything is unread.
- **API:** `POST /api/notifications {all:true}`.
- **DB:** R/W `notifications`.
- **Empty state:** "No notifications yet."

#### P11 · Your data — `/candidate/data`
- **UI:**
  - **Held about you:** counts of applications, interviews and recordings, plus retention period.
  - **During interviews:** the integrity disclosure.
  - **Deletion:** explanation and a **Request deletion of my data** button, which opens a confirm dialog with **Keep my data** / **Send request**.
- **Action:** `requestMyDataDeletion()`. It creates one PENDING request (idempotent) and notifies every ADMIN.
- **DB:** W `data_deletion_requests`, `notifications`.
- **States:**
  - Pending: an info banner "Deletion requested…" replaces the button.
  - Rejected: a warning banner quoting the admin's reason, plus the button again.

#### P12 · Open positions — `/jobs`
- **UI:** A list of every job in the org: title, applicant count, two-line description, skills.
- **Empty state:** "No open positions right now. Check back later."

#### P13 · Job detail & apply — `/jobs/[id]`
- **UI:** "← All open jobs", title, applicant count, **Required skills**, **About the role**, **Apply** section.
- **Form:** a drop zone that opens a file picker or accepts a dragged file (`.pdf`/`.docx`), then **Submit application**.
- **Action:** `submitApplication(jobId, resume)`:
  1. Validate the job is in the org and the user is a candidate.
  2. Parse the file (type, ≤ 5 MB, text extractable).
  3. Upload to R2 at `resumes/<userId>/<jobId>.<ext>`.
  4. In one transaction, create `applications` (APPLIED) + `resumes` + `audit_logs` (`application.created`).
  5. Score asynchronously into `ats_reports`.
- **Success:** Redirect to `/candidate`.
- **Errors (inline red banner):**
  - "Please upload your resume."
  - "Only PDF and DOCX files are accepted."
  - "File must be under 5 MB."
  - "Could not extract text from the file. Is it scanned or image-only?"
  - "You have already applied to this job."
  - "Job not found."
- **Already applied:** a green banner "You have applied to this position" with a link to the applications page.

#### P14a · Pipeline — `/recruiter` (RECRUITER, ADMIN)
- **UI:**
  - Title with application and job counts.
  - **Post job**, **Add candidate** and **Schedule interview** buttons.
  - Stat row: Interview completion (30 days; "—" when there are no outcomes), Hires · 30 days, Active applications.
  - Dark **Join interview** panel when *you* are a participant in an interview starting within 60 min or in progress.
  - Pipeline table, and a **Next up** list (up to 5 upcoming interviews with Details / Join).
- **Pipeline table:**
  - Search by candidate or job.
  - Status filter.
  - **Shortlisted only** toggle.
  - Sort toggle (ATS ▼▲ / name).
  - Columns: select-all checkbox, per-row checkbox, star (shortlist), Candidate (→ profile), Job, Status chip, ATS score bar.
  - Below 768 px, rows collapse to two-line items.
- **Selection bar** (replaces the filters when rows are selected): "n selected", **Compare** (2–4) or the hint "Select 2–4 to compare", **Move to** menu (six statuses), **Clear selection**.
- **Actions:**
  - `toggleShortlist` — optimistic, rolls back on error.
  - `bulkChangeApplicationStatus` — per-row update with audit and a candidate notification/email.
- **DB:** R `jobs`, `applications`, `users`, `resumes`, `ats_reports`, `interviews`, `audit_logs` (hires); W `applications`, `audit_logs`, `notifications`.
- **Toasts:** "n applications moved to Offer."; errors "n application(s) failed to update.", "Couldn't update the shortlist."
- **Empty state:** "No applications yet." / "No applications match these filters."

#### P14b · Today — `/recruiter` (INTERVIEWER)
- **UI:**
  - Summary line.
  - Amber **overdue feedback** banner (completed interviews more than 24 h past their end without your feedback) with **Write it / both / them** → `/recruiter/feedback`.
  - **Schedule:** your upcoming and live interviews, with local time, candidate (→ detail), job, round and date. **Join** appears 15 min before or when live; otherwise a relative time is shown.
  - **Prep · {next candidate}:** links to the profile and the interview detail.
- **Empty state:** "Nothing scheduled. New invites land here."

#### P15 · Interviews — `/recruiter/interviews`
- **UI:** "Interviews" (recruiter/admin, whole org) or "My interviews" (interviewer, own).
  - **Upcoming and live**, soonest first.
  - **Past**, latest 50: slot has passed, or status is terminal.
  - Rows: local date/time, candidate (→ detail), job · round · duration · panel, status chip, **Join** (if you're a participant and it's still scheduled or live).
  - **Schedule interview** button for recruiter/admin.
- **Empty state:** "Nothing on the calendar." / "No past interviews yet."

#### P16 · Interview detail — `/recruiter/interviews/[id]`
- **Access:** Any org member with a recruiter-side role; not participant-restricted. An id from another org → 404.
- **Header:** Round · duration, candidate (→ profile), job, local time, status chip, **Join interview** (participants, while scheduled or live).
- **Manage row** (RECRUITER/ADMIN only), buttons by status:

  | Status | Buttons |
  |---|---|
  | SCHEDULED | Mark in progress · Mark completed · **Cancel interview** (confirm dialog listing side effects) · **Mark no-show** (confirm dialog) · **Reschedule** (inline form) |
  | IN_PROGRESS | Mark completed · Cancel interview |

  An **interviewer on the panel** (any platform role) gets only *Mark in progress* and *Mark completed*, with a note that cancellations and no-shows belong to a recruiter.
  | COMPLETED | Schedule round N+1 (→ `/recruiter/schedule?applicationId=…&round=N+1`) |

- **Reschedule form:** "Currently" vs "Moving to" (local date & time, duration 15–240), a "This will…" side-effect list, **Keep current time** / **Move interview**.
- **Feedback:**
  - Submitted entries: interviewer, recommendation chip, three scores, notes.
  - **Your feedback** form, for users who are an INTERVIEWER participant: 1–5 radio scales for Coding, Problem solving and Communication; **Evidence** textarea (≤ 5,000, with counter); **Recommendation** (Strong no / No / Hire / Strong hire).
  - **Submit** is disabled until all three ratings and a recommendation are picked. Resubmitting updates your entry.
- **Code:** the last saved editor contents (from `code_documents.finalCode`) and language.
- **Chat:** the transcript with times.
- **Sidebar:** participants; **Recording** (video player with a 15-min signed URL when READY — an expired link shows "The playback link expired" with **Get a new link** — plus status text for other states); **Integrity signals** list (advisory).
- **Actions:**
  - `changeInterviewStatus` — RECRUITER/ADMIN any legal move; anyone holding the INTERVIEWER participant row on this interview may move it to IN_PROGRESS or COMPLETED only (`updateInterviewStatusAsInterviewer`); legal transitions only; optimistic lock.
  - `rescheduleInterviewAction` — SCHEDULED only; interviewer conflict check; bumps the ICS sequence, resets reminders, emails updated invites.
  - `submitFeedbackAction` — must be an INTERVIEWER participant.
- **DB:** R `interviews`, `interview_participants`, `feedback`, `code_documents`, `chat_messages`, `integrity_signals`, `recordings`; W `interviews`, `feedback`, `audit_logs`, `notifications`.
- **Toasts:** "Feedback submitted." / "Feedback updated."; "Interview moved. Updated invites are on their way."; lifecycle errors such as "Cannot move an interview from COMPLETED to CANCELLED." and "This interview was changed by someone else — reload and try again."

#### P17 · Feedback due — `/recruiter/feedback`
- **UI:** Completed interviews where you were an interviewer and haven't submitted feedback, oldest first. Each row shows an **"n days overdue"** amber chip or **"Due in n h"**, plus **Write feedback** (→ detail `#feedback`).
- **Empty state:** "You are clear. Nothing waiting on you."

#### P18 · Candidates — `/recruiter/candidates`
- Same table as P14a. For INTERVIEWER the shortlist star is read-only and **Move to** is hidden; Compare stays available.

#### P19 · Candidate profile — `/recruiter/candidates/[applicationId]`
- **UI:**
  - Job eyebrow, shortlist star (recruiter/admin), name, email, applied date.
  - **Résumé** (opens the file), status dropdown (recruiter/admin) or status chip, **Schedule interview**.
  - Stat row: ATS match, feedback count, interviews count.
  - **Skills against the job**; **Interviewer feedback** averages bars plus recommendation chips; **Interviews** list with feedback per round.
- **Action:** `changeApplicationStatus` (auto-submits on change; rolls back the dropdown on error).
- **Résumé that can't be served:** the download route returns here with `?resume=none|unavailable` and the page shows a short banner — "No résumé to open" or "This résumé can't be opened". The operator-facing reason is logged, never displayed.
- **DB:** R `applications`, `resumes`, `ats_reports`, `interviews`, `feedback`; W `applications`, `audit_logs`, `notifications`.

#### P20 · Compare — `/recruiter/compare?ids=`
- **Purpose:** Side-by-side columns for 2–4 applications.
- **UI:** Status, ATS score, Coding / Problem solving / Communication averages (outright leader in bold), Recommendations (counts), Skills matched, Skills missing, Integrity signals; header shows rounds done per candidate.
- **States:**
  - Missing or invalid `ids`: "Pick candidates to compare" with a link back.
  - An id outside the org: 404.

#### P21 · Jobs — `/recruiter/jobs`
- **UI:** Table of Job, Required skills, Active, Applications, Posted date; **Post job** (not for interviewers).
- **Empty state:** "No jobs yet. Post the first job".

#### P22 · Post a job — `/recruiter/jobs/new`
- **Form:**
  - **Title** — required, ≤ 200.
  - **Description** — required, ≤ 10,000.
  - **Required skills** — comma-separated, optional, ≤ 50 skills × 80 chars, trimmed, empty entries dropped.
- **Buttons:** Cancel / **Post job**.
- **Action:** `createJob`.
- **DB:** W `jobs`, `audit_logs` (`job.created`).
- **Success:** Redirect to `/recruiter/jobs`.
- **Errors:** Shown in a red banner above the fields; the form keeps what you typed.

#### P23 · Add a candidate — `/recruiter/applications/new`
- **Form:** **Job** (select), **Candidate** (select of CANDIDATE users in the org).
- **Action:** `createApplication`. It validates both belong to the org and rejects duplicates: "That candidate has already applied to this job.", shown in a red banner above the fields.
- **DB:** W `applications`, `audit_logs`.
- **Empty states:**
  - "No jobs yet — post one first."
  - "No candidate accounts in this organisation yet…" (the button is disabled).

#### P24 · Schedule an interview — `/recruiter/schedule`
- **Step 1 · Who and how long:**
  - **Application** select (pre-filled from `?applicationId=`).
  - **Duration** chips 30/45/60/90/120, or a **Custom** select (15–240 in 15s).
  - **Interviewers** checklist (RECRUITER, INTERVIEWER and ADMIN users).
  - Side panel shows your timezone.
  - **Find a time** is disabled until an application and at least one interviewer are chosen.
- **Step 2 · Pick a time:**
  - Mon–Fri × 08:00–18:00 local grid by default; **Weekend** adds Sat–Sun and **06:00–22:59** adds early and late hours. Each row label also shows UTC. **‹ This week ›** navigation.
  - Cell states: *All free* (blank), *Some booked* (hatched, names who is busy), *All booked* (grey, disabled), *past* (disabled), *Selected* (black, shows start–end).
  - "Outside these hours? Enter an exact time" (`datetime-local`).
  - Footer shows the chosen slot in local time and UTC; **Back** / **Review**.
- **Step 3 · Review and send:** candidate, job and round, local time + UTC, duration, panel; **What gets sent** list; **Back** / **Confirm and send invites**.
- **Actions:**
  - `loadPanelBusy(interviewerIds, weekStart)` — org-scoped busy intervals.
  - `scheduleInterview` — validates the application is in the org and interviewers are valid; checks conflicts again; creates the interview, participants and audit row in a transaction; emails invites (`.ics`) after commit.
- **DB:** R `interview_participants`, `interviews`; W `interviews`, `interview_participants`, `audit_logs`, `notifications`.
- **Success:** Redirect to `/recruiter/interviews`.
- **Conflict:** Red banner "Someone on the panel was booked into this slot while you were choosing — Nothing was sent." with **Back to the grid**.
- **Empty state:** "No applications to schedule yet. Add a candidate".

#### P25 · Hiring analytics — `/recruiter/analytics`
- **UI:**
  - Date range caption; **30 days / 90 days** toggle (URL `?range=`).
  - **Interview completion:** % completed of decided interviews; completed / no-show / cancelled counts; caveat about unresolved past interviews with a **Resolve them** link.
  - **Hires:** from audit events. **Active applications:** current state, with caveats.
  - Weekly columns for **New applications** and **Hires** (UTC weeks, zero weeks drawn, hover tooltip).
  - **Applications by current status** bars; **Average ATS score by job**, showing scored/total and "—" when unscored.
  - **Interviewers** table: Scheduled, Completed, Feedback given, Outstanding chip ("n outstanding" / "Clear" / "Nothing completed").
- **DB:** R `interviews`, `applications`, `audit_logs`, `jobs`, `resumes`, `ats_reports`, `interview_participants`, `feedback`.

#### P26 · Interview room — `/interview/[id]`
- **Access:** Signed-in users with a participant row for this interview; anyone else gets **404**.
- **Always dark**, whatever the theme setting.
- **Header:** **Leave** (→ interviews list), candidate · job, scheduled time · duration · your role, Recording / Saving recording indicator, connection state (Connecting / Connected / Reconnecting / Disconnected / Session expired), time counter ("mm:ss left", "starts in", "mm:ss over").
- **Banners:**
  - Reconnecting / disconnected.
  - Session expired.
  - Join failed (the realtime service refused or couldn't hydrate the room), with **Reload the room**.
  - Candidate waiting for the interviewer.
  - Interview has ended (status COMPLETED, CANCELLED or NO_SHOW at load).
  - Integrity disclosure (candidates).
- **Editor pane:** language select (javascript, typescript, python, java, cpp, go — synced for everyone), **Run**, "n of m here · synced", Monaco with collaborators' coloured cursors, **Output** panel (status chip, time, memory, stdout/stderr — shown to every participant).
- **Right rail:** video panel (if LiveKit is configured): **Join call**, then tiles plus the LiveKit control bar (mic, camera, screen share, leave). **Participants** with online state; **Chat** (history replayed on join; 2,000-char limit).
- **Floating dock:** **Hide/Show editor** (the call takes the whole room; People / Chat toggles appear), **Full screen**, **Record / Stop recording** (interviewer, when LiveKit + R2 are configured).
- **Integrity signals** (candidate only, advisory): switching tabs, pasting into the editor (length only), leaving full screen. Interviewers see a passing toast.
- **Actions / APIs:**
  - Socket.io to `NEXT_PUBLIC_REALTIME_URL`: `doc:update`, `awareness:update`, `chat:message`, `integrity:signal`.
  - `runCode` → Judge0 → `executions` → broadcast → `getExecutionResult`.
  - `refreshInterviewToken`.
  - `setRecording(start|stop)`.
- **DB:** W `code_documents` (snapshot 10 s after the last edit), `chat_messages`, `integrity_signals`, `executions`, `recordings`, `audit_logs`.

#### P28 · Audit log — `/admin/audit`
- **UI:**
  - Filter bar (GET form, shareable URL): **Action** select (actions present in the log), **Who** select, **Filter**, **Clear**.
  - Table:
    - **When** — UTC date and time.
    - **Who** — actor name, or "System or removed account".
    - **What happened** — a readable sentence, with the machine action and `key=value` meta below it.
    - **Record** — linked to the interview or candidate page when one exists.
  - Pager: **← Newest**, "50 per page…", **Older →** / "End of log".
- **DB:** R `audit_logs`, `users`.
- **Empty states:** "Nothing recorded yet"; filtered → "No entries match" with **Anyone, this action** / **This person, all actions** shortcuts.

#### P29 · Data deletion requests — `/admin/deletion-requests`
- **UI:**
  - **Waiting · n** (oldest first; "GDPR · respond within 30 days"). Each row: candidate name, **Day n of 30** chip (grey < 7, amber ≥ 7, red ≥ 25), email, applications, asked date, **Decline** and **Review and delete**.
  - If the account is already gone: "Account already removed" plus **Close request**.
  - **Processed · last 50:** Deleted / Declined chip, request id, admin, date, reason.
- **Decline dialog:** reason textarea (≥ 3, ≤ 1,000, with counter), **Back** / **Send and decline** (disabled under 3 characters).
- **Delete dialog:**
  - "Counted now" scope: applications, interviews, stored files, sign-in account; audit rows kept.
  - **Type DELETE to confirm** field; **Keep the data** / **Delete permanently** (disabled until the counts load and DELETE is typed exactly).
- **Result panel:** green "Deleted · nothing left behind", or red "Database records deleted · n items did not" listing failed file keys or the Clerk account; **Done** refreshes the page.
- **Actions:**
  - `previewDeletion`.
  - `approveDeletion`: one transaction marks the request COMPLETED; deletes rate-limit rows, applications (cascading résumés, ATS reports, interviews, executions, chat, feedback, signals, recordings) and the user; writes audit `privacy.data_deleted`. **Then** deletes R2 files and the Clerk account.
  - `rejectDeletion`: marks REJECTED with the reason, writes audit, notifies the candidate.
- **Errors:** "Someone else already processed this request."; "That request isn't pending in your organisation."; "This request's account is gone or isn't a candidate account."

### 3.3 Core user flows

```mermaid
flowchart TD
  A[Sign up] --> B[/onboarding: pick role/]
  B -->|Candidate| C[/candidate/]
  B -->|Recruiter or Interviewer| R[/recruiter/]
  C --> J[/jobs → /jobs/id: upload résumé/]
  J --> K[(Application APPLIED + ATS report)]
  R --> P[Pipeline: move status, shortlist, compare]
  P --> S[/recruiter/schedule: panel → grid → confirm/]
  S --> I[(Interview SCHEDULED + invites)]
  I --> RM[/interview/id: editor, chat, video, run/]
  RM --> M[Recruiter or panel interviewer marks COMPLETED]
  M --> F[Interviewer submits feedback]
  F --> CMP[Compare / move to Offer / Hired]
  C --> D[/candidate/data: request deletion/]
  D --> AD[/admin/deletion-requests: approve or decline/]
```

---

## 4. Screenshots of Every Page

All screenshots below were captured from the **running application** on 16 Sep 2026 against the dev database. Signed-in pages use a real test account ("Ashhar Khan"), temporarily switched between roles to reach each role's pages, plus the seed data. The sidebar looks cut off near the bottom of some tall images because it is sticky to the viewport height; that's a capture artefact, not a UI bug.

### Page: Landing
**Route:** `/`

![Landing page](screenshots/landing.png)

**Purpose:** Public entry point.
**How it works:** A static page; no data is loaded.
**Available actions:** **Get started** → `/sign-up`; **Sign in** (header link or button) → `/sign-in`.
**Expected behavior:** Renders for signed-out and signed-in visitors; follows the OS light/dark theme.

### Page: Onboarding
**Route:** `/onboarding`

![Onboarding](screenshots/onboarding.png)

**Purpose:** First-time role selection.
**How it works:** Each row is its own form posting `role` to `setRole`. ADMIN isn't offered.
**Available actions:** **Continue** on Candidate, Recruiter or Interviewer.
**Expected behavior:** A new account lands on its dashboard. An account that already has a role is redirected to its dashboard instead of changing role.

### Page: Pipeline (Recruiter)
**Route:** `/recruiter`

![Recruiter pipeline](screenshots/recruiter-pipeline.png)

**Purpose:** The recruiter's home: every application in the org.
**How it works:** The server loads jobs with applications and their latest ATS score, the 30-day analytics and upcoming interviews. The table is a client component that filters and sorts in the browser.
**Available actions:** Search, status filter, Shortlisted only, sort, star, select rows (then Compare / Move to), open a candidate, Post job, Add candidate, Schedule interview.
**Expected behavior:** Counts match the sidebar badge ("Pipeline 4"); the ATS column shows "—" with an empty track when unscored.

### Page: Pipeline on a phone (collapsed and drawer open)
**Route:** `/recruiter` at 375 px

![Mobile pipeline](screenshots/mobile-pipeline.png) ![Mobile navigation drawer](screenshots/mobile-nav-open.png)

**Purpose:** Responsive shell.
**How it works:** Below 1024 px the sidebar becomes a slide-in drawer (hamburger, top-left); below 768 px table rows become two-line items with a checkbox.
**Available actions:** Open and close the drawer (tap outside or press Esc), navigate, select rows.
**Expected behavior:** No horizontal scrolling; the drawer closes after you pick an item.

### Page: Interviews (Recruiter)
**Route:** `/recruiter/interviews`

![Recruiter interviews](screenshots/recruiter-interviews.png)

**Purpose:** The org's calendar, upcoming and past.
**How it works:** Two queries: upcoming or live, and past (terminal status or slot passed, latest 50).
**Available actions:** Open an interview, **Join** (when you're a participant), **Schedule interview**.
**Expected behavior:** Times show in your timezone. Past interviews that were never resolved still show **Scheduled** (KI-10).

### Page: Interview detail (participant view with feedback form)
**Route:** `/recruiter/interviews/[id]`

![Interview detail with feedback form](screenshots/recruiter-interview-detail.png)

**Purpose:** Manage one interview and review what happened.
**How it works:** Loads the interview with participants, code snapshot, chat, integrity signals, feedback and recording. The feedback form appears because this account is an INTERVIEWER participant.
**Available actions:** Mark in progress / completed, Cancel, Mark no-show, Reschedule, rate 1–5 ×3, write evidence, pick a recommendation, **Submit feedback**, Join interview.
**Expected behavior:** Submit stays disabled until all ratings and a recommendation are chosen. (The long integrity list below this crop is KI-03.)

### Page: Interview detail (recruiter, not a participant)
**Route:** `/recruiter/interviews/seed_interview_alice`

![Interview detail manage view](screenshots/recruiter-interview-detail-manage.png)

**Purpose:** The same page for a recruiter who didn't sit in.
**How it works:** No feedback form or Join button; the management row is shown.
**Available actions:** Lifecycle buttons and Reschedule.
**Expected behavior:** Code shows "Nothing persisted yet — the room hasn't been joined." until someone opens the room.

### Dialog: Cancel interview confirmation
**Route:** `/recruiter/interviews/[id]` → **Cancel interview**

![Cancel interview dialog](screenshots/dialog-cancel-interview.png)

**Purpose:** Prevent an accidental terminal action.
**How it works:** A non-dismissible alert dialog listing side effects: cancellation email plus calendar removal, reminders and recording stopped, audit entry.
**Available actions:** **Keep it** / **Cancel interview**.
**Expected behavior:** Confirming sets status CANCELLED, bumps the ICS sequence and emails everyone; the manage row disappears.

### Page: Candidates (read-only pipeline)
**Route:** `/recruiter/candidates`

![Recruiter candidates](screenshots/recruiter-candidates.png) ![Interviewer candidates](screenshots/interviewer-candidates.png)

**Purpose:** The pipeline list without the dashboard extras. For interviewers (right image) it's read-only.
**Available actions:** Search, filter, sort, select → Compare; recruiter/admin also get star and Move to.
**Expected behavior:** Interviewers never see **Move to**; their stars aren't buttons.

### Page: Candidate profile
**Route:** `/recruiter/candidates/seed_app_alice`

![Candidate profile](screenshots/recruiter-candidate-profile.png)

**Purpose:** Everything about one application.
**Available actions:** Star, **Résumé** download, change status, **Schedule interview**, open an interview round.
**Expected behavior:** Status changes write an audit row and notify the candidate (email for Screening/Interviewing/Offer/Hired/Rejected when Resend is configured).

### Page: Compare candidates
**Route:** `/recruiter/compare?ids=seed_app_alice,seed_app_bob`

![Compare](screenshots/recruiter-compare.png)

**Purpose:** A side-by-side decision view.
**Available actions:** **Change selection** (back to the pipeline); click a name to open the profile.
**Expected behavior:** Fewer than 2 or more than 4 ids shows the "Pick candidates to compare" page; bold marks a single leader only.

### Page: Feedback due
**Route:** `/recruiter/feedback`

![Feedback due](screenshots/recruiter-feedback-due.png)

**Purpose:** Feedback you owe.
**Expected behavior:** Empty ("You are clear…") until an interview you were on is marked Completed, by you from its page or by a recruiter.

### Page: Jobs list, Post a job, Add a candidate
**Routes:** `/recruiter/jobs`, `/recruiter/jobs/new`, `/recruiter/applications/new`

![Jobs list](screenshots/recruiter-jobs.png)
![Post a job](screenshots/recruiter-jobs-new.png)
![Add a candidate](screenshots/recruiter-applications-new.png)

**Purpose:** Manage jobs and attach existing candidate accounts to them.
**Available actions:** Post job (title, description, skills); Add candidate (job + candidate selects).
**Expected behavior:** Success redirects to Pipeline. Validation uses the browser's `required` first, then the server's Zod checks.

### Page: Schedule an interview — step 1, 2, 3
**Route:** `/recruiter/schedule?applicationId=seed_app_bob&round=1`

![Schedule step 1](screenshots/recruiter-schedule-step1.png)
![Schedule step 2](screenshots/recruiter-schedule-step2.png)
![Schedule step 3](screenshots/recruiter-schedule-step3.png)

**Purpose:** Book an interview with a panel that is actually free.
**How it works:**
- Step 1 collects the application, duration and panel.
- Step 2 fetches the panel's bookings for the displayed week and colours each hourly slot.
- Step 3 shows exactly what will be sent.
- Confirm re-checks conflicts on the server.

**Available actions:** Duration chips / Custom, interviewer checkboxes, **Find a time**, week ‹ › / This week, click a slot, exact time input, **Review**, **Edit any of this**, **Confirm and send invites**.
**Expected behavior:** Nothing is written or sent before step 3. Success lands on `/recruiter/interviews` with the new interview under "Upcoming and live".

### Page: Hiring analytics (light and dark)
**Route:** `/recruiter/analytics`

![Analytics light](screenshots/recruiter-analytics.png)
![Analytics dark](screenshots/dark-analytics.png)

**Purpose:** Hiring health over 30 or 90 days.
**Available actions:** Switch range, hover or focus weekly columns for tooltips, **Resolve them** link.
**Expected behavior:** "—" instead of 0% when there are no outcomes. Dark mode keeps chips legible. (Right column clipped: KI-07.)

### Page: Interview room
**Route:** `/interview/[id]`

![Interview room](screenshots/interview-room.png)

**Purpose:** The live interview.
**How it works:** The page mints a room token and, if configured, a LiveKit token. The client connects to the realtime service, syncs the Yjs document into Monaco, and replays chat. *In this capture the Monaco editor contents aren't rendered (a limitation of the capture tool) and LiveKit wasn't configured, so the video panel shows the not-joined state.*
**Available actions:** Leave, change language, Run, Join call, chat, Hide editor, Full screen, Record (interviewer, when configured).
**Expected behavior:** A second participant's typing appears in real time; presence changes to "Interviewer/Candidate" when they connect; output appears for everyone.

### Page: Today (Interviewer)
**Route:** `/recruiter` as INTERVIEWER

![Interviewer today](screenshots/interviewer-today.png) ![My interviews](screenshots/interviewer-my-interviews.png)

**Purpose:** An interviewer's day; right image is **My interviews**.
**Expected behavior:** Only interviews where you're an INTERVIEWER participant; no Schedule, Jobs or Analytics in the sidebar; `/recruiter/schedule` and `/admin/*` redirect back to `/recruiter`.

### Page: Audit log (and filtered-to-nothing)
**Route:** `/admin/audit`

![Audit log](screenshots/admin-audit.png)
![Audit log empty state](screenshots/admin-audit-empty.png)

**Purpose:** Append-only record of org changes.
**Available actions:** Filter by action and person, Clear, page Older / Newest, open linked records.
**Expected behavior:** Filters live in the URL (reload keeps them). The empty-state wording bug is KI-06.

### Page: Data deletion requests
**Route:** `/admin/deletion-requests`

![Deletion requests](screenshots/admin-deletion-requests.png)

**Purpose:** Process candidates' GDPR deletion requests.
**Expected behavior:** Empty in this capture: "No requests waiting." / "Nothing processed yet."

### Page: Candidate overview, applications, interviews
**Routes:** `/candidate`, `/candidate/applications`, `/candidate/interviews`

![Candidate overview](screenshots/candidate-overview.png)
![Candidate applications](screenshots/candidate-applications.png)
![Candidate interviews](screenshots/candidate-interviews.png)

**Purpose:** The candidate's view of their progress. These captures use an account with no applications, so they show the **empty states**.
**Available actions:** Browse open jobs, Start practising, Request deletion, Open room (when an interview exists).

### Page: Your data + deletion request dialog
**Route:** `/candidate/data`

![Your data](screenshots/candidate-data.png)
![Request deletion dialog](screenshots/dialog-request-deletion.png)

**Purpose:** Privacy transparency and the right to deletion.
**Available actions:** **Request deletion of my data** → **Keep my data** / **Send request**.
**Expected behavior:** After sending, the page shows "Deletion requested" and every admin gets a notification.

### Page: Not found (404)
**Route:** any unknown route, or a record you may not see

![404 inside the app shell](screenshots/not-found.png)

**Purpose:** A dead end that keeps you oriented instead of dropping you on a stack trace.
**How it works:** Each section has its own `not-found.tsx`, so the 404 renders inside that section's shell with a back link that suits it. `notFound()` is also the answer for "exists, but isn't yours", so the copy never confirms a record exists. Outside the shell (root, interview room) the page shows the wordmark instead.
**Available actions:** Back to the pipeline / your overview / the audit log / open positions / the home page.
**Expected behavior:** HTTP 404; the sidebar, bell and avatar keep working.

### Page: Form error (inline)
**Route:** `/recruiter/applications/new` (same pattern on `/recruiter/jobs/new`)

![Inline form error](screenshots/form-inline-error.png)

**Purpose:** Show a rejected submission where the recruiter is already looking, without losing what they typed.
**How it works:** The Server Action returns the message instead of throwing; the form renders it as a red callout above the fields and keeps the current selections. Real faults still throw and reach the error boundary.
**Available actions:** Fix the selection and submit again, or Cancel.
**Expected behavior:** No navigation, no lost input, nothing written to the database.

### Page: Résumé that can't be opened
**Route:** `/recruiter/candidates/[applicationId]?resume=unavailable`

![Résumé unavailable banner](screenshots/resume-unavailable.png)

**Purpose:** Explain a failed download in one line, where the recruiter clicked.
**How it works:** The download route redirects here with a reason. Two outcomes are shown — "No résumé to open" (nothing was uploaded) and "This résumé can't be opened" (a file exists but can't be served). Which of the two underlying causes applies is written to the server log instead of the page.
**Available actions:** Carry on with the profile — the ATS match, feedback and interviews are unaffected.
**Expected behavior:** Amber banner, no vendor names, no environment variables, no stack traces.

### Page: Notifications
**Route:** `/notifications` (any role; `/candidate/notifications` redirects)

![Notifications](screenshots/candidate-notifications.png)

**Expected behavior:** Lists the last 50 notifications; **Mark all read** clears unread styling and the bell badge.

### Page: Open positions and Job detail
**Routes:** `/jobs`, `/jobs/seed_job_frontend`

![Open positions](screenshots/jobs-list.png)
![Job detail with apply form](screenshots/job-detail-apply.png)

**Purpose:** Find a job and apply with a résumé.
**Available actions:** Open a job, click or drag a file into the drop zone, **Submit application**.
**Expected behavior:** Success → `/candidate` showing the new application (Applied); the ATS report appears once scoring finishes.

### Page: Practice
**Route:** `/candidate/practice`

![Practice](screenshots/candidate-practice.png)

**Purpose:** A solo coding warm-up in the real editor. *Editor contents aren't rendered in this capture.*
**Available actions:** Pick a problem, change language, Reset code, edit stdin, Run.
**Expected behavior:** Runs-left counter decreases by one per run and resets on a rolling hour.

### Screenshots still required (capture manually)

These states need data or services that weren't available during this capture. Capture them with your OS screenshot tool (macOS <kbd>⇧⌘4</kbd>, Windows <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>) and add them to `docs/handoff/screenshots/` using the file name given.

| File name | State | How to reach it |
|---|---|---|
| `sign-in.png` / `sign-up.png` | Clerk forms | A private window (signed out) → `/sign-in`, `/sign-up` |
| `candidate-ats-report.png` | ATS report with score, skills, suggestions | As a candidate, apply to a job with a text PDF → Applications → **Open** |
| `ats-polish.png` | Polish suggestions | On the ATS report with `GEMINI_API_KEY` set → **Polish** |
| `pipeline-selection.png` | Selection bar with Compare / Move to | Pipeline → tick 2 rows |
| `bell-dropdown.png` | Notification dropdown | Click the bell when there are unread notices |
| `schedule-conflict.png` | Conflict banner in step 3 | Two recruiters book the same interviewer and slot; confirm the second |
| `reschedule-form.png` | Inline reschedule | Interview detail (SCHEDULED) → **Reschedule** |
| `feedback-submitted.png` | Submitted feedback entry | Interview detail → submit feedback |
| `room-two-users.png` | Room with two people, code, output | Two browsers as candidate and interviewer, Judge0 running → type and **Run** |
| `room-video.png` | Video joined, recording on | LiveKit + R2 configured → **Join call** → **Record** |
| `room-reconnecting.png` | Reconnecting banner | Stop `apps/realtime` while in the room |
| `room-waiting.png` | Candidate waiting banner | Open the room as the candidate only |
| `deletion-confirm.png` / `deletion-decline.png` / `deletion-result.png` | Admin deletion dialogs and result | Candidate requests deletion → admin → **Review and delete** / **Decline** |

---

## 5. Complete Manual Testing Plan

### 5.0 How to run this plan

- **Environment:** Local (section 2) unless a test says otherwise. Record the browser, OS and branch or commit in every bug report.
- **Accounts:** the four QA accounts from section 2.6: **CAND**, **REC**, **INT**, **ADM**. Run `npm run db:seed` first so the seeded jobs and applications exist.
- **Test files:**
  - `resume-ok.pdf`: a text PDF under 1 MB listing skills like TypeScript and PostgreSQL.
  - `resume-ok.docx`.
  - `resume-scan.pdf`: an image-only scan.
  - `resume-big.pdf`: over 5 MB.
  - `resume.txt`.
  - `resume.pdf.exe`, renamed to end in `.pdf`.
- **Status values:** **Pass** · **Fail** · **Blocked** (a dependency is missing, e.g. no Judge0) · **N/A**.
- **Column use:** fill *Actual Result* only when it differs from *Expected Result*; otherwise write "as expected".
- **IDs:** prefix = area, number = order. Tests marked **(R)** are also in the regression suite (5.7).

### 5.1 Functional testing

#### Setup & health

| Test ID | Feature | Test Scenario | Preconditions | Steps | Test Data | Expected Result | Actual Result | Status | Tester Notes |
|---|---|---|---|---|---|---|---|---|---|
| SET-01 (R) | Dev servers | Both apps start | Env files filled | 1. `npm run dev`<br>2. Open `http://localhost:3000`<br>3. `curl localhost:4000/healthz` | — | Landing page renders; realtime returns `ok`; no red errors in terminal | | | |
| SET-02 | Database | Migrations apply cleanly | Empty personal DB branch | 1. `npm run db:migrate`<br>2. `npm run db:studio` | — | 18 tables listed in Studio | | | |
| SET-03 | Seed | Seed is idempotent | SET-02 | 1. `npm run db:seed` twice | — | Both runs print "Seeded org "default" — 6 users, 2 jobs, 3 applications, 1 interview."; no duplicates in Studio | | | |
| SET-04 | Quality gates | Repo checks pass | Deps installed | 1. `npm run typecheck && npm run lint && npm test && npm run build` | — | All four succeed (lint may show 1 pre-existing warning) | | | |
| SET-05 | set-role script | Grant ADMIN | Account signed up | 1. `npm run set-role --workspace=web -- <email> ADMIN`<br>2. Sign out/in | ADM email | Prints `<email> → ADMIN`; sidebar shows Administration section | | | |
| SET-06 | set-role npm script | Unknown account is refused | — | 1. `npm run set-role --workspace=web -- nobody@example.invalid ADMIN` | — | Prints "No Clerk user found for nobody@example.invalid" and changes nothing — proves the script read `CLERK_SECRET_KEY` from `.env.local` (KI-01 regression check) | | | |

#### Authentication & onboarding

| Test ID | Feature | Test Scenario | Preconditions | Steps | Test Data | Expected Result | Actual Result | Status | Tester Notes |
|---|---|---|---|---|---|---|---|---|---|
| AUTH-01 (R) | Sign up | New account reaches onboarding | Signed out | 1. `/` → Get started<br>2. Complete Clerk sign-up (verify email code) | new `+alias` email | Redirected to `/onboarding` | | | |
| AUTH-02 (R) | Onboarding | Pick Candidate | AUTH-01 | 1. Click **Continue** on Candidate | — | Lands on `/candidate`; `users` row created with role CANDIDATE in org `default`; Clerk `publicMetadata.role = CANDIDATE` | | | |
| AUTH-03 | Onboarding | Pick Recruiter / Interviewer | New accounts | 1. Continue on Recruiter (and separately Interviewer) | — | Both land on `/recruiter`; Recruiter sees Pipeline, Interviewer sees Today | | | |
| AUTH-04 | Onboarding | Cannot change role once set | CAND signed in | 1. Visit `/onboarding`<br>2. Click Continue on Recruiter | — | Redirected to `/candidate`; role unchanged | | | |
| AUTH-05 (R) | Sign in | Existing user signs in | REC exists, signed out | 1. `/sign-in`<br>2. Enter credentials | REC | Lands on `/recruiter` (via onboarding redirect) | | | |
| AUTH-06 | Sign in | Wrong password | Signed out | 1. `/sign-in`, wrong password | REC email + `wrong` | Clerk inline error; no session | | | |
| AUTH-07 (R) | Sign out | Sign out from avatar | Signed in | 1. Avatar → Sign out | — | Returns to `/`; visiting `/recruiter` redirects to `/sign-in?redirect_url=…` | | | |
| AUTH-08 | Session | Persists across reload / new tab | Signed in | 1. Reload<br>2. Open a new tab at `/recruiter` | — | Still signed in | | | |
| AUTH-09 | Redirect back | Deep link after sign-in | Signed out | 1. Open `/recruiter/analytics`<br>2. Sign in as REC | — | Returns to `/recruiter/analytics` | | | |
| AUTH-10 | Missing session-token customisation | Role claim absent | Clerk session customisation removed (throwaway Clerk instance only) | 1. Sign in with a roled account | — | Loops to `/onboarding` (documented failure) — restore setting afterwards | | | |

#### Authorization (role-based access)

| Test ID | Feature | Test Scenario | Preconditions | Steps | Test Data | Expected Result | Actual Result | Status | Tester Notes |
|---|---|---|---|---|---|---|---|---|---|
| RBAC-01 (R) | Middleware | Candidate blocked from recruiter area | CAND signed in | 1. Visit `/recruiter`, `/recruiter/analytics`, `/admin/audit` | — | Each redirects to `/candidate` | | | |
| RBAC-02 (R) | Middleware | Recruiter blocked from candidate & admin | REC signed in | 1. Visit `/candidate`, `/jobs`, `/admin/audit` | — | Redirected to `/recruiter` | | | |
| RBAC-03 (R) | Page guard | Interviewer blocked from recruiter-only pages | INT signed in | 1. Visit `/recruiter/schedule`, `/recruiter/jobs/new`, `/recruiter/applications/new`, `/recruiter/analytics`, `/admin/audit` | — | Each redirects to `/recruiter` (Today) | | | |
| RBAC-04 | Page guard | Interviewer can read shared pages | INT | 1. Visit `/recruiter/interviews`, `/recruiter/candidates`, a candidate profile, `/recruiter/compare?ids=seed_app_alice,seed_app_bob`, `/recruiter/jobs` | — | All render; no Move to, no shortlist buttons, no status dropdown, no Post job | | | |
| RBAC-05 | Admin | Admin sees everything recruiter sees + admin | ADM | 1. Check sidebar<br>2. Open Audit log and Deletion requests | — | Administration section present; both pages load | | | |
| RBAC-06 (R) | Room access | Non-participant cannot open a room | REC not on interview X | 1. Open `/interview/<X id>` | seed_interview_alice | **404** page (same as a non-existent id) | | | |
| RBAC-07 | ATS report | Candidate can't open another candidate's report | CAND | 1. Open `/candidate/applications/seed_app_alice/ats` | — | 404 | | | |
| RBAC-08 | Server Action | Interviewer can't change status via action | INT, DevTools | 1. On a profile page, re-issue a `changeApplicationStatus` request copied from a REC session (Network tab → Copy as fetch) with INT cookies | — | Request fails (redirect or error); status unchanged in DB | | | |
| RBAC-09 | Résumé route | Candidate can't download résumés | CAND | 1. Open `/recruiter/candidates/seed_app_alice/resume` | — | Redirected to `/candidate` | | | |

#### Candidate: jobs, apply, ATS, practice, privacy

| Test ID | Feature | Test Scenario | Preconditions | Steps | Test Data | Expected Result | Actual Result | Status | Tester Notes |
|---|---|---|---|---|---|---|---|---|---|
| CAND-01 (R) | Job board | List shows org jobs | Seeded | 1. CAND → Browse jobs | — | Backend and Frontend Engineer with applicant counts and skills | | | |
| CAND-02 (R) | Apply | Apply with a valid PDF | CAND hasn't applied to Frontend | 1. Open Frontend Engineer<br>2. Choose `resume-ok.pdf`<br>3. Submit application | resume-ok.pdf | Redirect to `/candidate`; application listed as **Applied**; DB: `applications` + `resumes` rows, `audit_logs` `application.created` | | | |
| CAND-03 | Apply | Apply with DOCX via drag & drop | Another job available | 1. Drag `resume-ok.docx` onto the drop zone<br>2. Submit | resume-ok.docx | File name shows in the zone; application created | | | |
| CAND-04 | Apply | Already applied | CAND-02 done | 1. Reopen the same job | — | Green "You have applied to this position" banner; no form | | | |
| CAND-05 (R) | ATS | Report generated | CAND-02, wait ~10 s | 1. Applications → **Open** | — | Score /100, source (AI with model name, or keyword analysis), skills Matched/Partial/Missing, suggestions | | | |
| CAND-06 | ATS | Heuristic fallback | `GEMINI_API_KEY` empty, restart web | 1. Apply to a job<br>2. Open report | — | Report exists with "Scored by keyword analysis"; `ats_reports.source = HEURISTIC` | | | |
| CAND-07 | Polish | Résumé polish suggestions | Gemini configured | 1. On report click **Polish** | — | Section suggestions with original (struck), suggestion, reason | | | |
| CAND-08 | Polish | Limit of 3 | CAND-07 | 1. Polish 3 more times | — | 4th request shows a limit error; `rate_limit_hits` has 3 `polish:<appId>` rows | | | |
| CAND-09 | Polish | Not configured | Gemini unset | 1. Click Polish | — | "Resume polishing is not available — AI service not configured." | | | |
| CAND-10 (R) | Overview | Next interview panel | CAND has an upcoming interview | 1. Open `/candidate` | — | Dark panel with local time, relative time, round, interviewers, **Open interview room** | | | |
| CAND-11 | Interviews | Upcoming and history | CAND with interviews | 1. Open Interviews | — | Upcoming with Open room; History with status chips | | | |
| CAND-12 | Practice | Run FizzBuzz | Judge0 running | 1. Practice → FizzBuzz<br>2. Write solution<br>3. Run with stdin 15 | Python solution | Output shows 1…FizzBuzz; checked against expected; counter "29 of 30" | | | |
| CAND-13 | Practice | Judge0 down | Judge0 stopped | 1. Run | — | FAILED "The execution service is unavailable…"; counter unchanged (refunded) | | | |
| CAND-14 | Practice | Hourly limit | — | 1. Run 30 times within an hour<br>2. Run once more | — | 31st: "You've used all 30 practice runs for this hour. Try again later." | | | |
| CAND-15 | Practice | Problem switch / reset | — | 1. Edit code<br>2. Switch problem<br>3. Reset code | — | Starter code restored for the problem | | | |
| CAND-16 (R) | Privacy | Request deletion | CAND, no pending request | 1. Your data → Request deletion of my data<br>2. Send request | — | Toast "Request sent…"; banner "Deletion requested"; DB `data_deletion_requests` PENDING; each ADMIN gets a notification | | | |
| CAND-17 | Privacy | Request twice | CAND-16 | 1. Reload Your data | — | No button; single PENDING row in DB | | | |
| CAND-18 | Privacy | Dialog cancel | No pending request | 1. Open dialog<br>2. Keep my data | — | Dialog closes; nothing created | | | |
| CAND-19 | Notifications | Page and mark all read | CAND with unread notices | 1. Open the bell, then **View all notifications**<br>2. Mark all read | — | Unread styling removed; bell badge disappears within 30 s | | | |

#### Recruiter: pipeline, profile, jobs, compare

| Test ID | Feature | Test Scenario | Preconditions | Steps | Test Data | Expected Result | Actual Result | Status | Tester Notes |
|---|---|---|---|---|---|---|---|---|---|
| PIPE-01 (R) | Pipeline | Loads with counts | REC, seeded | 1. Open `/recruiter` | — | Stat row, table rows for every application, sidebar Pipeline count = active applications | | | |
| PIPE-02 | Search | Filter by candidate/job text | PIPE-01 | 1. Type `bob`<br>2. Type `frontend` | — | Only matching rows; case-insensitive | | | |
| PIPE-03 | Filter | Status filter | — | 1. Choose Screening | — | Only Screening rows; empty message when none | | | |
| PIPE-04 | Filter | Shortlisted only | ≥1 starred | 1. Toggle Shortlisted only | — | Only starred rows; button shows pressed state | | | |
| PIPE-05 | Sort | ATS and name | — | 1. Click "sorted by ATS ▼"<br>2. Click Candidate header<br>3. Click again | — | Order toggles; unscored rows sort last on ATS desc | | | |
| PIPE-06 (R) | Shortlist | Star toggles and persists | REC | 1. Click ☆ on Bob<br>2. Reload | — | ★ stays; DB `applications.shortlistedAt` set; audit `application.shortlisted` | | | |
| PIPE-07 (R) | Bulk status | Move two applications | REC | 1. Tick Bob and Carol<br>2. Move to → Screening | — | Toast "2 applications moved to Screening."; chips update; 2 audit rows; candidates notified | | | |
| PIPE-08 | Select all | Header checkbox | — | 1. Tick header<br>2. Untick one row | — | All rows selected; header shows indeterminate after untick | | | |
| PIPE-09 (R) | Compare | 2–4 selection opens compare | REC | 1. Tick 2 rows → Compare | — | `/recruiter/compare?ids=…` shows both columns | | | |
| PIPE-10 | Compare | Wrong count | — | 1. Tick 1 row; then 5 rows | 5 applications | Hint "Select 2–4 to compare"; no Compare button | | | |
| PIPE-11 | Compare | Invalid ids | — | 1. Open `/recruiter/compare?ids=x` and `?ids=a,b` (random) | — | First: "Pick candidates to compare"; second: 404 | | | |
| PROF-01 (R) | Profile | Status change from dropdown | REC | 1. Open Alice<br>2. Change status to Offer | — | Persists after reload; audit row; candidate notification (+ email if Resend) | | | |
| PROF-02 | Profile | Résumé download | R2 configured, application with file | 1. Click Résumé | — | PDF opens inline (DOCX downloads); headers `Content-Security-Policy: sandbox`, `Cache-Control: private, no-store` | | | |
| PROF-03 (R) | Profile | Résumé that can't be served | R2 not configured (or file deleted) | 1. Click Résumé<br>2. Check the `npm run dev` terminal | — | Returns to the profile with "This résumé can't be opened" (or "No résumé to open" when none was uploaded); URL carries `?resume=unavailable\|none`; **no environment variable or vendor name appears on screen**; the terminal logs the real cause | | | |
| PROF-04 | Profile | Schedule from profile | REC | 1. Click Schedule interview | — | Schedule page with application pre-selected and next round number | | | |
| JOB-01 (R) | Post job | Create a job | REC | 1. Jobs → Post job<br>2. Fill fields<br>3. Post job | Title "QA Engineer", skills "Playwright, TypeScript, , SQL " | Redirect to the Jobs list showing it with skills `Playwright, TypeScript, SQL`; audit `job.created` | | | |
| JOB-02 | Add candidate | Attach candidate to job | REC; a CANDIDATE account exists | 1. Add candidate<br>2. Pick job and candidate<br>3. Add | — | Row appears in Pipeline as Applied | | | |
| JOB-03 (R) | Add candidate | Duplicate | JOB-02 done | 1. Repeat same pair | — | Red banner "The candidate wasn't added — That candidate has already applied to this job." above the fields; selections kept; no new row in `applications` | | | |
| JOB-04 | Jobs list | Counts | Jobs with applications | 1. Open `/recruiter/jobs` | — | Active excludes Hired/Rejected; Applications = total | | | |

#### Scheduling & interview lifecycle

| Test ID | Feature | Test Scenario | Preconditions | Steps | Test Data | Expected Result | Actual Result | Status | Tester Notes |
|---|---|---|---|---|---|---|---|---|---|
| SCH-01 (R) | Schedule | Happy path | REC; INT exists | 1. Schedule<br>2. Pick Bob, 45 min, tick INT<br>3. Find a time<br>4. Click a free future slot<br>5. Review<br>6. Confirm | — | Redirect to Interviews; new row under Upcoming with panel = INT; DB `interviews` SCHEDULED + 2 `interview_participants` (CANDIDATE, INTERVIEWER); audit `interview.scheduled`; notifications for both | | | |
| SCH-02 | Step 1 | Find a time disabled | — | 1. Untick all interviewers | — | **Find a time** disabled | | | |
| SCH-03 | Duration | Custom durations | — | 1. Custom → 135 min<br>2. Pick slot | — | Selected cell shows a 2 h 15 m range | | | |
| SCH-04 (R) | Conflict display | Busy panel shown in grid | INT already booked Tue 10:00 | 1. Schedule with INT<br>2. Go to that week | — | Tue 10:00 cell grey/disabled (all booked); with 2 interviewers, hatched "<name> booked" | | | |
| SCH-05 | Week nav | Previous / next / this week | — | 1. › twice<br>2. This week | — | Header dates change; busy re-read ("reading calendars…") | | | |
| SCH-06 | Past slots | Cannot pick past | Viewing current week | 1. Click an earlier-today cell | — | Nothing selected (disabled) — note visual gap KI-05 | | | |
| SCH-07 | Exact time | Outside grid hours | — | 1. Enter Sat 20:00 in exact time<br>2. Review | — | Summary shows that local time + UTC | | | |
| SCH-08 (R) | Race | Conflict caught on confirm | Two REC sessions | 1. Both schedule INT at same slot to step 3<br>2. Confirm first<br>3. Confirm second | — | Second shows red "Someone on the panel was booked… Nothing was sent." + Back to the grid; no second interview in DB | | | |
| SCH-09 | Emails | Invites sent | Resend configured | 1. SCH-01 | real inboxes | Candidate & interviewer receive email with join link and `invite.ics` (METHOD REQUEST) in the right local time | | | |
| LIFE-01 (R) | Status | Mark in progress → completed | REC, SCHEDULED interview | 1. Mark in progress<br>2. Mark completed | — | Chip updates each time; audit `interview.status_changed` ×2; "Schedule round 2" appears | | | |
| LIFE-02 (R) | Cancel | Cancel with confirm | SCHEDULED interview | 1. Cancel interview<br>2. Keep it<br>3. Cancel interview → confirm | — | Keep it closes with no change; confirm sets CANCELLED; `icsSequence` +1; cancellation email (METHOD CANCEL) | | | |
| LIFE-03 | No-show | Mark no-show | SCHEDULED | 1. Mark no-show → confirm | — | NO_SHOW; no email to candidate | | | |
| LIFE-04 | Illegal transition | Stale page | Interview completed in another tab | 1. On stale page click Cancel → confirm | — | Toast "Cannot move an interview from COMPLETED to CANCELLED." or "changed by someone else — reload" | | | |
| LIFE-05 (R) | Reschedule | Move time | SCHEDULED | 1. Reschedule<br>2. New date/time, 60<br>3. Move interview | — | Toast "Interview moved…"; time updated; `reminder24hSentAt/1hSentAt` null; `icsSequence` +1; updated invites | | | |
| LIFE-06 | Reschedule | Conflict | Panel busy at target time | 1. Reschedule into a busy slot | — | Error "One or more interviewers are already booked at that time." | | | |
| LIFE-07 | Reschedule | Only SCHEDULED | IN_PROGRESS interview | 1. Open detail | — | No Reschedule button | | | |
| LIFE-08 | Next round | Schedule round N+1 | COMPLETED | 1. Click Schedule round 2 | — | Schedule page shows "Round 2 · from <name>'s application" | | | |
| REM-01 | Reminders | Cron sends due reminders | Interview in 50 min, `CRON_SECRET` set | 1. `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/reminders` | — | JSON result; 1 h reminder notification/email; `reminder1hSentAt` set; repeat call sends nothing | | | |

#### Feedback

| Test ID | Feature | Test Scenario | Preconditions | Steps | Test Data | Expected Result | Actual Result | Status | Tester Notes |
|---|---|---|---|---|---|---|---|---|---|
| FB-01 (R) | Feedback | Submit | INT is participant | 1. Open interview detail<br>2. Rate 4,3,5<br>3. Evidence text<br>4. Hire<br>5. Submit feedback | "Sorted then merged" | Toast "Feedback submitted."; entry listed with Hire chip and scores; DB `feedback` row | | | |
| FB-02 | Feedback | Submit disabled until complete | — | 1. Rate only two criteria | — | Submit disabled; note "Rate all three and pick a recommendation" | | | |
| FB-03 | Feedback | Resubmit updates | FB-01 | 1. Change recommendation to Strong hire<br>2. Update feedback | — | Still one entry (unique per interviewer); updated values | | | |
| FB-04 | Feedback | Non-interviewer can't see form | REC not a participant | 1. Open same detail | — | No "Your feedback" form | | | |
| FB-05 (R) | Feedback due | Due list and overdue banner | Interview COMPLETED > 24 h ago, INT no feedback | 1. INT → Today<br>2. Feedback due | — | Amber overdue banner; row "n days overdue" + Write feedback link to `#feedback` | | | |
| FB-06 | Profile / compare | Averages | Feedback exists | 1. Open profile and compare | — | Averages & recommendation counts reflect submitted feedback | | | |

#### Interview room & realtime

| Test ID | Feature | Test Scenario | Preconditions | Steps | Test Data | Expected Result | Actual Result | Status | Tester Notes |
|---|---|---|---|---|---|---|---|---|---|
| ROOM-01 (R) | Room | Both participants join | SCH-01 interview; two browsers (CAND, INT); realtime running | 1. CAND opens room from Interviews<br>2. INT opens room | — | Both "Connected"; Participants show both online; CAND sees disclosure text | | | |
| ROOM-02 (R) | Editor | Live sync & cursors | ROOM-01 | 1. CAND types code<br>2. INT edits a line | — | Changes appear on the other side in < 1 s; remote cursor with name colour | | | |
| ROOM-03 | Language | Shared language switch | ROOM-01 | 1. INT selects python | — | CAND's select and highlighting switch to python | | | |
| ROOM-04 (R) | Persistence | Code survives reload | ROOM-02 | 1. Close both tabs<br>2. Wait 15 s<br>3. Reopen | — | Code still there; detail page Code section shows it; DB `code_documents.finalCode` non-empty | | | |
| ROOM-05 (R) | Chat | Send and history | ROOM-01 | 1. Send message<br>2. Other reloads | "hello" | Message appears for both with name and time; replayed after reload; DB `chat_messages` row | | | |
| ROOM-06 | Chat | Rate limit | — | 1. Send 25 messages in 10 s (paste + Enter quickly) | — | Messages beyond 20 in the window are silently dropped | | | |
| ROOM-07 (R) | Run | Execute and share output | Judge0 running | 1. Candidate clicks Run on valid JS | `console.log(2+2)` | Output panel on **both** screens: Succeeded, `4`, time & memory; DB `executions` SUCCEEDED | | | |
| ROOM-08 | Run | Compile/runtime error | — | 1. Run `throw new Error("x")` | — | Failed chip, stderr shown to both | | | |
| ROOM-09 | Run | Judge0 down | Judge0 stopped | 1. Run | — | Failed "The execution service is unavailable…" for both | | | |
| ROOM-10 (R) | Integrity | Candidate signals | ROOM-01 | 1. CAND switches tab, pastes into editor, enters+exits full screen | — | INT sees toasts; interview detail lists Switched away / Pasted (n characters) / Left full screen; nothing recorded when INT does the same | | | |
| ROOM-11 | Reconnect | Realtime restart | ROOM-01 | 1. Stop `apps/realtime` (Ctrl-C in its terminal or kill the process)<br>2. Observe<br>3. Restart | — | Amber "Connection lost — reconnecting" banner; editor keeps local edits; reconnects and syncs after restart | | | |
| ROOM-12 | Waiting | Candidate alone | Only CAND in room | 1. Open room as CAND | — | Info banner "Waiting for <interviewer>" | | | |
| ROOM-13 | Hide editor | Call owns room | LiveKit configured | 1. Hide editor<br>2. People / Chat toggles<br>3. Show editor | — | Video fills area; side panel toggles; call does **not** disconnect when toggling | | | |
| ROOM-14 | Full screen | Toggle | — | 1. Full screen<br>2. Esc | — | Enters/leaves; button label changes | | | |
| ROOM-15 | Ended | Banner for closed interview | Interview COMPLETED | 1. Open room | — | Info banner "This interview is complete" + Back to interviews | | | |
| VID-01 | Video | Join call | LiveKit configured; 2 browsers | 1. Both click Join call; allow camera/mic | — | Both tiles visible; LiveKit control bar toggles mic/cam; screen share works | | | |
| VID-02 | Video | Permission denied | Block camera in browser | 1. Join call | — | Red "Could not join the call" with allow-permissions guidance | | | |
| REC-01 | Recording | Start / stop | LiveKit + R2 + webhook | 1. INT Record<br>2. Wait 1 min<br>3. Stop recording | — | "Recording" pulse for both; after stop "Saving recording"; later detail page plays video; DB `recordings` READY | | | |
| REC-02 | Recording | Not configured | LiveKit or R2 missing | 1. Open room as INT | — | No Record button in dock | | | |
| REC-03 | Retention | Sweep | `RECORDING_RETENTION_DAYS=1`, READY recording older than 1 day | 1. `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/retention` | — | JSON `recordingsExpired ≥ 1`; recording EXPIRED; detail shows retention message | | | |

#### Notifications, analytics, admin

| Test ID | Feature | Test Scenario | Preconditions | Steps | Test Data | Expected Result | Actual Result | Status | Tester Notes |
|---|---|---|---|---|---|---|---|---|---|
| NOTIF-01 (R) | Bell | Unread badge and dropdown | Event created (e.g. PIPE-07) | 1. As the notified user wait ≤ 30 s<br>2. Click bell | — | Red count badge; dropdown lists title, body, time ago; clicking an item navigates | | | |
| NOTIF-02 | Bell | Mark all read | NOTIF-01 | 1. Mark all read | — | List empties; badge gone; DB `notifications.readAt` set | | | |
| ANL-01 (R) | Analytics | Loads 30 days | REC | 1. Open Analytics | — | Stat row, 2 weekly charts, status bars, ATS by job, interviewers table | | | |
| ANL-02 | Analytics | 90-day range | — | 1. Click 90 days | — | URL `?range=90`; caption dates move back 90 days; more weekly columns | | | |
| ANL-03 | Analytics | Invalid range | — | 1. Open `?range=7` | — | Falls back to 30 days | | | |
| ANL-04 | Analytics | Completion math | Known outcomes | 1. Mark 1 completed, 1 no-show, 1 cancelled in range | — | Completion = 33%; counts "1 completed · 1 no-show · 1 cancelled" | | | |
| ANL-05 | Analytics | Hires from audit | — | 1. Move an application to Hired<br>2. Reload | — | Hires +1 and this week's Hires column +1 | | | |
| AUD-01 (R) | Audit | Log shows recent actions | ADM; actions done earlier | 1. Open Audit log | — | Newest first; readable sentences; action + meta line; record links open the right page | | | |
| AUD-02 | Audit | Filter by action and person | — | 1. Action = application.status_changed<br>2. Who = REC<br>3. Filter<br>4. Reload | — | Only matching rows; filters persist in URL after reload; Clear resets | | | |
| AUD-03 | Audit | Paging | > 50 entries | 1. Older →<br>2. ← Newest | — | Next 50 without duplicates; back to first page | | | |
| AUD-04 | Audit | Empty filter | — | 1. Filter to a combination with no rows | — | "No entries match" + shortcuts (wording bug KI-06 when actor unknown) | | | |
| DEL-01 (R) | Deletion | Decline with reason | CAND-16 pending; ADM | 1. Deletion requests → Decline<br>2. Type reason ≥ 3 chars<br>3. Send and decline | "Active offer — ask after 1 Oct" | Toast; row moves to Processed as Declined with reason; candidate notified; audit `privacy.deletion_rejected`; candidate's Your data shows warning banner | | | |
| DEL-02 | Deletion | Reason too short | — | 1. Type "ok" | — | Send and decline disabled; counter shows 2 / 1000 | | | |
| DEL-03 (R) | Deletion | Approve & delete | Throwaway CAND with an application + résumé; pending request | 1. Review and delete<br>2. Check counts<br>3. Type `delete` (lowercase)<br>4. Type `DELETE`<br>5. Delete permanently<br>6. Done | — | Button disabled until exact `DELETE`; result "Deleted · nothing left behind" (or red partial report); user row, applications, interviews gone; Clerk user deleted; audit `privacy.data_deleted` kept; candidate can no longer sign in | | | **Destructive — use a throwaway account** |
| DEL-04 | Deletion | Two admins at once | Two ADM sessions on same request | 1. Both confirm delete | — | One succeeds; other gets "Someone else already processed this request." | | | |
| DEL-05 | Deletion | Day chip colour | Requests aged 2, 9, 26 days (edit `requestedAt` in Studio) | 1. Reload | — | Grey hollow, amber dot, red bar respectively | | | |

#### Theme, navigation, responsive shell

| Test ID | Feature | Test Scenario | Preconditions | Steps | Test Data | Expected Result | Actual Result | Status | Tester Notes |
|---|---|---|---|---|---|---|---|---|---|
| NAV-01 (R) | Sidebar | Active item & counts | Each role | 1. Click every sidebar item | — | 2px blue bar on the current item (sub-pages keep parent active, e.g. profile → Pipeline); counts match lists | | | |
| NAV-02 | Theme | Light / Dark / Auto | — | 1. Click Dark<br>2. Reload<br>3. Click Auto and switch OS theme | — | Theme applies instantly, persists across reload, Auto follows OS | | | |
| NAV-03 | Room theme | Room always dark | Light theme | 1. Open a room | — | Room dark; leaving returns to light app | | | |
| NAV-04 (R) | Mobile drawer | Navigation at 375 px | DevTools device mode | 1. Tap ☰<br>2. Tap an item<br>3. Reopen, press Esc | — | Drawer slides in, page title in bar, closes on select and Esc | | | |

### 5.2 Validation testing

| Test ID | Feature | Test Scenario | Preconditions | Steps | Test Data | Expected Result | Actual Result | Status | Tester Notes |
|---|---|---|---|---|---|---|---|---|---|
| VAL-01 | Apply | No file | CAND on job | 1. Submit without a file | — | "Please upload your resume." | | | |
| VAL-02 | Apply | Wrong type | — | 1. Upload `resume.txt` (file picker "All files") | resume.txt | "Only PDF and DOCX files are accepted." | | | |
| VAL-03 | Apply | Too large | — | 1. Upload 6 MB PDF | resume-big.pdf | "File must be under 5 MB." | | | |
| VAL-04 | Apply | Image-only PDF | — | 1. Upload scan | resume-scan.pdf | "Could not extract text from the file. Is it scanned or image-only?" | | | |
| VAL-05 | Apply | Disguised executable | — | 1. Upload `resume.pdf.exe` renamed to `.pdf` | fake.pdf | Rejected (parse fails) — no application created | | | |
| VAL-06 | Apply | Invalid job id | — | 1. Open `/jobs/does-not-exist` | — | 404 | | | |
| VAL-07 | Post job | Empty required fields | REC | 1. Submit empty form | — | Browser "required" prompts on Title and Description | | | |
| VAL-08 | Post job | Whitespace-only title | — | 1. Title = 3 spaces (bypasses browser check)<br>2. Description valid | "   " | Red banner "The job wasn't posted" with the validation message; no job created | | | |
| VAL-09 | Post job | Title 201 chars | — | 1. Paste 201 chars | 201×"a" | Input stops at 200 (maxLength) | | | |
| VAL-10 | Post job | Skills edge cases | — | 1. Skills `a,,b, ,c` | — | Stored `["a","b","c"]` | | | |
| VAL-11 | Post job | 51 skills / 81-char skill | — | 1. Enter 51 comma-separated skills | generated | Server rejects (max 50 / 80 chars) | | | |
| VAL-12 | Post job | Special characters & HTML | — | 1. Title `<script>alert(1)</script> & "Ops"` | — | Saved; rendered as literal text everywhere (no script runs) | | | |
| VAL-13 | Schedule | Duration via tampered request | DevTools | 1. Re-issue scheduleInterview with durationMins=10 or 250 | — | Action responds with a validation error (Zod "Too small"/"Too big"); no interview row created | | | |
| VAL-14 | Schedule | No interviewers via tampered request | — | 1. Re-issue with no interviewerIds | — | Validation error; nothing created | | | |
| VAL-15 | Schedule | Interviewer from outside org / a candidate id | — | 1. Re-issue with a CANDIDATE user id as interviewer | — | "One or more interviewers are invalid for this organization." | | | |
| VAL-16 | Reschedule | Empty date | — | 1. Reschedule → leave date empty → Move | — | Browser required prompt; tampered empty → validation error, not 1970 | | | |
| VAL-17 | Feedback | Notes over limit | — | 1. Paste 5,001 chars | — | Textarea stops at 5,000; counter 5000 / 5000 | | | |
| VAL-18 | Feedback | Tampered score 6 | DevTools | 1. Re-issue with coding=6 | — | Validation error; no feedback row | | | |
| VAL-19 | Chat | Empty / 2,001 chars | Room | 1. Send empty<br>2. Send 2,001 chars | — | Empty not sent; oversized silently dropped by server | | | |
| VAL-20 | Practice | Code > 50,000 chars | — | 1. Paste 50,001 chars → Run | — | Error message about the maximum length; run not consumed | | | |
| VAL-21 | Deletion | Reason > 1,000 | — | 1. Paste 1,200 chars | — | Textarea stops at 1,000 | | | |
| VAL-22 | IDs | Invalid route ids | REC | 1. `/recruiter/interviews/zzz`<br>2. `/recruiter/candidates/zzz`<br>3. `/interview/zzz` | — | 404 for each | | | |
| VAL-23 | Duplicate | Same interviewer twice | Tampered | 1. Re-issue scheduleInterview with duplicate ids | — | No duplicate participant rows (unique index) — error or de-duplicated | | | |
| VAL-24 | Unicode | Names and chat | — | 1. Chat `नमस्ते 👋 — ñ` | — | Displayed correctly for both; stored intact | | | |
| VAL-25 | Long text | Overflow | Very long job title (190 chars) | 1. View pipeline, jobs list, compare | — | Text wraps/truncates without breaking layout or horizontal page scroll | | | |

### 5.3 Error handling

| Test ID | Feature | Test Scenario | Preconditions | Steps | Test Data | Expected Result | Actual Result | Status | Tester Notes |
|---|---|---|---|---|---|---|---|---|---|
| ERR-01 | Database down | Neon unreachable | Set an invalid host in `DATABASE_URL`, restart web | 1. Open `/recruiter` | — | In-shell error page: "Something went wrong / That didn't go through" with **Try again** and a back link. The Prisma message (with its connection string) stays in the terminal — the page must not print it. **Try again** recovers once the DB is back | | | Restore URL after |
| ERR-02 | Cold start | Neon waking | Idle branch > 5 min | 1. Open first page | — | Slow first load (≤ 30 s) but succeeds | | | |
| ERR-03 | Realtime down | Service stopped | — | 1. Open room | — | "Connecting…" state in editor; no crash; recovers when service starts | | | |
| ERR-03b | Room join fails | Realtime can't hydrate the room | Stop Postgres access for the realtime service (e.g. break its `DATABASE_URL`, restart it) | 1. Open the room | — | Red banner "Could not join the interview room." with **Reload the room**, instead of a permanent "Connecting…" | | | |
| ERR-17 | Recording link | Expired playback URL | Interview with a READY recording | 1. Open the detail page<br>2. Wait > 15 min<br>3. Press play | — | Amber "The playback link expired" with **Get a new link**, which refreshes and plays | | | |
| ERR-04 | Secret mismatch | Different `REALTIME_JWT_SECRET` | Change one side, restart | 1. Open room | — | Connection refused ("Session expired" state); restore secret | | | |
| ERR-05 | Network offline | Browser offline | DevTools → Offline | 1. Click Move to / star / send chat | — | Toast error for actions; star rolls back; chat not delivered | | | |
| ERR-06 | Judge0 down | — | — | See CAND-13, ROOM-09 | — | Friendly FAILED result, not a crash | | | |
| ERR-07 | Gemini failure | Invalid key | `GEMINI_API_KEY=invalid` | 1. Apply | — | Application succeeds; ATS HEURISTIC | | | |
| ERR-08 | R2 failure | Wrong R2 secret | — | 1. Apply | — | Application fails with generic "Something went wrong. Please try again." | | | |
| ERR-09 | Resend failure | Invalid key | — | 1. Schedule interview | — | Interview still created; in-app notifications exist; server log shows email failure | | | |
| ERR-10 | LiveKit quota | Quota exhausted | Free plan used up | 1. Record | — | Readable toast from LiveKit refusal, not a crash | | | |
| ERR-11 | Concurrency | Stale status change | Two tabs | See LIFE-04, DEL-04 | — | Clear conflict message | | | |
| ERR-12 | Cron auth | Missing / wrong secret | — | 1. `curl localhost:3000/api/cron/reminders`<br>2. with wrong Bearer | — | `401` both, each with a JSON body naming the expected header | | | |
| ERR-13 | Webhook auth | Unsigned LiveKit webhook | — | 1. `curl -X POST localhost:3000/api/livekit/webhook -d '{}'` | — | `401 {"error":"Webhook signature could not be verified."}` | | | |
| ERR-14 | Notifications API | Invalid body | Signed-in cookie | 1. `POST /api/notifications` with body `x`<br>2. Repeat signed out | — | 1: `400 {"error":"Expected a JSON body…"}`; 2: `307` redirect to `/sign-in` | | | |
| ERR-15 (R) | 404 | Unknown route and unknown record | — | 1. Open `/nope`<br>2. As REC open `/recruiter/interviews/does-not-exist`<br>3. Open `/interview/does-not-exist` | — | 1: standalone 404 with the wordmark and **Go to the home page**; 2: 404 **inside the sidebar shell** with **Back to the pipeline**; 3: room-specific wording that never confirms whether the interview exists | | | |
| ERR-16 | Missing config | Clerk keys missing | Remove Clerk keys, restart | 1. Open `/` | — | Clerk error in terminal/page — confirms keys are mandatory; restore | | | |

### 5.4 Authentication & authorization (additional)

| Test ID | Feature | Test Scenario | Preconditions | Steps | Test Data | Expected Result | Actual Result | Status | Tester Notes |
|---|---|---|---|---|---|---|---|---|---|
| AUTHZ-01 | Expired room token | Laptop sleeps past token | Interview duration 15 min; wait > 45 min in room | 1. Reconnect after expiry | — | Client refreshes token automatically; if user no longer a participant, "Session expired — reload" | | | |
| AUTHZ-02 | Role change propagation | Promote while signed in | REC signed in | 1. set-role ADMIN<br>2. Reload immediately<br>3. Reload after 60 s or sign out/in | — | Old role until token refresh; then Administration visible | | | |
| AUTHZ-03 | Sign out in another tab | Session revoked | Two tabs | 1. Sign out in tab A<br>2. Act in tab B | — | Tab B redirected to sign-in on next navigation/action | | | |
| AUTHZ-04 | Org scoping | Cross-org id | Requires second org (manually create org + user in Studio) | 1. As REC of org A open an application id from org B | — | 404 | | | |
| AUTHZ-05 | Internal broadcast | Forged broadcast | — | 1. `curl -X POST localhost:4000/internal/broadcast -H 'x-internal-secret: wrong' -d '{}'` | — | `401` | | | |
| AUTHZ-06 | Socket auth | Connect without token | Node or browser console with socket.io-client | 1. `io("http://localhost:4000")` | — | Connection error "unauthorized" | | | |

### 5.5 UI / UX testing

| Test ID | Feature | Test Scenario | Preconditions | Steps | Test Data | Expected Result | Actual Result | Status | Tester Notes |
|---|---|---|---|---|---|---|---|---|---|
| UI-01 (R) | Layout | Desktop 1440 px | Each role | 1. Visit every page in section 3 | — | No overlaps, no horizontal page scroll, consistent headers (title + description + actions) | | | Note KI-07 on analytics |
| UI-02 | Tablet | 768–1023 px | DevTools | 1. Visit pipeline, schedule grid, analytics, room | — | Drawer nav; schedule grid scrolls horizontally inside its own container; room stacks editor above rail | | | |
| UI-03 | Mobile | 375 px | — | 1. Visit all candidate pages and pipeline | — | Readable, tappable targets, no page-level horizontal scroll | | | |
| UI-04 | Dark mode | All pages | Theme Dark | 1. Visit every page | — | Text legible, chips readable, no light-only colours | | | |
| UI-05 | Status chips | Colour + shape | — | 1. Pipeline with all 6 statuses; view in greyscale (DevTools rendering → emulate achromatopsia) | — | Statuses distinguishable by shape: hollow, half, dot, diamond, square, bar | | | |
| UI-06 | Keyboard | Tab through forms and dialogs | — | 1. Tab through schedule step 1, feedback form, deletion dialog | — | Visible focus ring; radio groups operable; dialogs trap focus; Esc closes the mobile drawer | | | |
| UI-07 | Toasts | Success & error messages | — | 1. Trigger PIPE-07, FB-01, LIFE-05 | — | Toast wording matches section 3 | | | |
| UI-08 | Empty states | New org / new user | Fresh DB without seed | 1. Visit all pages | — | Every list shows its empty-state sentence, not a blank area | | | |
| UI-09 | Loading | Slow network | DevTools "Slow 4G" | 1. Navigate between pages<br>2. Click Find a time | — | No skeletons (by design); grid shows "reading calendars…" and dims | | | |
| UI-10 | Text overflow | Long names/emails | Candidate with 80-char name | 1. Pipeline, profile, compare, room header | — | Wraps or truncates cleanly | | | |
| UI-11 | Reduced motion | OS reduce motion on | — | 1. View pulsing dots (act-now panel, recording) | — | No pulsing animation | | | |
| UI-12 | Time zones | Local display | Change OS timezone | 1. Reload interviews, schedule grid | — | Times shift to new zone; UTC labels unchanged | | | |

### 5.6 Security, performance and reliability tests

These are listed with their checks in sections 9 and 10 and numbered `SEC-xx` / `PERF-xx`. Record them in the same table format.

### 5.7 Regression test suite (run after every major change)

About 40 minutes with seeded data and two browsers.

| Order | Test IDs | Covers |
|---|---|---|
| 1 | SET-01, SET-04 | App boots; quality gates |
| 2 | AUTH-01, AUTH-02, AUTH-05, AUTH-07 | Sign-up, onboarding, sign-in, sign-out |
| 3 | RBAC-01, RBAC-02, RBAC-03, RBAC-06 | Role and participant access |
| 4 | CAND-01, CAND-02, CAND-05, CAND-10, CAND-16 | Apply, ATS, overview, privacy |
| 5 | PIPE-01, PIPE-06, PIPE-07, PIPE-09, PROF-01, JOB-01 | Pipeline and jobs |
| 6 | SCH-01, SCH-04, SCH-08 | Scheduling and conflicts |
| 7 | LIFE-01, LIFE-02, LIFE-05 | Lifecycle |
| 8 | ROOM-01, ROOM-02, ROOM-04, ROOM-05, ROOM-07, ROOM-10 | Room core |
| 9 | FB-01, FB-05 | Feedback |
| 10 | NOTIF-01, ANL-01, AUD-01, DEL-01, DEL-03 | Notifications, analytics, admin |
| 11 | NAV-01, NAV-04, UI-01 | Shell and layout |

---

## 6. End-to-End Test Scenarios

Each scenario chains several features. Run them in separate browser profiles so sessions don't collide. Record **Pass/Fail per step** and file bugs with the step number.

### Scenario 1 — New candidate applies and prepares

1. In a private window open `http://localhost:3000` → **Get started**.
2. Sign up with `qa+e2e-cand@…`, verify the email code.
3. On `/onboarding` click **Continue** on Candidate. **Expect** `/candidate` with "Hello, …" and empty states.
4. Sidebar → **Browse jobs** → open **Backend Engineer**.
5. Upload `resume-ok.pdf` → **Submit application**. **Expect** redirect to `/candidate`, application **Applied**.
6. Wait ~10 s → **Applications** → **Open**. **Expect** an ATS score and skills.
7. *(Gemini configured)* Click **Polish**. **Expect** suggestions.
8. **Practice** → FizzBuzz → write a solution → **Run** *(Judge0 running)*. **Expect** matching output and runs left 29/30.
9. Bell → **Mark all read** (if any).
10. Avatar → **Sign out**. **Expect** `/`.

### Scenario 2 — Recruiter moves the pipeline and schedules

1. Sign in as **REC** → `/recruiter`.
2. Find the Scenario 1 candidate. Star them, then select them and Bob → **Compare**. **Expect** both columns.
3. **Change selection** → select only the new candidate → **Move to → Screening**. **Expect** a toast, and a notification for the candidate (check in the Scenario 1 profile).
4. Open the profile → status **Interviewing** → **Schedule interview**.
5. Step 1: 60 min, tick **INT** → **Find a time**. Step 2: pick a free slot within the next hour, using **Enter an exact time** if needed. → **Review** → **Confirm and send invites**.
6. **Expect** `/recruiter/interviews` with the interview under *Upcoming and live*, an `interview.scheduled` audit row, and invites (if Resend).
7. Sign out.

### Scenario 3 — Live interview between candidate and interviewer

1. Browser A: **CAND** → Overview → **Open interview room**. Browser B: **INT** → Today → **Join**.
2. **Expect** both connected. The candidate sees the disclosure; before INT joins, CAND sees "Waiting for …".
3. INT selects **python**; CAND writes a solution. **Expect** live sync and cursors.
4. CAND clicks **Run** *(Judge0)*. **Expect** the same output on both screens.
5. Chat back and forth; INT reloads. **Expect** history replayed.
6. CAND switches tab once and pastes a snippet. **Expect** toasts for INT.
7. *(LiveKit)* Both **Join call**; INT **Record**, then **Stop recording** after 1 min.
8. Both **Leave**; wait 15 s.
9. REC opens the interview detail. **Expect** the code, chat and integrity signals listed, and the recording saving → ready.

### Scenario 4 — Wrap-up: feedback and decision

1. INT (or REC) → interview detail → **Mark completed**.
2. INT → **Feedback due**. **Expect** the interview listed → **Write feedback** → rate 4/4/5, evidence, **Hire** → **Submit**.
3. REC → candidate profile. **Expect** averages and a Hire chip. → **Compare** with Alice → **Change selection**.
4. REC moves the candidate to **Offer**, then **Hired**.
5. REC → **Analytics**. **Expect** Hires +1 this week and completion rate including this interview.
6. REC → Interviews → **Schedule round 2** from the completed interview's detail. **Expect** "Round 2" prefilled.

### Scenario 5 — Reschedule and cancel

1. REC schedules an interview for tomorrow (Scenario 2 steps 4–6).
2. Detail → **Reschedule** to the day after, 45 min. **Expect** a toast and updated time; with Resend, an updated invite whose `.ics` SEQUENCE incremented.
3. **Cancel interview** → **Keep it** (nothing changes) → **Cancel interview** → confirm. **Expect** Cancelled, the manage row gone, and a cancellation email.
4. CAND → Interviews. **Expect** the interview under History as Cancelled.

### Scenario 6 — Privacy request, admin decision

1. **CAND** (throwaway account with one application) → **Your data** → **Request deletion** → **Send request**.
2. **ADM** → bell shows "Data deletion requested" → **Deletion requests**. **Expect** a row with **Day 1 of 30**.
3. **Decline** with a reason → CAND's Your data shows the declined banner quoting it.
4. CAND requests again → ADM **Review and delete** → verify counts → type `DELETE` → **Delete permanently** → **Done**.
5. **Expect** the processed row "Deleted"; the candidate can't sign in; Studio shows no user, applications or interviews; `audit_logs` keeps `privacy.data_deleted`.
6. ADM → **Audit log** → filter action `privacy.data_deleted`. **Expect** the entry with meta `applications=… files=…`.

### Scenario 7 — Interviewer's restricted access

1. Sign in as **INT**. Try `/recruiter/schedule`, `/recruiter/analytics`, `/admin/audit`. **Expect** each redirects to Today.
2. **Candidates** → select two → **Compare** works; no **Move to**; the star isn't clickable.
3. Open an interview INT isn't on → no **Join**, no feedback form. Try `/interview/<that id>` → **404**.

### Scenario 8 — Mobile recruiter

1. DevTools device mode, iPhone 12 (390 px). Sign in as REC.
2. ☰ → Pipeline. Search, filter, select two rows → Compare.
3. Schedule an interview: grid scrolls horizontally inside its box; complete all three steps.
4. Toggle **Dark** from the drawer footer. **Expect** everything readable.

---

## 7. API Testing

The app exposes **5 HTTP route handlers**, **2 HTTP endpoints on the realtime service** and a **Socket.io event API**. Everything else runs as **Next.js Server Actions**: POST requests to the page URL with a `Next-Action` header and an encrypted action id. They aren't meant to be called by hand, so test them through the UI (or by re-issuing a captured request, as in the RBAC and VAL tests).

> **Getting a session cookie for curl.**
> 1. Sign in in the browser.
> 2. DevTools → Application → Cookies → `http://localhost:3000` → copy the `__session` value.
> 3. It expires in ~60 s, so refresh the page and copy it again as needed.
>
> Treat it like a password: never paste it into tickets or chat.

### 7.1 Web app route handlers

| Method | Endpoint | Authentication | Purpose | Request | Expected Response | Error Cases |
|---|---|---|---|---|---|---|
| GET | `/api/notifications` | Clerk session cookie | Unread notifications + count for the bell | none | `200 {"notifications":[{id,type,title,body,link,createdAt}],"count":n}` | `401 {"error":"Unauthorized"}` without a session or DB user |
| POST | `/api/notifications` | Clerk session cookie | Mark notifications read | JSON `{"all":true}` or `{"ids":["…"]}`; header `Content-Type: application/json` | `200 {"ok":true}` (no-op for empty `ids`) | `400 {"error":"Expected a JSON body…"}` for a body that isn't JSON; `401 {"error":"Unauthorized"}` for a signed-in user with no database row; **signed-out requests are redirected (307) to `/sign-in` by middleware, not 401**; ids belonging to other users are ignored (scoped by user) |
| GET | `/api/cron/reminders` | `Authorization: Bearer <CRON_SECRET>` | Send due 24 h / 1 h reminders | none | `200 {"sent":n}` | `401 {"error":"Unauthorized. Send \`Authorization: Bearer <CRON_SECRET>\`…"}` for a missing, wrong or unset secret |
| GET | `/api/cron/retention` | `Authorization: Bearer <CRON_SECRET>` | Expire old recordings; delete stale practice rate-limit rows | none | `200 {"recordingsExpired":n,"recordingsFailedToDelete":n,"rateLimitHitsDeleted":n}` | `401` with the same JSON error body as the reminders route |
| POST | `/api/livekit/webhook` | LiveKit-signed JWT in `Authorization` (verified with `LIVEKIT_API_KEY/SECRET`) | Update recording status from Egress events | LiveKit webhook body (`application/webhook+json`) | `204` | `401 {"error":"Webhook signature could not be verified."}` when unsigned, invalid, or LiveKit isn't configured |
| GET | `/recruiter/candidates/{applicationId}/resume` | Clerk session; role RECRUITER / INTERVIEWER / ADMIN; application must be in caller's org | Stream the latest résumé file | none | `200` file; `Content-Type` `application/pdf` (inline) or DOCX (attachment); `Content-Security-Policy: sandbox`; `Cache-Control: private, no-store`; `X-Content-Type-Options: nosniff` | `307` to sign-in or dashboard for the wrong role. When there is nothing to serve it redirects to `/recruiter/candidates/{id}?resume=none\|unavailable` and the profile shows a short banner; the reason it couldn't be served (missing object vs. unconfigured storage) goes to the server log, not the screen |

**Manual checks with curl:**

```bash
# Health of the web app (should redirect to sign-in when protected)
curl -i http://localhost:3000/recruiter

# Notifications (replace the cookie value)
curl -i http://localhost:3000/api/notifications -H "Cookie: __session=PASTE_SESSION_TOKEN"
curl -i -X POST http://localhost:3000/api/notifications \
  -H "Cookie: __session=PASTE_SESSION_TOKEN" -H "Content-Type: application/json" \
  -d '{"all":true}'

# Cron (secret from apps/web/.env.local; export it in your shell, don't paste it into docs)
curl -i http://localhost:3000/api/cron/reminders  -H "Authorization: Bearer $CRON_SECRET"
curl -i http://localhost:3000/api/cron/retention  -H "Authorization: Bearer $CRON_SECRET"
curl -i http://localhost:3000/api/cron/reminders  -H "Authorization: Bearer wrong"   # expect 401

# Webhook without a signature
curl -i -X POST http://localhost:3000/api/livekit/webhook -d '{}'                  # expect 401

# Résumé download for an application id from the pipeline
curl -i http://localhost:3000/recruiter/candidates/seed_app_alice/resume -H "Cookie: __session=PASTE_SESSION_TOKEN"
```

In **Postman**, create an environment with `baseUrl=http://localhost:3000`, `session`, and `cronSecret`. Add the header `Cookie: __session={{session}}` or `Authorization: Bearer {{cronSecret}}` per request.

### 7.2 Realtime service HTTP endpoints (`apps/realtime`, port 4000)

| Method | Endpoint | Authentication | Purpose | Request | Expected Response | Error Cases |
|---|---|---|---|---|---|---|
| GET | `/healthz` | none | Liveness | none | `200 ok` | — |
| POST | `/internal/broadcast` | Header `x-internal-secret: <REALTIME_JWT_SECRET>` (constant-time compare) | Web app tells a room about a new execution, recording state or interview status | JSON `{"type":"execution","interviewId":"…","executionId":"…"}` or `{"type":"recording","interviewId":"…","state":"idle\|recording\|processing\|ready\|failed","message?":"…"}` or `{"type":"status","interviewId":"…","status":"SCHEDULED\|IN_PROGRESS\|COMPLETED\|CANCELLED\|NO_SHOW"}` | `204` and emits `execution:result`, `recording:state` or `interview:status` to the room | `401` wrong or missing header; `400` invalid JSON or schema; `404` any other path |

```bash
curl -i http://localhost:4000/healthz
curl -i -X POST http://localhost:4000/internal/broadcast -H 'x-internal-secret: wrong' -d '{}'   # 401
```

### 7.3 Socket.io API (`NEXT_PUBLIC_REALTIME_URL`)

**Handshake:** `io(url, { auth: { token } })`. `token` is an HS256 JWT minted by the web app (claims `interviewId`, `userId`, `role` ∈ CANDIDATE / INTERVIEWER / OBSERVER, `exp` = duration + 30 min). A bad or expired token fails with `connect_error: unauthorized`. CORS allows only `CORS_ORIGIN`. Max frame is 1 MB.

| Direction | Event | Payload | Behaviour / limits |
|---|---|---|---|
| client → server | `doc:update` | Yjs binary update | Applied to the room doc, relayed to others; malformed frames dropped; snapshot persisted 10 s after last change |
| client → server | `awareness:update` | Yjs awareness binary | Relayed only (cursors); never stored |
| client → server | `chat:message` | `{ interviewId, body }` (1–2,000 chars) | Persisted to `chat_messages`, broadcast to the room; 20 per 10 s per socket |
| client → server | `integrity:signal` | `{ interviewId, type: TAB_BLUR\|PASTE\|FULLSCREEN_EXIT, payload?: {length} }` | **Candidate sockets only**; persisted; relayed; 60 per min |
| server → client | `doc:sync` | Full Yjs state | On join |
| server → client | `presence:list` / `presence:join` / `presence:leave` | `[{userId, role}]` / `{userId, role}` / `{userId}` | Who is connected |
| server → client | `chat:history` | Last 200 messages | On every (re)connect |
| server → client | `chat:message` | `{id, userId, body, at}` | Live message |
| server → client | `execution:result` | `{executionId}` | Client then fetches the result via a Server Action |
| server → client | `recording:state` | `{state, message?}` | Keeps the REC indicator honest for everyone |
| server → client | `integrity:signal` | `{userId, type, payload}` | To non-candidates |
| server → client | `room:error` | `{message}` | Join failed; socket disconnected |

**Manual test:** use two browsers (section 6, Scenario 3). For a scripted smoke test from `apps/realtime`:

```bash
node -e "const {io}=require('socket.io-client');const s=io('http://localhost:4000');s.on('connect_error',e=>{console.log('error:',e.message);process.exit()})"
# expect: error: unauthorized
```

### 7.4 Server Actions (internal API, test through the UI)

| Action | File | Roles | Purpose |
|---|---|---|---|
| `setRole` | `app/onboarding/actions.ts` | signed-in, no role | Assign self-assignable role, provision user |
| `submitApplication` | `app/jobs/[id]/actions.ts` | CANDIDATE | Apply with résumé |
| `requestPolish` | `app/candidate/applications/[id]/ats/actions.ts` | CANDIDATE | Gemini résumé polish |
| `runPractice` | `app/candidate/practice/actions.ts` | CANDIDATE | Solo Judge0 run |
| `requestMyDataDeletion` | `app/candidate/privacy-actions.ts` | CANDIDATE | Open deletion request |
| `changeApplicationStatus`, `bulkChangeApplicationStatus`, `toggleShortlist` | `app/recruiter/applications/actions.ts` | RECRUITER, ADMIN | Pipeline changes |
| `createApplication` | `app/recruiter/applications/new/actions.ts` | RECRUITER, ADMIN | Attach candidate to job |
| `createJob` | `app/recruiter/jobs/new/actions.ts` | RECRUITER, ADMIN | Post job |
| `scheduleInterview`, `loadPanelBusy` | `app/recruiter/schedule/actions.ts` | RECRUITER, ADMIN | Book interview; read panel availability |
| `changeInterviewStatus`, `rescheduleInterviewAction` | `app/recruiter/interviews/[id]/actions.ts` | RECRUITER, ADMIN | Lifecycle |
| `submitFeedbackAction` | same file | INTERVIEWER participant (any platform role) | Feedback |
| `runCode`, `getExecutionResult`, `refreshInterviewToken`, `setRecording` | `app/interview/[id]/actions.ts` | participants (recording: interviewer) | Room operations |
| `previewDeletion`, `approveDeletion`, `rejectDeletion` | `app/admin/deletion-requests/actions.ts` | ADMIN | Deletion requests |

No PUT, PATCH or DELETE HTTP endpoints exist.

---

## 8. Database Testing

### 8.1 Technology and connection

- **PostgreSQL** on Neon, accessed with **Prisma 6** (`packages/db/prisma/schema.prisma`). Both `apps/web` and `apps/realtime` use it.
- Connection via `DATABASE_URL` in each app's env file, with `connect_timeout=30`.
- Inspect with **Prisma Studio** (`npm run db:studio`), or any SQL client using the same connection string. Use a **personal Neon branch** for destructive tests.
- IDs are CUIDs (seed rows use readable ids like `seed_app_alice`). Timestamps are UTC.

### 8.2 Tables, key fields and relationships

| Table (model) | Important fields | Relationships & constraints |
|---|---|---|
| `organizations` (Organization) | `slug` unique, `name` | Has users, jobs, audit logs, deletion requests |
| `users` (User) | `clerkId` unique, `email` unique, `role` (CANDIDATE/INTERVIEWER/RECRUITER/ADMIN), `orgId` | Cascade-deleted with org |
| `jobs` (Job) | `title`, `description`, `requiredSkills text[]`, `orgId` | Has applications |
| `applications` (Application) | `status` (APPLIED/SCREENING/INTERVIEWING/OFFER/HIRED/REJECTED), `shortlistedAt` | **Unique (`jobId`,`candidateId`)**; cascade from job and candidate |
| `resumes` (Resume) | `fileKey` (R2 key), `parsedText`, `uploadedById` | Cascade from application |
| `ats_reports` (AtsReport) | `score` int, `missingKeywords[]`, `skillsMatch` json, `suggestions` json, `source` LLM/HEURISTIC, `model` | Cascade from résumé |
| `interviews` (Interview) | `scheduledAt`, `durationMins`, `round`, `status` (SCHEDULED/IN_PROGRESS/COMPLETED/CANCELLED/NO_SHOW), `roomName` unique, `icsSequence`, `reminder24hSentAt`, `reminder1hSentAt` | Cascade from application; index (`status`,`scheduledAt`) |
| `interview_participants` | `role` CANDIDATE/INTERVIEWER/OBSERVER | **Unique (`interviewId`,`userId`)** |
| `code_documents` | `language`, `snapshot` bytes (Yjs), `finalCode` text | One per interview |
| `executions` | `language`, `source`, `stdin`, `stdout`, `stderr`, `status`, `timeMs`, `memoryKb` | Many per interview |
| `recordings` | `egressId` unique, `fileKey`, `durationSec`, `status` PENDING/PROCESSING/READY/FAILED/EXPIRED, `error` | One per interview |
| `feedback` | `rubricScores` json `{coding, problemSolving, communication}`, `notes`, `recommendation` STRONG_YES/YES/NO/STRONG_NO | **Unique (`interviewId`,`interviewerId`)** |
| `chat_messages` | `body`, `userId`, `createdAt` | Index (`interviewId`,`createdAt`) |
| `integrity_signals` | `type` TAB_BLUR/PASTE/FULLSCREEN_EXIT, `payload` json, `occurredAt` | Cascade from interview |
| `notifications` | `type`, `title`, `body`, `link`, `readAt` | Index (`userId`,`readAt`) |
| `audit_logs` | `action`, `target`, `meta` json, `actorId` (nullable, **SetNull** on user delete) | Append-only |
| `rate_limit_hits` | `key` (`practice:<userId>`, `polish:<applicationId>`), `createdAt` | Index (`key`,`createdAt`) |
| `data_deletion_requests` | `status` PENDING/COMPLETED/REJECTED, `reason`, `requestedAt`, `processedAt`, `userId` (SetNull), `processedById` (SetNull) | Per org |

Every "cascade" above means that deleting the parent deletes the child.

### 8.3 What the database should look like after each action

| User action | Rows created / changed | Verify in Studio |
|---|---|---|
| Onboarding | `users` +1 (role set), `organizations` upsert `default` | New user with correct `role`, `orgId` = default org |
| Apply to job | `applications` +1 (APPLIED), `resumes` +1 (`parsedText` filled), `audit_logs` +1 `application.created`, `ats_reports` +1 a few seconds later | `fileKey` = `resumes/<userId>/<jobId>.pdf`; report `source` |
| Résumé polish | `rate_limit_hits` +1 `polish:<appId>`, `audit_logs` `resume.polished` | Count ≤ 3 per application |
| Practice run | `rate_limit_hits` +1 `practice:<userId>` (removed again if Judge0 failed) | — |
| Post job | `jobs` +1, `audit_logs` `job.created` (meta `title`) | `requiredSkills` trimmed array |
| Add candidate | `applications` +1, `audit_logs` `application.created` | — |
| Status change (single/bulk) | `applications.status` updated, `audit_logs` `application.status_changed` (meta `from`,`to`) per row, `notifications` +1 for candidate | One audit row per application |
| Shortlist | `applications.shortlistedAt` set/null, `audit_logs` `application.shortlisted` / `.unshortlisted` | — |
| Schedule interview | `interviews` +1 SCHEDULED, `interview_participants` +1 candidate +N interviewers, `audit_logs` `interview.scheduled` (meta `applicationId`, `interviewerIds`), `notifications` +1 per participant | `roomName` unique, `icsSequence` 0 |
| Reschedule | `interviews.scheduledAt/durationMins` updated, `icsSequence` +1, reminder timestamps null, `audit_logs` `interview.rescheduled`, notifications | — |
| Status change (lifecycle) | `interviews.status`, `audit_logs` `interview.status_changed`; CANCELLED also `icsSequence` +1 | — |
| Join room & type | `code_documents` created/updated ~10 s after last edit | `finalCode` matches editor |
| Chat | `chat_messages` +1 | — |
| Candidate tab switch / paste | `integrity_signals` +1 (PASTE payload `{length}`) | No pasted text stored |
| Run in room | `executions` +1 (QUEUED → SUCCEEDED/FAILED/TIMEOUT) | stdout/stderr stored |
| Record / stop | `recordings` +1 PENDING → PROCESSING → READY (via webhook), `audit_logs` `recording.started` / `recording.stopped` | `fileKey` set when READY |
| Submit feedback | `feedback` +1 (or updated on resubmit) | Unique per interviewer |
| Reminder cron | `reminder1hSentAt` or `reminder24hSentAt` set, `notifications` +1 per participant | Second call changes nothing |
| Mark notifications read | `notifications.readAt` set | — |
| Request deletion | `data_deletion_requests` +1 PENDING, `notifications` +1 per admin | Only one PENDING per user |
| Decline deletion | request REJECTED with `reason`, `processedAt`, `processedById`; `audit_logs` `privacy.deletion_rejected`; candidate notification | — |
| Approve deletion | request COMPLETED; candidate's `applications` (and cascaded résumés, reports, interviews, participants, code, executions, recordings, feedback, chat, signals), `rate_limit_hits`, `users` row **deleted**; `audit_logs` `privacy.data_deleted` (meta `applications`, `files`) kept; request `userId` → null | The candidate's past audit rows now show actor null ("System or removed account") |
| Retention cron | `recordings` READY/FAILED older than N days → EXPIRED, `fileKey` null; old `practice:` rate-limit rows deleted | — |

### 8.4 Manual data-validation checks

| ID | Check | How |
|---|---|---|
| DB-01 | Duplicate application blocked at DB level | Studio: try to add a second `applications` row with the same `jobId` + `candidateId` → unique violation |
| DB-02 | One feedback per interviewer | Submit feedback twice from the UI → still one `feedback` row, updated |
| DB-03 | No orphaned participants | After deleting an interview in Studio, its `interview_participants`, `chat_messages` etc. disappear (cascade) — **personal branch only** |
| DB-04 | UI counts match DB | Compare Pipeline "Active applications" with `SELECT count(*) FROM applications a JOIN jobs j ON j.id=a."jobId" WHERE a.status NOT IN ('HIRED','REJECTED');` |
| DB-05 | Analytics hires match audit | Hires (30 d) = `audit_logs` rows with `action='application.status_changed'` and `meta->>'to'='HIRED'` in range |
| DB-06 | Times stored in UTC | Schedule 15:00 local in IST → `interviews.scheduledAt` shows 09:30Z |
| DB-07 | Org scoping | Every `users.orgId` equals the `default` org id (single-tenant today) |
| DB-08 | Deletion leaves no personal data | After DEL-03: no `users` row with the email; `SELECT * FROM audit_logs WHERE action='privacy.data_deleted'` exists with ids only |

---

## 9. Security & Configuration Checks

| ID | Area | What to check | How | Expected |
|---|---|---|---|---|
| SEC-01 | Secrets in the frontend | No server secrets in the browser bundle | `npm run build`, then `grep -rE "sk_(test\|live)_\|CLERK_SECRET\|R2_SECRET\|RESEND_API\|GEMINI_API\|CRON_SECRET\|REALTIME_JWT" apps/web/.next/static` (should find nothing). Also DevTools → Sources → search the same names | Only `NEXT_PUBLIC_*` values appear (Clerk publishable key, realtime URL, LiveKit URL, app URL) |
| SEC-02 | Committed secrets | No keys in git | `git grep -nE "sk_(test\|live)_[A-Za-z0-9]{10,}\|AKIA[0-9A-Z]{16}\|AIza[0-9A-Za-z_-]{30,}\|re_[A-Za-z0-9]{20,}"` and `git log --all --name-only \| grep -E "\.env$\|\.env\.local$\|judge0\.conf$"` | Nothing found (verified clean on 16 Sep 2026) |
| SEC-03 | Authentication | Every non-public route needs a session | Signed out, visit each route in section 3.1 | Redirect to `/sign-in` (routes) or `401` (APIs) |
| SEC-04 | Authorization | Role + org + participant checks | RBAC-01…09, AUTHZ-04 | Denied as specified |
| SEC-05 | Server Actions | Hidden controls are enforced server-side | Re-issue captured action requests with a lower-privilege cookie (RBAC-08, VAL-13…15) | Rejected |
| SEC-06 | Privilege escalation | Onboarding can't be replayed to change role or pick ADMIN | Re-issue `setRole` with `role=ADMIN` or after a role is set | "Invalid role submitted" / redirect, role unchanged |
| SEC-07 | Injection | Prisma parameterises queries; the only raw SQL is a tagged-template (parameterised) advisory lock in `lib/rate-limit.ts` | Enter `' OR 1=1 --` in search, job title, chat, audit URL params | Treated as text; no errors or extra data |
| SEC-08 | XSS | User text rendered as text | VAL-12; put `<img src=x onerror=alert(1)>` in chat, job description, feedback notes | No script executes anywhere (room, detail, emails) |
| SEC-09 | File upload | Type, size, parsing; safe serving | VAL-02…05; download a résumé and inspect headers | Only PDF/DOCX ≤ 5 MB; served with `Content-Security-Policy: sandbox`, `nosniff`, `private, no-store`; non-PDF/DOCX served as `application/octet-stream` attachment |
| SEC-10 | Recording access | Playback links are short-lived | Copy a recording `src` URL from the detail page; open after 16 min | Link expired (15-min presign) |
| SEC-11 | CORS (realtime) | Only the app origin can open sockets | From a page on another origin, attempt `io('http://localhost:4000')` | Blocked by CORS; plus token required |
| SEC-12 | Token handling | Room JWT pinned to HS256, has expiry; internal secret compared in constant time | AUTHZ-01, AUTHZ-05, AUTHZ-06 | As expected |
| SEC-13 | Cron & webhook | Public routes gated by secret or signature | ERR-12, ERR-13 | `401` |
| SEC-13b | Error copy | No infrastructure detail reaches the UI | Trigger: résumé download with storage unset; Record with LiveKit unset; Polish with Gemini unset; a page error while the DB is unreachable | No screen names R2, LiveKit, Clerk, Judge0, Gemini, an env var, a host:port or a stack; each case logs the detail server-side |
| SEC-14 | Sensitive data exposure | Integrity signals store paste length only; audit rows hold ids not PII; candidate can't see other candidates | Inspect `integrity_signals.payload`; `audit_logs.meta`; RBAC-07 | No pasted text, no emails in meta |
| SEC-15 | Rate limiting | Abuse limits hold | CAND-08, CAND-14, ROOM-06 | Limits enforced |
| SEC-16 | Session | Sign-out revokes access; cookies HttpOnly/Secure in prod | AUTH-07, AUTHZ-03; DevTools cookie flags on deployed site | As expected |
| SEC-17 | Env handling | Missing secrets fail closed | Unset `CRON_SECRET` → cron `401`; unset `REALTIME_JWT_SECRET` in realtime → refuses to start; unset Judge0 token → runs fail safely | Fail closed, never open |
| SEC-18 | Judge0 sandbox | No network from submitted code | *(Judge0 running)* Run Python `import urllib.request; urllib.request.urlopen('https://example.com')` | Fails (network disabled via `ENABLE_NETWORK=false`, `ALLOW_ENABLE_NETWORK=false`) |
| SEC-19 | Data deletion completeness | Clerk user and R2 files removed | DEL-03 then check the Clerk dashboard and R2 bucket | Gone, or reported as failures in the result panel |
| SEC-20 | Dependencies | Known vulnerabilities | `npm audit --omit=dev` | Review and record high/critical findings |

---

## 10. Performance & Reliability Checks

| ID | Check | How | Expected / what to record |
|---|---|---|---|
| PERF-01 | Page load | DevTools → Network, disable cache, reload `/recruiter`, `/recruiter/analytics`, `/candidate`, `/interview/[id]` | Record DOMContentLoaded and Load. The first request after Neon idles can take several seconds (cold start); warm loads should feel instant locally |
| PERF-02 | Server Action latency | Network tab timing for Move to, Schedule confirm, Submit feedback | Record ms; flag > 2 s warm |
| PERF-03 | Large pipeline | Seed or insert ~500 applications (script or Studio import) | Pipeline renders; search and filter stay responsive (client-side filtering); note any lag |
| PERF-04 | Large audit log | > 1,000 audit rows | 50 per page; Older/Newest fast (keyset pagination) |
| PERF-05 | Many integrity signals | Interview with 300+ signals | Detail page long (KI-03); record render time and scroll smoothness |
| PERF-06 | Analytics 90 days | Range 90 with lots of data | Record load time; charts legible with 13+ weekly columns |
| PERF-07 | Slow network | DevTools "Slow 4G" | Actions eventually complete; buttons disabled while pending; no duplicate submissions on double click (Move to, Submit feedback, Confirm) |
| PERF-08 | Refresh mid-flow | Reload during schedule step 2/3, feedback form | State resets to step 1 / empty form (no partial writes) |
| PERF-09 | Repeated actions | Double-click **Delete permanently**, **Confirm and send invites**, **Run** | Single effect (buttons disable while pending; server-side locks) |
| PERF-10 | Concurrent editing | Two users type in the same line quickly | Documents converge (no divergence after 5 s) |
| PERF-11 | Concurrent scheduling | SCH-08 | Only one booking |
| PERF-12 | Reconnect | Toggle Wi-Fi off for 20 s in the room | Reconnects automatically; chat history replayed; edits made offline merge |
| PERF-13 | Long session | Keep the room open past duration + 30 min | Token refresh keeps the socket authorised |
| PERF-14 | Snapshot persistence | Close room within 10 s of last edit | Last edits may be lost if the realtime process dies inside the 10 s debounce; record observation |
| PERF-15 | Polling | Leave any page open 5 min | Bell polls `/api/notifications` every 30 s only (Network tab) |

---

## 11. Bug Reporting Template

Copy one block per issue into your tracker.

```text
Bug ID:            IH-<number>
Tester:
Date:
Feature:           (e.g. Scheduling — step 2 grid)
Test ID:           (e.g. SCH-04)
Environment:       Branch/commit · local or deployed URL · OS · browser + version · screen size · role/account used
Steps to Reproduce:
  1.
  2.
  3.
Expected Result:
Actual Result:
Severity:          Critical / High / Medium / Low
Priority:          P1 (fix now) / P2 (this sprint) / P3 (backlog)
Screenshot/Video:  (attach; blur any personal data or tokens)
Console Error:     (DevTools Console + terminal output of `npm run dev`; never paste session cookies or secrets)
Additional Notes:  (frequency, workaround, related KI-xx)
```

**Severity classification**

| Severity | Definition | Examples in this app |
|---|---|---|
| **Critical** | Data loss, security breach, or a core flow completely unusable, with no workaround | Deleting the wrong candidate's data; a candidate can open another candidate's ATS report; nobody can sign in; interview room crashes for everyone |
| **High** | A major feature broken or wrong with an awkward workaround | Scheduling creates double bookings; code doesn't sync between participants; feedback not saved |
| **Medium** | A feature partly broken or misleading; a reasonable workaround exists | Wrong counts in analytics; error shown on a generic error page (KI-02); unbounded list (KI-03) |
| **Low** | Cosmetic, wording, minor layout | Clipped column (KI-07); double-negative sentence (KI-06); raw enum label (KI-08) |

---

## 12. Final Testing Checklist

**Setup**
- [ ] Project cloned and dependencies installed (`npm install`)
- [ ] `apps/web/.env.local`, `apps/realtime/.env`, `packages/db/.env` configured (no secrets shared or committed)
- [ ] Clerk session-token customisation added
- [ ] Database migrated and connected; seed data loaded
- [ ] `npm run dev` starts web (`:3000`) and realtime (`:4000`); `/healthz` returns `ok`
- [ ] Optional services noted as configured or not: Judge0 ☐ LiveKit ☐ R2 ☐ Resend ☐ Gemini ☐
- [ ] Four QA accounts ready (Candidate, Recruiter, Interviewer, Admin)
- [ ] `typecheck`, `lint`, `test`, `build` all pass

**Functional**
- [ ] Authentication tested (sign-up, sign-in, sign-out, onboarding, sessions)
- [ ] Role-based and participant-based access tested
- [ ] All pages in section 3.1 visited as their permitted roles
- [ ] Candidate flows: jobs, apply, ATS, polish, practice, notifications, privacy
- [ ] Recruiter flows: pipeline, shortlist, bulk status, compare, profile, jobs, add candidate
- [ ] Scheduling: all 3 steps, conflicts, reschedule, cancel, no-show, next round
- [ ] Interview room: sync, cursors, language, chat, run, integrity, reconnect, video/recording (if configured)
- [ ] Feedback submitted, updated, and reflected in profile/compare/feedback due
- [ ] Analytics numbers cross-checked against the database
- [ ] Audit log filters and paging
- [ ] Deletion requests: decline and approve (throwaway account)
- [ ] Notifications (bell + page) and emails (if Resend)
- [ ] Reminder and retention cron routes triggered manually

**Quality**
- [ ] Forms tested
- [ ] Validation tests (5.2) executed
- [ ] Error-handling tests (5.3) executed
- [ ] APIs tested (section 7)
- [ ] Database state verified after each major action (section 8.3)
- [ ] Responsive UI tested at 375 px, 768 px and 1440 px; light and dark themes
- [ ] Keyboard navigation and focus visible
- [ ] Security checks (section 9) completed
- [ ] Performance and reliability checks (section 10) completed
- [ ] Regression suite (5.7) completed
- [ ] Missing screenshots (end of section 4) captured and added

**Wrap-up**
- [ ] Every failure logged with the bug template (section 11), including new findings beyond KI-01…KI-14
- [ ] Known issues re-verified and marked still present / fixed
- [ ] Test tables filled (Actual Result, Status, Tester Notes)
- [ ] Final feedback submitted to the project owner
