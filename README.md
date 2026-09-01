# InterviewHub AI

Unified video interviewing, live collaborative coding, and resume intelligence — one interview, one tab.

See [`PRD.md`](./PRD.md) for product scope and the architecture plan (ADRs, data model, build sequence) from `/architecture`.

## Layout

```
apps/
  web/        Next.js 16 (App Router) — UI, route handlers, auth. Deploys to Vercel.
  realtime/   Socket.io + Yjs — editor sync, presence, chat, integrity signals. Deploys to the VPS.
packages/
  db/         Prisma schema + client, shared by web and realtime.
  types/      Zod schemas shared across apps — one source of truth for API contracts.
infra/
  caddy/      Reverse proxy + TLS for the VPS. Judge0 joins this in Phase 1.
```

Turborepo + npm workspaces. `apps/realtime` runs on Node directly (not Vercel) because it holds
in-memory `Y.Doc` state per interview room — see ADR-002 in the plan.

## Prerequisites

- Node 20.9+ (repo pinned via `packageManager` in the root `package.json`)
- A Neon Postgres project (free tier)
- A Clerk application (free tier)

## First-time setup

1. **Install:**

   ```bash
   npm install
   ```

2. **Neon** — create a project at [console.neon.tech](https://console.neon.tech), copy the pooled
   connection string.

3. **Clerk** — create an application at [dashboard.clerk.com](https://dashboard.clerk.com), copy
   the publishable + secret keys.

   Then, in the Clerk dashboard: **Sessions → Customize session token**, add:

   ```json
   { "metadata": "{{user.public_metadata}}" }
   ```

   Without this, `sessionClaims.metadata.role` in [`middleware.ts`](apps/web/src/middleware.ts) is
   always empty and every signed-in user gets bounced to `/onboarding` in a loop.

4. **Env files** — copy each `.env.example` and fill in the two accounts above:

   ```bash
   cp apps/web/.env.example apps/web/.env.local
   cp apps/realtime/.env.example apps/realtime/.env
   cp packages/db/.env.example packages/db/.env
   ```

   `DATABASE_URL` is the same Neon string in all three. Generate a random value for
   `REALTIME_JWT_SECRET` and use the same value in `apps/web/.env.local` and `apps/realtime/.env`
   — the web app signs interview join tokens with it, the realtime service verifies them.

   Everything else in those files (LiveKit, R2, Upstash, Resend, Judge0, Gemini) is Phase 1
   step 3 onward — leave blank until you get there.

5. **Database:**

   ```bash
   npm run db:migrate -- --name init
   npm run db:generate
   ```

6. **Run:**

   ```bash
   npm run dev
   ```

   `apps/web` on [localhost:3000](http://localhost:3000), `apps/realtime` on `:4000`.

7. **Get a role** — sign up through the app, pick a role on `/onboarding`. To skip that for a test
   account:

   ```bash
   npm run set-role --workspace=web -- someone@example.com RECRUITER
   ```

   (`ADMIN` is intentionally not offered in the onboarding UI — promote via this script or the
   Clerk dashboard.)

8. **Seed sample data** (optional, but the dashboards and scheduling flow are a lot more useful
   with something in them):

   ```bash
   npm run db:seed
   ```

   Creates one organization, a recruiter/interviewer/admin and three candidates (placeholder
   `clerkId`s — they can't sign in, but everything they own renders), two jobs, three applications
   at different pipeline stages, and one scheduled interview. Re-running it clears seeded rows
   first, so it's safe to repeat. Every real account still provisions itself the normal way — sign
   up, then `/onboarding` — the seed just gives the *other* side of the table something to look at.

## Trying the interview room

1. Sign up two accounts (or promote two seeded-adjacent real accounts with `set-role`, above): one
   `RECRUITER`, one `INTERVIEWER`.
2. As the recruiter, go to **Recruiter → Schedule interview**, pick a seeded application, add the
   interviewer, and submit.
3. Open the interview from either dashboard's "Scheduled interviews" list — `/interview/<id>`.
   Opening it as an account that isn't one of the two participants 404s; that's
   [`interview-access.ts`](apps/web/src/lib/interview-access.ts) enforcing who actually belongs in
   the room, independently of the join token itself.
4. Open the same URL in a second browser (or a private window) signed in as the other
   participant. Typing in one editor should appear in the other in real time, along with presence
   and chat.
5. Close both tabs, wait ~10 seconds (the realtime service's snapshot debounce — see
   [`rooms.ts`](apps/realtime/src/rooms.ts)), then reopen: the code should still be there. Prisma
   Studio (`npm run db:studio`) will show a non-empty `finalCode` on that interview's
   `code_documents` row.

## Deploying

- **`apps/web` → Vercel.** Set the project's Root Directory to `apps/web`
  ([`vercel.json`](apps/web/vercel.json) handles the monorepo install/build from there). Add the
  same env vars from `apps/web/.env.local`.
- **`apps/realtime` (+ Judge0 in Phase 1) → one small VPS**, reverse-proxied by
  [`infra/caddy`](infra/caddy). `apps/realtime/Dockerfile` builds the service; bring it up with
  `infra/caddy/docker-compose.yml`.

Full reasoning for these choices — including why LiveKit Cloud over self-hosting, and why R2 over
S3 — is in the architecture plan.
