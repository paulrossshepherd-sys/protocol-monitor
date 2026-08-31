# Protocol Monitor

A weekly email digest telling people responsible for clinical protocols at UK
healthcare organisations which national guidance changed that week — UKHSA,
MHRA and NICE — and what kind of document each change would send them back to.

`spec.md` is the authority for what this is and how it behaves.
`CLAUDE.md` records the conventions and the decisions made where the spec is
silent. Read both before changing anything.

## Running it locally

Requires **Node 22+** and a **Postgres 16+** you can write to.

```bash
git clone https://github.com/paulrossshepherd-sys/protocol-monitor
cd protocol-monitor
npm install
cp .env.example .env.local
```

### 1. Point it at a database

Pick one:

**A local Postgres (recommended for development).** Anything works — Docker,
Postgres.app, Homebrew. Create an empty database, then apply the migrations in
filename order:

```bash
createdb protocol_monitor
for f in supabase/migrations/*.sql; do psql -d protocol_monitor -f "$f"; done
```

Then set in `.env.local`:

```
DATABASE_URL=postgres://localhost:5432/protocol_monitor
```

**Or the Supabase project**, if you'd rather not install Postgres. The schema is
already applied there. Copy the connection string from the Supabase dashboard
(Project settings → Database) into `DATABASE_URL`. Note this is shared, real
data — `npm run seed:demo` refuses to touch it.

### 2. Minimum environment

For the public pages, `.env.local` needs only:

```
DATABASE_URL=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

The admin also needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
and `ADMIN_EMAIL`. Sending email needs `RESEND_API_KEY`; model drafts need
`ANTHROPIC_API_KEY`. Everything is listed in `.env.example`, and each feature
degrades rather than crashes when its key is absent.

### 3. Demo content, so the pages aren't empty

```bash
npm run seed:demo
```

Three sent issues with realistic content, rendered through the real issue
renderer. **This deletes all existing rows first**, so it refuses to run against
anything but a local database.

### 4. Start it

```bash
npm run dev     # http://localhost:3000
```

| Page | What it is |
|---|---|
| `/` | Landing page, current issue inline, double opt-in signup |
| `/archive` | Every sent issue |
| `/archive/[slug]` | One issue at a permanent URL — the acquisition page |
| `/privacy` | Placeholder copy, Article 14 headings in place |
| `/admin` | The operator's screens (sign-in required) |

**To sign in to `/admin`** you need a Supabase auth user whose email matches
`ADMIN_EMAIL`. Create it by hand in the Supabase dashboard
(Authentication → Add user); no code path creates users, deliberately.

## Tests

```bash
npm test
```

Integration tests against a real Postgres — the schema is rebuilt from the
migration files on every run, and the ingestion and NICE pipelines are driven
against local mock servers. Set `DATABASE_URL` to a **throwaway** database: the
suite drops and recreates the `public` schema.

```bash
createdb protocol_monitor_test
DATABASE_URL=postgres://localhost:5432/protocol_monitor_test npm test
```

## Deploying

Vercel, with the environment variables from `.env.example` set in the project.
`vercel.json` registers the daily poll at 07:00 UTC against `/api/cron/poll`,
which authorises with `CRON_SECRET`.
