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

## Supabase project

Production is the **Protocol Monitor** project, ref `jamnlpyjwdwvglqcxxcx` (eu-west-1). Migrations are applied through the Supabase MCP connector's `apply_migration` so they land in the project's migration history — same SQL as the files in `supabase/migrations/`, never ad-hoc dashboard SQL.

The admin's auth user is created by hand in the dashboard (Authentication → Add user) with the address that `ADMIN_EMAIL` names. No code path creates users, deliberately — there is exactly one account and sign-up is not a feature.

## Data access

Server code talks to Postgres directly with `pg` via `DATABASE_URL` (`src/lib/db.ts`) — not supabase-js/PostgREST. Reasons: identical behaviour against local Postgres (integration tests) and Supabase (production, pooled connection string), and full SQL for the diff-heavy ingestion logic. supabase-js is used only for the admin's Auth session. RLS stays deny-all; `DATABASE_URL` is service-role-level and server-only.

## Authorisation — every entry point checks for itself

Middleware matches `/admin/:path*` and gates page loads, but **that is not the security boundary**: server actions resolve by action ID and can be POSTed to any route, including ones the matcher never sees. So:

- **Every server action calls `await requireAdmin()` as its first line** (`src/lib/auth/require-admin.ts`) — reads included, since a preview action leaks data just as a write action corrupts it.
- **Every route handler** that touches data does the same (`/admin/subscribers/export` returns 401 rather than throwing).
- `/api/cron/poll` is the exception: it has no user session, and authorises with `CRON_SECRET` instead.
- `requireAdmin()` takes an injectable user-getter so the deny paths are unit-testable without a request context.

Adding a new action or route handler means adding the check. There is no ambient protection to rely on.

## Model drafting (§6.3)

- Drafts live in `changes.draft_note`, never written straight to `admin_note`. Acceptance is an explicit operator act (`a` in the queue) that copies one into the other; the model never sets `relevance`, and no code path lets it.
- **The automated pass excludes NICE entirely** — not the excerpt, not the title, not the source label. Bulk, systematic processing of NICE content is the phase-3 licensed feature; per-item drafting the operator asks for (`d` in the queue) is the targeted, operator-in-the-loop case §6.3 permits. `allowedInAutomatedDrafting()` is the one place that boundary is drawn, and it is tested by asserting nothing NICE-derived reaches a recording drafter.
- Model is `claude-opus-5` at `effort: "medium"` — a bounded extraction with mandatory human review after it. One line in `src/lib/draft/model.ts` if that needs re-tuning.
- Drafters are injected (`Drafter` type), so tests never call the real API.
- A drafting failure must never cost the queue an item (§5): the change stays, without a draft. Items with nothing to draft from are stamped so later polls don't re-examine them.
- `ANTHROPIC_API_KEY` unset means no drafts at all — the queue still works and every line is hand-written.

## NICE retrieval (§6.3, §9.10)

- The update-information section lives at **`<guidance-url>/chapter/Update-information`** (verified on NG220), not on the root guidance page. Fetch the chapter page first; fall back to the root page for items laid out differently.
- The fetch allowlist is built from the URLs a paste surfaced, and permits **paths beneath** each one (chapter pages) — not sibling guidance items, not prefix-alikes (`ng280` is not beneath `ng28`), not other origins. Anything else throws rather than skipping quietly.
- A blocked fetch (nice.org.uk 403s much cloud-origin traffic) is recorded per item in `raw_items.raw_payload.update_information_error` and surfaced in the queue as "open the source page" — never fatal to the commit.
- Excerpts are internal queue data on `raw_payload`. They are never rendered into an issue; what ships is the operator's `admin_note`.

## Sources seeding

The launch sources are seeded by migration (`…_seed_sources.sql`, `on conflict do nothing`): gov.uk feeds plus a `manual` NICE row for the clipboard workflow. The wide UKHSA feed is the single UKHSA source — the keyword-filtered `ukhsa_green_book` feed is a strict subset that double-reports every item, so it is disabled by migration (operator's §4.1 correction). §4.5's "seed the API adapter as a disabled row" is deferred: §6's adapter CHECK only allows `govuk_atom | manual`, so the `nice_api` adapter value and its disabled row arrive with the phase-3 migration. (Reported to operator as a §4.5/§6 tension.)

## Testing

`npm test` (node:test via tsx) runs integration tests against a real local Postgres: schema rebuilt from the migration files, pipelines driven against local mock servers speaking gov.uk's Atom/Content API and NICE's page shapes. Tests run serially (`--test-concurrency=1`) because they share one database and each file rebuilds the schema.

Start Postgres and set `DATABASE_URL` first. In this build environment: cluster under `/tmp/pgdata`, port 55432, run as the unprivileged `pguser` (Postgres refuses to start as root, and needs `-k /tmp/pgdata` because `/var/run/postgresql` is not writable). The cluster does not survive between sessions and can die mid-session — restart it before running tests.

**Live gov.uk cannot be reached from this build environment** (egress-blocked at the proxy, confirmed by both curl and the fetch tool). The §9.1/§9.2 live-feed proof must run on the deployed cron over several days; it stays open until then.

## Secrets

Only via environment variables; `.env.example` names every one. `.env*` is gitignored (except `.env.example`, un-ignored explicitly). Never commit keys.

## gov.uk fetching (§4.4)

Sequential, never parallel. Descriptive User-Agent including `GOVUK_CONTACT_EMAIL`. Never fetch `/search/all*` — the guard is in `govukFetch`, and the sources screen refuses to save such a URL as data too. Enrich only entries the feed reports as changed.

## Ingestion invariants (§5, §6.1)

- **Nothing is dropped silently.** When a feed reports a revision but neither `change_history` nor a content hash can confirm it, an `updated` change is still created with a null `publisher_note`. Under-reporting is the failure mode with real consequences; a redundant row is not.
- **A `raw_item` never exists without its `change` row.** Both writes for an entry happen in one transaction. The enrichment HTTP call stays outside it — no network round-trip inside an open transaction.

## Working practices

- Small commits, one concern per commit.
- Plain shadcn defaults in the UI; keyboard speed over looks in the admin.
- When reality contradicts the spec (feed format, missing field), stop and report — don't silently adapt.
- **Verify the shape of an external page before building a parser against it.** The NICE update-information path was assumed rather than checked, and was wrong; the operator caught it. Where this environment cannot reach the source, say so and flag the assumption instead of leaving it silent in the code.
- Each build step ends at a review gate: report what was built, what was verified and how, and what remains open — then wait.
