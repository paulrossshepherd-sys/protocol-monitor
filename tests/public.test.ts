import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Pool } from "pg";

import {
  formatPeriod,
  getPublishedIssue,
  listPublishedIssues,
  monthAndYear,
} from "@/lib/issue/public";
import { isPlausibleEmail, isOrgType, ORG_TYPES } from "@/lib/subscribers/org-types";
import {
  confirmSubscriber,
  startSignup,
  unsubscribeByToken,
} from "@/lib/subscribers/lifecycle";
import { freshDatabase } from "./helpers/db";

let pool: Pool;

before(async () => {
  pool = await freshDatabase();
});

after(async () => {
  await pool.end();
});

async function tokenFor(email: string, column: "confirm_token" | "unsubscribe_token") {
  const { rows } = await pool.query(
    `select ${column} as token from subscribers where email = $1`,
    [email]
  );
  return rows[0]?.token as string | null;
}

// ---------- double opt-in (§7.2, §9.7) ----------

test("signup creates an unconfirmed subscriber, never a sendable one", async () => {
  const outcome = await startSignup(pool, "Governance@Hospice.example", "Hospice");
  assert.equal(outcome.status, "confirmation_sent");

  const { rows } = await pool.query(
    `select email, org_type, confirmed_at, confirm_token, unsubscribe_token, source_note
       from subscribers`
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, "governance@hospice.example"); // normalised
  assert.equal(rows[0].org_type, "Hospice");
  assert.equal(rows[0].confirmed_at, null); // not on the list yet
  assert.ok(rows[0].confirm_token);
  assert.ok(rows[0].unsubscribe_token);
  assert.equal(rows[0].source_note, "public signup form");
});

test("confirming sets confirmed_at and burns the token (single use)", async () => {
  const token = (await tokenFor("governance@hospice.example", "confirm_token"))!;
  assert.equal(await confirmSubscriber(pool, token), "confirmed");

  const { rows } = await pool.query(
    `select confirmed_at, confirm_token from subscribers where email = $1`,
    ["governance@hospice.example"]
  );
  assert.ok(rows[0].confirmed_at);
  assert.equal(rows[0].confirm_token, null);

  // replaying the same link does nothing
  assert.equal(await confirmSubscriber(pool, token), "unknown_token");
  assert.equal(await confirmSubscriber(pool, "not-a-token"), "unknown_token");
});

test("signing up again when already confirmed does not reset anything", async () => {
  const outcome = await startSignup(pool, "governance@hospice.example", "Hospice");
  assert.equal(outcome.status, "already_confirmed");
  const { rows } = await pool.query(
    `select confirmed_at, confirm_token from subscribers where email = $1`,
    ["governance@hospice.example"]
  );
  assert.ok(rows[0].confirmed_at);
  assert.equal(rows[0].confirm_token, null);
});

test("an unconfirmed signup can be repeated and gets a fresh token", async () => {
  await startSignup(pool, "pending@practice.example", "GP federation");
  const first = await tokenFor("pending@practice.example", "confirm_token");
  const outcome = await startSignup(pool, "pending@practice.example", null);
  assert.equal(outcome.status, "confirmation_sent");
  const second = await tokenFor("pending@practice.example", "confirm_token");
  assert.notEqual(first, second);
  assert.equal(await confirmSubscriber(pool, first!), "unknown_token"); // old link dead
  assert.equal(await confirmSubscriber(pool, second!), "confirmed");

  const { rows } = await pool.query(
    `select count(*) from subscribers where email = $1`,
    ["pending@practice.example"]
  );
  assert.equal(Number(rows[0].count), 1); // no duplicate row
});

test("a suppressed address cannot quietly resubscribe (§6.5)", async () => {
  await pool.query(
    `insert into suppressions (email, reason) values ('complained@trust.example', 'complaint')`
  );
  const outcome = await startSignup(pool, "complained@trust.example", "Other");
  assert.equal(outcome.status, "suppressed");
  const { rows } = await pool.query(
    `select count(*) from subscribers where email = $1`,
    ["complained@trust.example"]
  );
  assert.equal(Number(rows[0].count), 0);
});

