# MVP Specification — Guidance Change Digest

**Status:** build spec, v3 — all three sources live at launch
**Date:** 30 August 2026
**Audience:** Claude Code

---

## 1. What this is

A weekly email that tells people responsible for clinical protocols at UK healthcare organisations which national guidance changed that week, and what kind of document each change would affect.

It is a research instrument and a distribution channel. It is not yet the product it is intended to become. Build it accordingly: small, correct, and cheap to change.

**One admin user** (the operator) reviews and annotates each week's changes and sends the issue.
**N subscribers** receive the email. Subscribers have no accounts and no login.

### 1.1 Sources at launch — read this before anything else

**All three sources are live from issue one.** The product's whole claim is several sources in one view; a single-source digest contradicts its own pitch.

| Source | How it comes in at launch |
|---|---|
| **UKHSA** (Green Book chapters, immunisation programme guidance, Vaccine Update, Health Protection Report) | Automated: filtered gov.uk Atom feeds + Content API enrichment (§4.1) |
| **MHRA** (National Patient Safety Alerts, recalls, device safety, Drug Safety Update) | Automated: two confirmed gov.uk Atom feeds + Content API enrichment (§4.3) |
| **NICE** (guidance, quality standards) | Operator-in-the-loop: weekly clipboard ingestion of the published-guidance table, then targeted retrieval of each changed item's update-information section (§4.5, §6.4) |

What is *actually* phased is one thing only: **NICE automation at scale** — the syndication API, and bulk LLM processing of NICE content — which waits for the phase-3 licence (application, Cyber Essentials Plus, declared AI use). Until then NICE runs on thirty seconds of clipboard a week, which costs nothing and blocks nothing.

Every source runs through the same adapter interface (§4.2), so later additions — NHS England, SIGN — are configuration, not code.

## 2. Non-goals

Do not build any of the following. They are later phases and most depend on data that does not exist yet.

- Subscriber accounts, login, or any authenticated subscriber surface
- A protocol or document library belonging to customers
- Matching changes to customer documents (no embeddings, no pgvector)
- Payments, Stripe, plans, or billing of any kind
- Multi-tenancy, organisations-as-entities, or row-level security beyond protecting the single admin surface
- Any handling of patient data — see §8
- Automated judgement about whether a change is relevant — see §5
- The NICE syndication API, or bulk machine processing of NICE content — phase 3, behind the licence

If a requirement seems to imply one of these, it does not. Ask rather than infer.

## 3. Stack

- Next.js (App Router), TypeScript
- Supabase (Postgres) for storage; Supabase Auth for the single admin user
- Vercel for hosting; Vercel Cron for scheduled polling
- Resend for email — transactional sends only, not Broadcasts (§6.5)
- Tailwind + shadcn/ui

No other dependencies without a reason.

## 4. Data sources

### 4.1 UKHSA — the launch source

**What the Green Book actually is.** "Immunisation against infectious disease" is not one document. It is a collection of **42 separately-published chapters** — 12 in Part 1 (principles and procedures), 29 in Part 2 (diseases and vaccines), plus a contents document. Each chapter is its own gov.uk publication page carrying a single PDF. There is no HTML rendering of chapter content.

**Two traps that would otherwise cost a week:**

1. **`.atom` on a collection returns 404.** Collections are not finders. Confirmed. Do not build against `…/collections/immunisation-against-infectious-disease-the-green-book.atom`.
2. **The collection's `change_history` is useless for change detection.** Six entries since 2013, and it only fires when a chapter is *added* to the listing — never when a chapter is revised. The collection's `updated_at` moves regularly regardless. Poll the collection alone and you will miss nearly every substantive change while believing you have coverage.

**The feed to use:**

```
https://www.gov.uk/search/guidance-and-regulation.atom
  ?organisations[]=uk-health-security-agency
  &keywords=green+book
```

Confirmed valid Atom, newest first, not robots-blocked (§4.4). Returned roughly 20 relevant entries across one month at time of writing, four of them Green Book chapter revisions.

