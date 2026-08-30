# Protocol Monitor — conventions

`spec.md` is the authority for this project. Where it and anything else disagree, the spec wins. This file records the boring choices made where the spec is silent.

## Stack

- Next.js (App Router) + TypeScript, `src/` layout, `@/*` import alias
- Tailwind v4 (CSS-first config in `src/app/globals.css`; no `tailwind.config`)
- shadcn/ui, new-york style, neutral base
- Supabase (Postgres + Auth for the one admin user)
- Resend for email (transactional batch sends only — never Broadcasts, §6.5)

## shadcn/ui components are vendored by hand

The shadcn registry (`ui.shadcn.com`) is blocked by this build environment's egress proxy, so `npx shadcn add` fails. Components in `src/components/ui/` are hand-copied from upstream shadcn source (which is all the CLI does). When a new component is needed, install its Radix dependency from npm and vendor the component file the same way.

## Database

- **Migrations are the only way the schema changes.** Files live in `supabase/migrations/`, named `YYYYMMDDHHMMSS_description.sql`. No `db push` from local state, no dashboard edits.
- Enum-like columns are `text` + `CHECK` constraints, not Postgres enums (adding a value stays a one-line migration).
- Primary keys are `uuid default gen_random_uuid()`; timestamps are `timestamptz`.
- Emails are `citext` (extension enabled in the init migration).
- **RLS is deny-all**: enabled on every table with no policies. All data access goes through server code using `SUPABASE_SERVICE_ROLE_KEY`; the anon key is only used for the admin's Supabase Auth session. This is the "row-level security beyond protecting the single admin surface" boundary from §2 — do not add per-table policies for subscribers, who have no accounts.

### Schema notes

- `subscribers.confirm_token` (double opt-in, §7.2) and `poll_runs` (§6.2 logging) started as spec-silent additions; the operator has accepted both into the spec. `confirm_token` is single-use: nullable, unique, nulled when `confirmed_at` is set (CHECK-enforced).
- `issues.rendered_html` — §6.1a: a sent issue renders from this stored snapshot, never from live joins against `changes`.
- Extra hardening beyond §6: `sources.created_at`, `issues.created_at`, a CHECK that a `govuk_atom` source has a `feed_url`, `changes.raw_item_id` is `on delete restrict`.
- Note: the repo's `spec.md` predates the operator's v3 revisions above (`rendered_html`, §6.1a) — the operator is to push the updated text; until then this file records them.

## Data access

Server code talks to Postgres directly with `pg` via `DATABASE_URL` (`src/lib/db.ts`) — not supabase-js/PostgREST. Reasons: identical behaviour against local Postgres (integration tests) and Supabase (production, pooled connection string), and full SQL for the diff-heavy ingestion logic. supabase-js is used only for the admin's Auth session. RLS stays deny-all; `DATABASE_URL` is service-role-level and server-only.

## Sources seeding

The launch sources are seeded by migration (`…_seed_sources.sql`, `on conflict do nothing`): gov.uk feeds plus a `manual` NICE row for the clipboard workflow. The wide UKHSA feed is the single UKHSA source — the keyword-filtered `ukhsa_green_book` feed is a strict subset that double-reports every item, so it is disabled by migration (operator's §4.1 correction). §4.5's "seed the API adapter as a disabled row" is deferred: §6's adapter CHECK only allows `govuk_atom | manual`, so the `nice_api` adapter value and its disabled row arrive with the phase-3 migration. (Reported to operator as a §4.5/§6 tension.)

## Testing

`npm test` (node:test via tsx) runs integration tests against a real local Postgres: schema rebuilt from the migration files, pipeline driven against a local mock server speaking gov.uk's Atom/Content API shapes. Start Postgres and set `DATABASE_URL` first (in this build environment: cluster under `/tmp/pgdata`, port 55432, run as `pguser`). Live gov.uk cannot be reached from this build environment (egress-blocked) — the §9.1/§9.2 live-feed proof must run on the deployed cron.

## Secrets

Only via environment variables; `.env.example` names every one. `.env*` is gitignored (except `.env.example`, un-ignored explicitly). Never commit keys.

## gov.uk fetching (§4.4)

Sequential, never parallel. Descriptive User-Agent including `GOVUK_CONTACT_EMAIL`. Never fetch `/search/all*`. Enrich only entries the feed reports as changed.

## Working practices

- Small commits, one concern per commit.
- Plain shadcn defaults in the UI; keyboard speed over looks in the admin.
- When reality contradicts the spec (feed format, missing field), stop and report — don't silently adapt.
