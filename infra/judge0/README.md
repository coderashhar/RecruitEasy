# Judge0 — sandboxed code execution

Backs the interview room's Run button (PRD FR-3.1–3.3). Runs the
[official Judge0 stack](https://github.com/judge0/judge0) unmodified —
`server` (API + queueing), `worker` (the process that actually invokes
`isolate` and runs submitted code), `db`, and `redis`.

## First-time setup

```bash
cp judge0.conf.example judge0.conf
```

Fill in `judge0.conf`'s blank values — `REDIS_PASSWORD`, `POSTGRES_PASSWORD`,
and `AUTHN_TOKEN` all have no default and Judge0 will not start without them.
Generate each with:

```bash
openssl rand -hex 32
```

`AUTHN_TOKEN` also has to match `JUDGE0_AUTH_TOKEN` in `apps/web/.env.local` —
that's the credential the web app presents on every request; without it, every
request to this stack is rejected, since `judge0.conf.example` deliberately
leaves no unauthenticated mode configured.

## Running it

```bash
docker compose up -d
curl http://localhost:2358/languages   # should list supported languages
```

`server` publishes port `2358` straight to the host — `apps/web`'s dev server
runs on the host too, and reaches this stack via `JUDGE0_URL` in its own env,
not through Docker's internal network.

## What's locked down, and why

Every setting in `judge0.conf.example` exists because Judge0's own default
either isn't safe enough for this use case or isn't set at all:

- **`ENABLE_NETWORK=false` and `ALLOW_ENABLE_NETWORK=false`** — the PRD's own
  risk mitigation (§13) is "no network access from execution containers".
  `ENABLE_NETWORK` is already `false` by default, but `ALLOW_ENABLE_NETWORK`
  defaults to `true` — meaning a submission's own request body can ask to turn
  networking on for itself. Both have to be locked, or the safe default isn't
  actually enforced against a submission that asks.
- **`MAX_*_LIMIT` tightened below Judge0's own defaults** — this runs one
  interview room's Run button, not a public judging service, and the whole
  stack (server + worker + db + redis) has to fit on the same modest VPS as
  `apps/realtime`.
- **`AUTHN_TOKEN` required** — disabled by default upstream, which would leave
  the sandbox reachable by anything on the same network with no credential.

## On the VPS

This joins the same box as `apps/realtime` (see `infra/caddy`), reverse-proxied
the same way. Not yet wired into `infra/caddy/docker-compose.yml`'s shared
network — that's a deployment step, not a local-dev one, and is tracked
alongside the rest of the production deploy in the architecture plan.