It mixes chapter revisions with adjacent immunisation programme guidance, schedule change notes and Vaccine Update issues. **Do not narrow the query to remove those** — they are usually worth reporting. Filter on title in your own code if the operator wants to group them separately.

Run a second, wider feed alongside it without the `keywords` parameter to catch immunisation-relevant UKHSA guidance that does not say "green book" — schedule changes, catch-up campaigns, aide-memoires. Expect more noise; that is what the review queue is for.

Also worth ingesting once the above is working: the **Health Protection Report** (weekly) and **Vaccine Update** (monthly). Both are gov.uk publications and surface in these feeds. Neither has a feed of its own.

**Enrichment.** For each entry, fetch the Content API record for **the chapter's own page** — `…/api/content/government/publications/<slug>` — where `change_history` is reliable and carries UKHSA's own note on what changed. Those notes are the best raw material the operator has for the impact line, and they are quotable. Real examples:

> "This chapter has been updated to include the introduction of the MMRV vaccine from 1 January 2026."
> "Updated wording on the routine vaccination schedule across MMRV Green Book chapters."

### 4.2 GOV.UK mechanics — build these once, reuse for every source

**The Content API.** `https://www.gov.uk/api/content/<path>`. No authentication, OGL-licensed. Returns `title`, `description`, `first_published_at`, `updated_at`, `details.body`, `details.metadata`, and — most importantly — **`details.change_history`**: an authoritative record of amendments with the publisher's own note on each. Prefer it to content hashing everywhere it exists (§6.1).

Do not depend on the GOV.UK Search API. It is documented as unsupported and subject to change.

**The filtered finder feed generalises.** `/search/guidance-and-regulation.atom` and `/search/news-and-communications.atom` both accept `organisations[]` and `keywords` and both return valid Atom. This works across all of gov.uk, not just UKHSA — NHS England, DHSC and others become subscribable by topic with no API key.

So: **a source is a feed URL held in the `sources` table, not a hardcoded adapter.** The `SourceAdapter` interface — `fetch(): Promise<RawItem[]>` — should have exactly two implementations at launch: `GovUkAtomFeed` (parameterised by URL) and `Manual`. Adding NHS England, or MHRA in phase 2, must be a row insert.

### 4.3 MHRA — live at launch

Two confirmed working feeds, both consumed by the same `GovUkAtomFeed` adapter:

| Feed | Covers |
|---|---|
| `https://www.gov.uk/drug-device-alerts.atom` | National Patient Safety Alerts, medicines recalls and notifications, device field safety notices, device safety information, monthly Safety Roundup |
| `https://www.gov.uk/drug-safety-update.atom` | Drug Safety Update articles |

Both enabled from launch. Note the format change: the monthly Drug Safety Update PDF was withdrawn in April 2025 and articles now publish individually, so do not build around a monthly bundle. Reference schemes useful for classification: `DSI/YYYY/NNN` for device safety information, `EL(YY)A/NN` for medicines recalls. Positioning caution for anything MHRA-sourced: see §4A — never claim "you'll never miss an alert"; CAS already does that job.

### 4.4 gov.uk polling etiquette

GOV.UK's reuse policy permits automated access subject to robots.txt and rate limiting.

Their robots.txt disallows `/*/print$` and **`/search/all*`**. That second rule matters: `/search/all.atom` is off limits, but `/search/guidance-and-regulation.atom` and `/search/news-and-communications.atom` are different paths and are not disallowed. Use those, and never fall back to `/search/all` when a query fails.

Documented edge rate limit is around 6 requests per minute per IP. Poll a few times a day, sequentially, with a descriptive User-Agent including a contact address. Never parallelise enrichment fetches, and only enrich entries the feed reports as changed — never walk all 42 chapters on every run.

### 4.5 NICE — live at launch via clipboard; API is the phase-3 upgrade

**At launch, NICE is covered through the operator-in-the-loop workflow in §6.4**: weekly clipboard ingestion of the published-guidance table detects changes; targeted retrieval pulls each changed item's update-information section into the queue; the operator reviews, and the published entry is his commentary with a link back to NICE. No licence is required for any of that.

