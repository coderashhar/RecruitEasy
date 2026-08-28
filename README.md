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

## Deploying

- **`apps/web` → Vercel.** Set the project's Root Directory to `apps/web`
  ([`vercel.json`](apps/web/vercel.json) handles the monorepo install/build from there). Add the
  same env vars from `apps/web/.env.local`.
- **`apps/realtime` (+ Judge0 in Phase 1) → one small VPS**, reverse-proxied by
  [`infra/caddy`](infra/caddy). `apps/realtime/Dockerfile` builds the service; bring it up with
  `infra/caddy/docker-compose.yml`.

Full reasoning for these choices — including why LiveKit Cloud over self-hosting, and why R2 over
S3 — is in the architecture plan.
