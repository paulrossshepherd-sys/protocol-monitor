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

### Additions beyond the spec's §6 model (spec silent, choice recorded here)

- `subscribers.confirm_token` — double opt-in (§7.2) needs a confirmation token; §6 only lists `unsubscribe_token`. Both default to random hex server-side.
- `poll_runs` table — §6.2 requires every poll logged (source, items seen, items new, errors) and failures visible on the dashboard; §6 has no table for it.
- `sources.created_at`, `issues.created_at`, and a CHECK that a `govuk_atom` source has a `feed_url`.

## Secrets

Only via environment variables; `.env.example` names every one. `.env*` is gitignored (except `.env.example`, un-ignored explicitly). Never commit keys.

## gov.uk fetching (§4.4)

Sequential, never parallel. Descriptive User-Agent including `GOVUK_CONTACT_EMAIL`. Never fetch `/search/all*`. Enrich only entries the feed reports as changed.

## Working practices

- Small commits, one concern per commit.
- Plain shadcn defaults in the UI; keyboard speed over looks in the admin.
- When reality contradicts the spec (feed format, missing field), stop and report — don't silently adapt.