**The syndication API is the automation upgrade, not a launch dependency.** It replaces the weekly paste with a cron job and unlocks bulk LLM summarisation of NICE content (the declared AI use). It requires an application, approval, and a signed licence:

- **Target the metadata-only licence** — titles, reference numbers, dates, URLs, status; free including outside the UK; four-year term. Exactly the scope needed.
- Docs: https://www.nice.org.uk/reusing-our-content/nice-syndication-api · Application: https://www.nice.org.uk/reusing-our-content/nice-syndication-api/nice-syndication-api-application-form · Enquiries: reuseofcontent@nice.org.uk
- **The gate is Cyber Essentials Plus** (or ISO 27001; DSPT is public sector only). The form is explicit: basic CE does not qualify, and uncertified applications will not be considered. Realistic cost for a sole trader: ~£2,000/year recurring (£320+VAT basic, then a quoted Plus audit within three months, both renewed annually). Spend it once paying customers justify it.
- A test licence cannot serve real users; API-served NICE content must not be altered.

Seed the API adapter as a disabled `sources` row that cannot be enabled without a key in the environment. Do not crawl nice.org.uk wholesale as a substitute for the API — targeted retrieval of operator-surfaced items (§6.4) is the boundary.

CKS and the BNF are out of scope. CKS content is Agilio's intellectual property; the BNF has its own API.

### 4.6 Not in v1

SIGN (no feed, static list, Scotland-only relevance), RCEM (PDFs, no feed), RCGP, MHRA SmPC/PIL labelling changes (products.mhra.gov.uk is search-only). Design so they can be added later.

## 4A. What the product is not competing with

**For UKHSA, the thing to answer is Vaccine Update.** It is UKHSA's free monthly newsletter for immunisation practitioners and it already covers schedule and eligibility changes. It is monthly not weekly, immunisation-only, single-source, and written for the clinician who administers vaccines rather than the person who owns the protocol document. UKHSA's urgent public health messages also cascade through the Central Alerting System. But **routine Green Book chapter revisions are not pushed to anyone in digestible form today** — that is the gap the launch product occupies, and it is a real one.

**For MHRA, the thing to answer is CAS.** MHRA run the Central Alerting System. National Patient Safety Alerts and MHRA drug and device alerts are already pushed through it free, to registered named recipients, with a read-acknowledgement, and registration is a contractual requirement for some provider types. The promise "you will never miss an MHRA alert" is already met by a system the buyer may be obliged to use. Never make that claim.

Coverage of both CAS and Vaccine Update is weighted towards NHS practices and trusts. Independent providers, occupational health services, urgent care and hospices are where it is thinnest.

What none of them do: bring several sources into one view, say which class of document a change sends someone back to, triage by relevance to an organisation type, and leave an evidence trail at the level a governance lead needs rather than a read receipt on one email. The failure in practice is not that alerts go unreceived. It is that they are received, acknowledged, and nothing happens to the protocol.

This shapes copy as much as code. Every issue reads as triage and synthesis, never as a relay.

## 5. The rule that governs the product

**Every change from every enabled source appears in the issue. Nothing is filtered out silently, ever.**

The admin marks items *likely relevant* or *other*, and the email shows both groups — the relevant ones with commentary, the rest as a plain list with links. A subscriber must always be able to see the complete set of changes for the period.

This is not a UI preference. If the product's implicit promise is "we will tell you what affects you" and it silently omits something that did, that is the failure mode with real consequences. Completeness with ranking is defensible; filtering is not. Do not add a relevance filter that hides items, and never let a model decide what the user sees.

## 6. Data model

