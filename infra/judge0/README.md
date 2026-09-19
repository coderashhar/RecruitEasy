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

`server` publishes port `2358` on the host's loopback (`127.0.0.1`) only.
`apps/web`'s dev server runs on the host too, and reaches this stack via
`JUDGE0_URL` in its own env, not through Docker's internal network. Loopback
matters on the VPS: Docker writes its own firewall rules, so a port published
on all interfaces would be public even behind `ufw`.

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

Don't run `docker compose up` in this directory on the VPS.
`infra/caddy/docker-compose.yml` `include`s this file, so one `docker compose up -d`
in `infra/caddy` starts Caddy, realtime, cron and this stack together.

1. Fill in `judge0.conf` here, as above.
2. Point a DNS name at the VPS for Judge0 and set it as `JUDGE0_DOMAIN` in
   `infra/caddy/.env`, next to `REALTIME_DOMAIN`.
3. `cd infra/caddy && docker compose up -d` (Compose 2.20 or later).
4. On Vercel, set `JUDGE0_URL=https://<JUDGE0_DOMAIN>` and `JUDGE0_AUTH_TOKEN`
   to this file's `AUTHN_TOKEN`.

Check it from anywhere:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://$JUDGE0_DOMAIN/languages   # 404: only submissions are proxied
curl -s -X POST -H "Content-Type: application/json" -H "X-Auth-Token: $AUTHN_TOKEN" \
  -d '{"language_id":71,"source_code":"print(2+2)"}' \
  "https://$JUDGE0_DOMAIN/submissions?wait=true"                              # stdout "4\n"
```

Caddy forwards only `POST /submissions`, the one call the web app makes. Every
other Judge0 endpoint returns 404 from outside, and Judge0 still checks
`AUTHN_TOKEN` on the calls that do get through.
