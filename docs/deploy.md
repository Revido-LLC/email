# Deploy

How Revido Mail ships: the single-project Railway topology, secret injection, database migrations,
and the human-gated go-live checklist. This reflects the Railway Postgres + Better Auth stack (the
build pivoted off Supabase).

## Topology — one Railway project, private networking

Everything lives in **one Railway project** (`Revido Email`, id `a787833e-530d-41dd-84e9-8854aa904ab4`,
workspace `Revido`, environment `production`) so the services reach the database over Railway's
**private network**. Do not split the database into a separate project — that breaks internal
networking. (See the `/railway-email-revido` skill for the authoritative topology + a migration
runner.)

| Service          | Source                        | Railway config             | Role |
| ---------------- | ----------------------------- | -------------------------- | ---- |
| `@revido/web`    | GitHub `Revido-LLC/email`     | `apps/web/railway.json`    | React SPA via `vite preview`. Already deployed. |
| `@revido/api`    | `apps/api`                    | `apps/api/railway.json`    | Hono API — CRUD, OAuth, AI SSE, webhooks. **Add at deploy.** |
| `@revido/worker` | `apps/worker`                 | `apps/worker/railway.json` | Background consumers: sync, enrichment, agents, digests. **Add at deploy.** |
| `Postgres`       | `ghcr.io/railwayapp-templates/postgres-ssl:18` | — | Railway Postgres 18 (pgvector 0.8.5 + pgcrypto). **Already provisioned + migrated (0000–0005) + RLS-proven.** |

Each app service points its "Config File Path" at its `railway.json` and keeps the Root Directory at
the repo root (pnpm workspace filtering resolves from anywhere; the lockfile + hoisted `node_modules`
live at the root). `api` and `worker` reach the DB via a Railway **variable reference** to
`Postgres.DATABASE_URL` (the internal `postgres.railway.internal` URL) — never a copied value.

## Database migrations

Schema is raw SQL under `packages/db/drizzle/` (`0000`–`0005`), split on `--> statement-breakpoint`.
`0000` = tables + `vector`/`pgcrypto` extensions; `0001` = the non-owner `app_user` role + GUC
Row-Level-Security; `0002` = Better Auth + `jobs` (service-only); `0003` = `sync_state.subscription_id`;
`0004` = nullable `attachments.message_id`; `0005` = `users.theme`.

**Status: all six are already applied to the live staging DB, and GUC-RLS is runtime-proven.** To
apply migrations to a fresh DB (e.g. a prod cutover), export the target's public proxy URL and run the
skill's runner from the repo root:

```
export PGURL="$(railway variables --service Postgres --json | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf8')).DATABASE_PUBLIC_URL)")"
PROVE_RLS=1 node ~/.claude/skills/railway-email-revido/scripts/apply-migrations.mjs
```

Healthy output: `tables: 27`, `extensions: pgcrypto, vector`, `GUC-RLS RUNTIME PROOF: PASS`.

> **Important:** the connection role in `DATABASE_URL` must be a superuser or `BYPASSRLS` role — the
> content tables use FORCE RLS, which applies even to the table owner. Railway's default `postgres`
> role satisfies this; a least-privilege role would silently return zero rows. `apps/api` logs a loud
> warning at startup (`assertServiceRoleBypassesRls`) if the role can't bypass.

## Secrets: Infisical

No real secret ever lands in a committed file. Each service's Railway **start command** is wrapped
with `infisical run --`:

```
infisical run -- pnpm --filter @revido/api start
infisical run -- pnpm --filter @revido/worker start
infisical run -- pnpm --filter @revido/web exec vite preview
```

`infisical run` injects the project/environment secrets (`INFISICAL_TOKEN`, `INFISICAL_PROJECT_ID`,
`INFISICAL_ENVIRONMENT`) as env vars without writing to disk. `.env.example` documents every name.

### The secret inventory (what to populate in Infisical `staging`)

**Generatable now (no external account):**
- `BETTER_AUTH_SECRET`, `DEV_KMS_MASTER_KEY` — `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` each.
- `BETTER_AUTH_URL`, `WEB_ORIGIN`, `VITE_API_URL` — the deployed URLs.
- `DATABASE_URL` — Railway variable-ref to `Postgres.DATABASE_URL`.