```
sources
  id, key, name, adapter ('govuk_atom' | 'manual'), feed_url,
  enabled, licence_note, last_polled_at

raw_items
  id, source_id, external_id, url, title, published_at, revised_at,
  raw_payload jsonb, change_history_len, change_history_latest,
  content_hash, first_seen_at

changes
  id, raw_item_id, change_type ('new' | 'updated' | 'withdrawn'),
  detected_at, issue_id nullable,
  publisher_note text nullable,      -- quoted from change_history
  admin_note text nullable,          -- the impact line, written by hand
  relevance ('likely' | 'other') default 'other',
  status ('pending' | 'included' | 'excluded_duplicate')

issues
  id, number, subject, period_start, period_end,
  status ('draft' | 'sent'), sent_at, slug, intro text

subscribers
  id, email citext unique, org_type, confirmed_at, unsubscribed_at,
  source_note, created_at, unsubscribe_token

question_responses          -- replies to the weekly footer question
  id, subscriber_id nullable, issue_id, body text, received_at

sends                       -- one row per recipient per issue
  id, issue_id, subscriber_id, provider_message_id,
  status ('queued'|'sent'|'delivered'|'bounced'|'complained'|'failed'),
  sent_at, updated_at, error text nullable
  unique (issue_id, subscriber_id)

suppressions                -- never send to these again
  id, email citext unique,
  reason ('hard_bounce'|'complaint'|'manual'), created_at, note
```

### 6.1 Deduplication

An item is new if `(source_id, external_id)` is unseen.

For gov.uk sources, an item is an **update** if `details.change_history` has gained an entry since last seen. Store its length and latest entry. This is the publisher's own statement that something changed, and it carries a note saying what — put that note in `publisher_note`.

For sources with no equivalent, fall back to a hash of normalised content: text only, navigation and whitespace stripped. False "updates" every week will destroy trust in the digest faster than missing an item would.

### 6.2 Polling

Vercel Cron, daily at 07:00 UTC. Daily polling, weekly sending — the gap buffers against a source being down on send day. Log every poll: source, items seen, items new, errors. Failures must be visible on the admin dashboard, not swallowed.

### 6.3 LLM use — constrained

The only permitted use is **extraction**: turning a UKHSA (later MHRA) item into two or three factual sentences as a starting point the admin edits. Both are Crown copyright under the Open Government Licence, so this is unproblematic.

- **NICE retrieval is targeted, and the published words are the operator's.** After clipboard ingestion identifies changed items, the app fetches those specific guidance pages and extracts each one's "Update information" section into the review queue — verbatim, as a reading aid. The section sits under a consistent heading, so extraction is a parser job first; the model may condense it or draft an impact line from it, and the operator reviews and writes the published commentary. Constraints that keep this what it is: fetch only URLs surfaced by the operator's paste (a handful per week — never crawl); excerpts stay internal to the queue; full guideline text is not ingested and no NICE corpus is built. Bulk, systematic processing of NICE content is the phase-3 licensed feature, declared on the application as such.
  - **Firewall contingency:** nice.org.uk blocks much cloud-origin traffic; a Vercel-side fetch may 403. Test before building. Fallback: a bookmarklet or small extension that lifts the update-information section from the operator's own browser session at paste-time.
- As issues accumulate, past `admin_note` lines are legitimate model context ("changes to this guideline previously touched these document classes") — they are the operator's own editorial corpus.
- **Every queue item gets a proposed impact statement.** For each change, the model drafts an impact line from whatever material the item carries — the update-information excerpt for NICE, `publisher_note` and body text for the OGL sources — and the draft is shown in the review queue beside the source material. One click accepts it into `admin_note`, where the operator can edit before sending. The model never sets `relevance`, and a draft becomes the admin's text only by that explicit acceptance — but the default working motion is accept-and-tweak, not write-from-scratch.
- **Phase 3 note:** automated summarisation of NICE update-information text is precisely the AI use to declare on the licence application, described as: an LLM summarises update information into plain-language change notes, with operator review before publication. Apply with the product live; do not build it before approval.

The operator's commentary is original editorial work, not a derivative of anyone's guidance. Keep it that way — it is what makes the product defensible under licence and what makes it worth paying for.

### 6.4 Manual entry

