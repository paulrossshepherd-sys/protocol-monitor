-- Protocol Monitor — initial schema (SPEC.md §6).
-- Enum-like fields are text + CHECK constraints rather than Postgres enums,
-- so adding a value later is a plain migration, not an enum alteration.

create extension if not exists citext;
create extension if not exists pgcrypto; -- gen_random_bytes()

-- §6 sources: a source is a feed URL held in a row, not a hardcoded adapter (§4.2).
create table sources (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  name          text not null,
  adapter       text not null check (adapter in ('govuk_atom', 'manual')),
  feed_url      text,
  enabled       boolean not null default false,
  licence_note  text,
  last_polled_at timestamptz,
  created_at    timestamptz not null default now(),
  -- a govuk_atom source without a feed URL cannot be polled
  constraint feed_url_required_for_atom
    check (adapter <> 'govuk_atom' or feed_url is not null)
);

create table raw_items (
  id                     uuid primary key default gen_random_uuid(),
  source_id              uuid not null references sources (id) on delete restrict,
  external_id            text not null,
  url                    text not null,
  title                  text not null,
  published_at           timestamptz,
  revised_at             timestamptz,
  raw_payload            jsonb,
  change_history_len     integer,
  change_history_latest  text,
  content_hash           text,
  first_seen_at          timestamptz not null default now(),
  -- §6.1: an item is new if (source_id, external_id) is unseen
  unique (source_id, external_id)
);

create table issues (
  id            uuid primary key default gen_random_uuid(),
  number        integer not null unique,
  subject       text,
  period_start  date,
  period_end    date,
  status        text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at       timestamptz,
  slug          text unique,
  intro         text,
  -- §6.1a: sent issues render from this stored snapshot, never live joins
  rendered_html text,
  created_at    timestamptz not null default now()
);

create table changes (
  id              uuid primary key default gen_random_uuid(),
  raw_item_id     uuid not null references raw_items (id) on delete restrict,
  change_type     text not null check (change_type in ('new', 'updated', 'withdrawn')),
  detected_at     timestamptz not null default now(),
  issue_id        uuid references issues (id) on delete set null,
  publisher_note  text,   -- quoted from change_history (§6.1)
  admin_note      text,   -- the impact line, written by hand (§6.3)
  relevance       text not null default 'other' check (relevance in ('likely', 'other')),
  status          text not null default 'pending'
                    check (status in ('pending', 'included', 'excluded_duplicate'))
);

create index changes_status_idx on changes (status);
create index changes_issue_id_idx on changes (issue_id);
create index changes_raw_item_id_idx on changes (raw_item_id);

create table subscribers (
  id                uuid primary key default gen_random_uuid(),
  email             citext not null unique,
  org_type          text,
  confirmed_at      timestamptz,
  unsubscribed_at   timestamptz,
  source_note       text,
  created_at        timestamptz not null default now(),
  unsubscribe_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  -- single-use double opt-in token (§7.2): nulled by the confirm handler when
  -- confirmed_at is set, and the constraint holds it to that
  confirm_token     text unique default encode(gen_random_bytes(24), 'hex'),
  constraint confirm_token_single_use
    check (confirmed_at is null or confirm_token is null)
);

create table question_responses (
  id             uuid primary key default gen_random_uuid(),
  subscriber_id  uuid references subscribers (id) on delete set null,
  issue_id       uuid not null references issues (id) on delete cascade,
  body           text not null,
  received_at    timestamptz not null default now()
);

create index question_responses_issue_id_idx on question_responses (issue_id);

-- §6.5: the sends table is the delivery record; Resend is not (30-day retention).
create table sends (
  id                   uuid primary key default gen_random_uuid(),
  issue_id             uuid not null references issues (id) on delete restrict,
  subscriber_id        uuid not null references subscribers (id) on delete restrict,
  provider_message_id  text,
  status               text not null default 'queued'
                         check (status in ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed')),
  sent_at              timestamptz,
  updated_at           timestamptz not null default now(),
  error                text,
  unique (issue_id, subscriber_id)
);

create index sends_subscriber_id_idx on sends (subscriber_id);

create table suppressions (
  id          uuid primary key default gen_random_uuid(),
  email       citext not null unique,
  reason      text not null check (reason in ('hard_bounce', 'complaint', 'manual')),
  created_at  timestamptz not null default now(),
  note        text
);

-- Not in §6, required by §6.2 ("Log every poll: source, items seen, items new,
-- errors. Failures must be visible on the admin dashboard, not swallowed.")
create table poll_runs (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid not null references sources (id) on delete cascade,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  items_seen     integer not null default 0,
  items_new      integer not null default 0,
  items_updated  integer not null default 0,
  ok             boolean,
  error          text
);

create index poll_runs_source_id_started_at_idx on poll_runs (source_id, started_at desc);

-- RLS: deny-all for anon/authenticated on every table. All reads and writes go
-- through server code using the service-role key (single admin surface, §2).
-- No policies are created on purpose — enabling RLS with none blocks the
-- anon/authenticated roles entirely.
alter table sources enable row level security;
alter table raw_items enable row level security;
alter table issues enable row level security;
alter table changes enable row level security;
alter table subscribers enable row level security;
alter table question_responses enable row level security;
alter table sends enable row level security;
alter table suppressions enable row level security;
alter table poll_runs enable row level security;
