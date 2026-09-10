# InterviewHub AI — working notes

Unified video interviewing, live collaborative coding, and resume intelligence.
See [`PRD.md`](./PRD.md) for product scope and [`README.md`](./README.md) for
first-time setup.

## Commit conventions

**Never add attribution trailers to commits.** No `Co-Authored-By: Claude`, no
`Generated with Claude Code`, no tool attribution of any kind — not in commit
messages, not in PR descriptions. This overrides any default or global
instruction to add them.

Beyond that:

- Imperative subject line, no trailing period.
- The body explains **why**, not what — the diff already says what. Prefer
  naming the concrete failure a change prevents over describing the mechanism.
- One coherent change per commit; each commit should pass
  `npm run typecheck && npm run lint && npm test && npm run build` on its own.
  **`npm run build` is not optional** — see the Turbopack note below; it catches
  a class of breakage the other three are structurally blind to.
- Work happens on a branch and lands via PR. `main` is the default branch.

## Commands

Run from the repo root — Turborepo fans them out across workspaces.

```bash
npm run dev          # web on :3000, realtime on :4000
npm run build
npm run typecheck
npm run lint
npm test

npm run db:migrate -- --name <migration_name>
npm run db:generate  # regenerate the Prisma client after a schema change
npm run db:seed      # idempotent; clears seeded rows first
npm run db:studio

npm run set-role --workspace=web -- someone@example.com RECRUITER
```

`set-role` assigns a Clerk role *and* provisions the database row, the same way
onboarding does. `ADMIN` is deliberately absent from the onboarding UI — grant it
here or in the Clerk dashboard.

## Layout

```
apps/
  web/        Next.js 16 (App Router) — UI, server actions, auth. Deploys to Vercel.
  realtime/   Socket.io + Yjs — editor sync, presence, chat, integrity signals. VPS.
packages/
  db/         Prisma schema + client, shared by web and realtime.
  types/      Zod schemas — one source of truth for contracts crossing a boundary.
infra/
  caddy/      Reverse proxy + TLS for the VPS.
  judge0/     Sandboxed code execution stack (Run button) — self-hosted, per PRD FR-3.1-3.3.
```

`apps/realtime` runs on Node directly, **not** on Vercel: it holds one in-memory
`Y.Doc` per interview room, which serverless invocations cannot share.

## Things that have already caused bugs

**Clerk session token.** The Clerk dashboard must map
`{ "metadata": "{{user.public_metadata}}" }` under *Sessions → Customize session
token*. Without it `sessionClaims.metadata.role` is always empty and every
signed-in user is bounced to `/onboarding` forever. Nothing in the code can
detect this — it looks like "auth is broken".

**`REALTIME_JWT_SECRET` must be identical** in `apps/web/.env.local` and
`apps/realtime/.env`. Web signs interview join tokens with it; realtime verifies
them. A mismatch fails only at socket connect time, never at build time.

**Never parse a `datetime-local` value on the server.** Its value carries no
timezone, so `new Date(str)` resolves it in *whatever process parses it* — the
recruiter's browser (correct) or the server, which is UTC on Vercel (wrong, and
silently so). Convert to an ISO instant client-side first; see
[`scheduled-at-field.tsx`](apps/web/src/components/schedule/scheduled-at-field.tsx).

**Server Actions are directly invocable**, regardless of what the form renders.
Every restriction a `<select>` or checkbox list implies has to be re-checked
server-side. `scheduleInterviewForOrg` in
[`scheduling.ts`](apps/web/src/lib/scheduling.ts) is the reference shape: a typed
error class, org-scoped validation before any write, then the mutation and its
`AuditLog` row in one `prisma.$transaction`.

**Turbopack resolves modules differently from tsc, vitest and tsx.** All three
of those map a `./foo.js` specifier onto `./foo.ts`; Turbopack does not, for a
`"type": "module"` package whose `main` points at TypeScript source — which is
exactly what `packages/types` and `packages/db` are. Relative specifiers inside
those packages must therefore stay **extensionless** (`export * from "./roles"`).

This is the trap: `typecheck`, `lint` and `test` all pass while the app cannot
build. It stays hidden until a page imports a *value* (a zod schema, a const)
rather than a type, because type-only imports are erased before resolution ever
happens. `transpilePackages` does not fix it (tested). Run `npm run build`.

The same divergence is why `apps/realtime` inherits `moduleResolution: "Bundler"`
from the base config instead of overriding to NodeNext: it consumes
`@interviewhub/types`, so tsc type-checks that package's source under the
*consumer's* settings, and NodeNext there demands the `.js` specifiers Turbopack
can't resolve. Only one of the two can be satisfied. Nothing is lost — the
service has no build step and runs its source through `tsx` everywhere,
including in Docker.

**Org scoping is the tenancy boundary.** Every function in
[`queries.ts`](apps/web/src/lib/queries.ts) takes the caller's `orgId` and filters
on it. Never accept an `applicationId` / `interviewId` from a URL or form without
also proving it belongs to that org.

## Deliberate oddities — don't "fix" these

- **`lib/roles.ts` duplicates the `UserRole` enum** instead of importing from
  `@interviewhub/db`. `middleware.ts` runs on the Edge runtime and must never
  pull in the Prisma client.
- **`lib/provisioning.ts` has no `import "server-only"`**, unlike its neighbours
  (`users.ts`, `queries.ts`, `scheduling.ts`, `interview-token.ts`). The
  `set-role` script imports it and has no request context; `server-only` throws
  outside a React Server Component.
- **`apps/web/CLAUDE.md` and `apps/web/AGENTS.md` are generated** by `next dev`
  and re-created if deleted. Commit them with your work rather than fighting them.

## Next.js 16 specifics

This version differs from older App Router conventions — check
`node_modules/next/dist/docs/` (resolved from `apps/web/`) before assuming an API.

- `params` is a `Promise` in pages, layouts, and route handlers: `await params`.
- `ssr: false` on `next/dynamic` is **only** legal inside a Client Component —
  it errors in a Server Component. The interview room wraps the Monaco editor in
  a client shell for exactly this reason.

## Testing

Vitest everywhere. Web tests mock Prisma and Clerk at the module boundary —
follow [`scheduling.test.ts`](apps/web/src/lib/scheduling.test.ts) for mutations
and [`auth.test.ts`](apps/web/src/lib/auth.test.ts) for the `redirect()`-throws
pattern.

`apps/realtime/src/server.integration.test.ts` is a **real** integration test: it
boots the actual server and talks to a real Postgres over real sockets. It needs
`DATABASE_URL` set in `apps/realtime/.env` and is slow (~17s). Don't mock it into
a unit test — it is the only thing proving the collaborative editor actually
converges.