The admin can create a `change` by hand with a URL and title, for anything from a source not yet adapted.

For NICE, manual entry is the *publishing* path, but detection can be automated without the licence. The rule that keeps this clean: **automation may feed the operator's private review queue; it may never populate the published digest.** What appears in an issue is always the operator's hand-written entry — his selection, his words, a link back to NICE.

**Primary detection route — clipboard ingestion.** NICE's published-guidance table (nice.org.uk/guidance/published) copies from the browser as clean tab-separated rows: URL, title, reference number, published date, last-updated date. Build a "Paste from NICE" box in the admin:

- Parse TSV rows (dates are en-GB long form, e.g. "26 August 2026"; reference number is `external_id`; tolerate a pasted header row).
- Diff against `raw_items`: unseen reference → `new`; known reference with a later last-updated date → `updated`; otherwise ignore.
- Show a preview of what will be created before committing. **Idempotent: pasting the same table twice creates nothing** (§9 acceptance criterion).
- Titles containing "(terminated evaluation)" may default the relevance *suggestion* to `other` — a deterministic rule, shown to the operator, never a filter.

Weekly operator action: filter the NICE page by last-updated from the previous paste date, results per page All, copy, paste. Around thirty seconds. On commit, the app fetches each changed item's guidance page and pulls its update-information section into the queue (see §6.3, including the firewall contingency), so the operator arrives at a queue that already says what changed and needs only review and commentary. Withdrawal detection is out of scope for this path.

Secondary, as a push notification between pastes: subscribe a dedicated inbound address to NICE's newsletters and alerts (nice.org.uk/nice-newsletters-and-alerts) and parse arriving mail into the queue. Sitemap polling and page-diffing remain fallbacks only; note nice.org.uk aggressively blocks cloud-origin fetching, so any fetch from Vercel must be tested before being relied on.

### 6.5 Sending and delivery

Send transactionally through Resend, one message per recipient, using the batch endpoint. Do not use Resend's Broadcasts — subscribers live in Postgres, each message carries its own unsubscribe token, and the issue is assembled from `changes` rows.

**Resend's free tier is 3,000 emails a month with a hard limit of 100 a day.** A weekly issue goes out in one burst, so the daily cap binds first and the real ceiling is 100 subscribers. Do not work around this by spreading a send across days — it hurts deliverability and confuses the archive. Instead:

- Before sending, count confirmed subscribers minus suppressions. If the total exceeds the configured daily cap, **block the send** and tell the operator to upgrade. A partial send is worse than a delayed one.
- Hold the cap in an environment variable so raising it is a config change when the account moves to a paid plan.

**Resend retains data for 30 days on the free tier, so it is not the record.** The `sends` table is. Write a row per recipient at send time with the returned `provider_message_id`, then update it from webhooks.

**Webhook endpoint** at `/api/webhooks/resend`, signature-verified, handling `email.delivered`, `email.bounced` and `email.complained`. On a hard bounce or a complaint, insert into `suppressions` and mark the subscriber unsubscribed. Every send must filter against `suppressions` — a complaint that keeps receiving mail is how a sending domain's reputation dies, and this audience is behind aggressive filters.

Log soft bounces without suppressing. Surface repeated soft bounces to the operator rather than acting automatically.

## 7. Screens

### 7.1 Admin (single user, Supabase Auth)

- **Dashboard** — poll status per source, pending change count, current draft issue
- **Review queue** — this period's changes. Per item: title, source, type, link, publisher note from `change_history`, model-extracted summary. Admin sets relevance, writes the impact line, or excludes as duplicate. Keyboard-navigable; this is a weekly repetitive task and speed matters.
- **Paste from NICE** — the clipboard-ingestion box described in §6.4: paste, preview the diff, commit to the queue.
- **Issue composer** — draft assembled from included changes, intro field, rotating footer question, preview, test send to admin, send.
- **Sources** — list, enable/disable, edit feed URL. This is how later sources (NHS England, the NICE API) get switched on without a deployment.
- **Subscribers** — list, counts by org type, CSV export, manual unsubscribe, suppression list.
- **Issue delivery** — per issue: sent, delivered, bounced, complained, drawn from `sends`. Not vanity metrics; this is how you notice a domain silently rejecting you.
- **Replies** — inbound replies captured against the issue.