// ---------- unsubscribe (§7.2, §9.7) ----------

test("unsubscribe works by token alone, and is idempotent", async () => {
  const token = (await tokenFor("governance@hospice.example", "unsubscribe_token"))!;
  assert.equal(await unsubscribeByToken(pool, token), "unsubscribed");

  const { rows } = await pool.query(
    `select unsubscribed_at from subscribers where email = $1`,
    ["governance@hospice.example"]
  );
  assert.ok(rows[0].unsubscribed_at);

  // a mail client's RFC 8058 POST and a human click may both arrive
  assert.equal(await unsubscribeByToken(pool, token), "already_unsubscribed");
  assert.equal(await unsubscribeByToken(pool, "not-a-token"), "unknown_token");
});

test("an unsubscribed address is excluded from the sending list", async () => {
  const { rows } = await pool.query(
    `select email from subscribers
      where confirmed_at is not null and unsubscribed_at is null
        and email not in (select email from suppressions)`
  );
  assert.deepEqual(
    rows.map((r) => r.email),
    ["pending@practice.example"]
  );
});

test("someone who unsubscribed can come back through double opt-in", async () => {
  const outcome = await startSignup(pool, "governance@hospice.example", "Hospice");
  assert.equal(outcome.status, "confirmation_sent");
  const { rows } = await pool.query(
    `select confirmed_at, unsubscribed_at from subscribers where email = $1`,
    ["governance@hospice.example"]
  );
  assert.equal(rows[0].confirmed_at, null); // must confirm again
  assert.equal(rows[0].unsubscribed_at, null);
  assert.equal(
    await confirmSubscriber(pool, (await tokenFor("governance@hospice.example", "confirm_token"))!),
    "confirmed"
  );
});

// ---------- form input rules ----------

test("email and org type validation", () => {
  assert.equal(isPlausibleEmail("a@b.co"), true);
  assert.equal(isPlausibleEmail("no-at-sign"), false);
  assert.equal(isPlausibleEmail("two @spaces.com"), false);
  assert.equal(isPlausibleEmail(`${"x".repeat(250)}@b.co`), false);
  assert.equal(isOrgType("Hospice"), true);
  assert.equal(isOrgType("Something invented"), false);
  assert.equal(ORG_TYPES[0], "Independent primary care provider"); // ordered by fit
});

// ---------- archive (§6.1a, §7.2) ----------

test("the archive lists only sent issues and serves the stored snapshot", async () => {
  await pool.query(
    `insert into issues (number, subject, period_start, period_end, status, sent_at, slug, rendered_html)
     values (1, 'Guidance changes, 24-30 August', '2026-08-24', '2026-08-30', 'sent',
             '2026-08-30T08:00:00Z', '2026-08-30-issue-1', '<p>Stored snapshot</p>'),
            (2, 'Draft not yet sent', '2026-08-31', '2026-09-06', 'draft', null, null, null)`
  );

  const issues = await listPublishedIssues(pool);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].number, 1);

  const issue = (await getPublishedIssue(pool, "2026-08-30-issue-1"))!;
  assert.equal(issue.rendered_html, "<p>Stored snapshot</p>");
  assert.equal(await getPublishedIssue(pool, "2026-08-31-issue-2"), null); // drafts are not public
  assert.equal(await getPublishedIssue(pool, "no-such-slug"), null);
});

test("period and heading formatting", () => {
  assert.equal(
    formatPeriod({ period_start: "2026-08-24", period_end: "2026-08-30" }),
    "24 August to 30 August 2026"
  );
  assert.equal(
    formatPeriod({ period_start: "2026-12-28", period_end: "2027-01-03" }),
    "28 December 2026 to 3 January 2027"
  );
  assert.equal(formatPeriod({ period_start: null, period_end: null }), "");
  assert.equal(
    monthAndYear({ period_end: "2026-08-30", sent_at: new Date("2026-09-01") }),
    "August 2026"
  );
});