**Need an external account/console:**
- Google: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (OAuth app, Gmail API + Pub/Sub), `GMAIL_PUBSUB_TOPIC`, `GMAIL_PUSH_AUDIENCE`, `GMAIL_PUSH_SA_EMAIL`.
- Microsoft: `MS_CLIENT_ID`/`MS_CLIENT_SECRET`/`MS_TENANT_ID` (Entra app, Graph), `GRAPH_CLIENT_STATE`, `GRAPH_NOTIFICATION_URL`.
- AI: `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY` (or `OPENAI_API_KEY`).
- Email: `RESEND_API_KEY`, `DIGEST_FROM`.
- Optional: `LEAD_NOTIFY_WEBHOOK_URL`, `VITE_POSTHOG_KEY`/`VITE_POSTHOG_HOST`, `STORAGE_S3_*` (large-file attachments; the ≤10 MB inline path works without it).

> Webhook secrets (`GMAIL_PUSH_AUDIENCE`, `GMAIL_PUSH_SA_EMAIL`, `GRAPH_CLIENT_STATE`) are **required
> in production** — the webhook endpoints refuse (500) if they're unset when `NODE_ENV=production`.

## `$PORT`

Railway assigns `$PORT`. `apps/api`/`apps/worker` read `process.env.PORT` in `src/index.ts`;
`apps/web`'s `vite.config.ts` reads `Number(process.env.PORT) || 5173`, and `apps/web/railway.json`
invokes `vite preview` directly (bypassing the `preview` script's hardcoded `--port`).

## CI gate

`.github/workflows/ci.yml` runs `pnpm install --frozen-lockfile` then `pnpm build && typecheck &&
lint && test` on every push/PR. Current status: **green — 391 tests**.

## Go-live checklist (the human-gated steps)

The codebase is complete and gate-green; going live needs actions only a human with the accounts can
perform. In order:

1. **Provision provider apps.** Create the Google Cloud project (Gmail API + Pub/Sub topic + OAuth
   consent) and the Microsoft Entra app (Graph + change-notification subscription). Use *test* mode
   for staging. Capture the client ids/secrets + Pub/Sub/Graph identifiers.
2. **Get AI + email keys.** Anthropic (enable ZDR on the org), Voyage (or OpenAI) with a
   no-retention agreement, Resend.
3. **Populate Infisical `staging`** with every secret above.
4. **Add the services.** In the `Revido Email` project: `railway add --service @revido/api --repo
   Revido-LLC/email` and the same for `@revido/worker`; set each Config File Path to its
   `railway.json`; wrap the start command in `infisical run --`; add a variable-ref to
   `Postgres.DATABASE_URL`.
5. **Smoke-test.** `GET /health` on the api; confirm `/api/auth/get-session` responds and a protected
   route 401s without a session.
6. **Real-mailbox e2e** (Part I §Verification): connect a real Gmail *and* a real Outlook account →
   onboarding counts animate from real data → read an EN and an NL thread → send a Dutch reply +
   undo → chat cites a cross-lingual email → create/dry-run/approve an agent → digest arrives → run
   the provable-purge check.
7. **Compliance (long-lead).** File **Google CASA Tier 2** (Gmail restricted scopes) and **Microsoft
   publisher verification** — these gate opening restricted scopes to the public and run in parallel
   with everything above.
8. **Cut over to prod.** Promote the schema to a prod DB, switch the OAuth apps to verified/published,
   point prod Railway at prod Infisical, and merge to **`revido-llc/main`** (production ships from
   there, not `origin/main`).

## Housekeeping

- Delete the deprecated `revido-mail-staging` project (it only held the old, now-replaced Postgres).
  This is 2FA-gated: do it in the Railway dashboard → project → Settings → Delete, or via an
  interactive `railway delete`.
- `S3StorageProvider` is a documented stub (like the AWS-KMS swap behind `DevKmsProvider`): wiring it
  needs an S3/R2 bucket + the SDK; the ≤10 MB inline attachment path works without it.