### 7.2 Public

- **/** — what it is, current issue rendered inline, signup form: email + `org_type` select. Order the options by fit with the launch content: independent primary care provider / occupational health / GP federation / PCN / urgent or out-of-hours care / hospice / other. Double opt-in.
- **/archive** — every sent issue, newest first.
- **/archive/[slug]** — one issue at a permanent URL. **The most commercially important page on the site.** Semantic HTML, real `<title>` and meta description naming the period and the sources, month and year in the heading. These pages are the acquisition channel.
- **/privacy** — see §8
- **/unsubscribe/[token]** — one click, no login, confirmation page.

## 8. Legal and compliance requirements

Requirements, not suggestions.

- **No patient data. Ever.** No field may hold identifiable patient information. This is what keeps the product outside the scope of NHS clinical safety standards, and it is an architectural commitment, not a marketing position.
- **Article 14 notice.** Subscriber emails may be collected from public sources. Every first contact links to the privacy notice, which states what is held, where it came from, the lawful basis, retention, and how to be removed.
- **Sender identity and unsubscribe.** Every email carries an identifiable sender, a trading name, a reply-to a human reads, and a working one-click unsubscribe. Do not conceal the sender. Set `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) on every send, pointing at the token URL in §7.2. You are well under the bulk-sender thresholds that make this mandatory, but mail filters treat its presence as a positive signal and this audience sits behind strict ones.
- **Attribution — launch.** UKHSA and MHRA content is Crown copyright under the Open Government Licence v3.0, which explicitly permits commercial exploitation and adaptation. Required statement where no other is specified: "Contains public sector information licensed under the Open Government Licence v3.0", with a link to the licence. The licence does **not** cover departmental logos or crests, so do not reproduce UKHSA or MHRA branding. Material a publisher quotes from a third party — a manufacturer's own recall notice, for instance — may carry separate rights.
- **Attribution — phase 3.** NICE's requirements are heavier and affect layout: specified copyright and disclaimer wording, the NICE logo on every page carrying their content, above the fold, with nothing implying NICE approve the service, and NICE sign-off on a visual representation before go-live. Build the attribution block as one configurable component so this can be set later without touching layout.
- **Usage reporting — phase 3.** The NICE licence requires monthly reports: unique users, access frequency by system, channel and territory, and confirmation of cache refresh, by the 10th working day of the following month in Excel or CSV. Defer the `/admin/reports` view until the licence is signed, but keep the poll and subscriber tables shaped so it can be generated retrospectively.
- **Email authentication.** SPF, DKIM and DMARC on the sending domain before the first send. NHS-adjacent recipients filter aggressively and a bad start on deliverability is expensive to undo.
- **No clinical advice.** The digest reports that guidance changed and what class of document it may affect. It never says what a protocol should say.

## 9. Acceptance criteria

1. A cron run against all four gov.uk feeds (two UKHSA, two MHRA) populates `raw_items` and creates `changes` with correct types, on first run and on a later run after a source publishes an update.
2. A second poll with no upstream changes creates zero new `changes`. **The test that matters most** — prove it against the live feeds over several days, not with fixtures.
3. `publisher_note` is populated from `change_history` wherever the publisher supplied one.
4. Enabling a new source is a row insert with a feed URL and requires no code change. Demonstrate by adding a fifth gov.uk feed in a dev environment and removing it again.
4a. A single issue draft contains items from all three sources — UKHSA, MHRA and NICE — rendered with source labels.
5. The admin can go from an empty review queue to a sent issue in under fifteen minutes.
6. A sent issue appears at a permanent archive URL, renders without JavaScript, and passes a Lighthouse SEO check.
7. Signup is double opt-in; unsubscribe works in one click without login and is honoured on the next send.
8. A `sends` row exists for every recipient of every issue, and a simulated `email.bounced` webhook creates a suppression that excludes that address from the following send.
9. A send attempt above the configured daily cap is blocked outright, not truncated.
10. The NICE fetch step only ever requests URLs surfaced by clipboard ingestion — prove with a test that it cannot crawl or fetch beyond that set. Retrieved update-information excerpts are stored as internal queue data, never rendered in a published issue.
10a. Pasting the sample NICE table creates the right `new`/`updated` rows; pasting it again immediately creates zero.
11. Every item polled in a period is either included in an issue or explicitly marked a duplicate. Nothing is dropped without a recorded reason.

## 10. Open items for the operator

Launch depends on no licence and no accreditation. The critical path is short.

**Before the first issue:**

1. Choose the product name; register the domain with privacy protection.
2. Configure SPF, DKIM and DMARC.
3. Draft the privacy notice and the standing list of footer questions.
4. Write the first issue's impact lines by hand and decide whether that judgement is patternable. This is the real experiment.

**Deferred to phase 3 — do not spend before paying customers exist:**

5. Cyber Essentials Plus, ~£2,000/year all-in (£320+VAT basic assessment, then the Plus audit within three months of it, both renewed annually). The application form is explicit: basic CE does not qualify, and applications without certification will not be considered — so there is no cheaper question left to ask on this point.
6. Email NICE with one paragraph on the product and three questions: does the free metadata-only licence cover change monitoring of guidance metadata; would operator-written commentary on what a change affects count as adaptation or a derivative work; and what triggers a fee if non-UK subscribers sign up. Free to send at any time — but the answers change nothing until phase 3 is funded, and NICE coverage meanwhile runs on the clipboard workflow (§6.4).
7. Confirm current fee positions in writing before selling outside the UK — published overseas figures trace to a 2018 document and may be stale.

## 11. Product phasing beyond the digest — when the non-goals stop being non-goals

§2 says do not build accounts, tenancy, a document library, matching or payments. This section says when that changes, so the answer is written down before the temptation arrives.

**The trigger is never subscriber count.** A large list proves the writing is worth reading. It says nothing about whether anyone will work inside a tool.

**Stage A — the checklist. Build when three organisations have separately asked, unprompted, how to keep track of what they have acted on.** Replies and conversations both count; "useful, thanks" does not.

Scope it deliberately small: organisations and users, and a shared page per issue listing that issue's changes, each markable as *reviewed*, *action needed* or *not relevant*, with who, when, a free-text note, and an export. This is the first appearance of tenancy and row-level security, and the first thing to charge for.

It is explicitly **not** the document library. Its purpose is to answer one question cheaply: will they work inside the tool, or will they read the email and carry on in Outlook? Most people who ask for tracking do not use it. Two weeks of work is the right price for that answer; three months is not.

**Stage B — the document library.** Customers register their own protocols; changes are linked to named documents; review cycles, owners and due dates; evidence export. This is what justifies the price the business case depends on, and it should not start until Stage A shows sustained use.

**Stage C — matching.** Suggesting which of an organisation's documents a change affects. Last, because it needs a corpus of real customer documents to be any good, and because §5 still applies: it may rank, it may never filter.

**The counter-signal.** If fifteen to twenty issues have gone out and no one has raised tracking on their own, the digest is the product and the workflow layer was the operator's idea, not the customers'. The correct response is to charge for the digest, not to build Stage A anyway.

## 12. Known platform risks

**At launch.** The filtered finder feed (`/search/guidance-and-regulation.atom` with query parameters) is a working gov.uk behaviour, not a documented API contract with a stability guarantee. It could change without notice. Mitigate by keeping feed URLs in the database rather than in code, alerting the operator when a poll returns zero items or fails to parse, and never letting a silent failure look like a quiet week.

**Phase 3.** The NICE metadata licence is terminable on 30 days' notice without cause, and immediately for breach. Mitigate by running several sources, and by keeping the operator's commentary — not any publisher's data — as the thing customers actually pay for.
