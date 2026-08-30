import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Pool } from "pg";

import { pollAllSources } from "@/lib/ingest/poll";
import { govukFetch } from "@/lib/ingest/govuk-fetch";
import { freshDatabase } from "./helpers/db";
import { MockGovUk, type MockItem } from "./helpers/mock-govuk";

let pool: Pool;
let mock: MockGovUk;

const chapter21: MockItem = {
  slug: "government/publications/measles-the-green-book-chapter-21",
  title: "Measles: the green book, chapter 21",
  published: "2013-04-01T12:00:00+01:00",
  updated: "2026-08-10T09:00:00+01:00",
  changeHistory: [
    { note: "First published.", public_timestamp: "2013-04-01T12:00:00+01:00" },
    {
      note: "This chapter has been updated to include the introduction of the MMRV vaccine from 1 January 2026.",
      public_timestamp: "2026-08-10T09:00:00+01:00",
    },
  ],
};

const scheduleNote: MockItem = {
  slug: "government/publications/vaccination-schedule-note",
  title: "Routine vaccination schedule note",
  published: "2026-07-01T10:00:00+01:00",
  updated: "2026-07-01T10:00:00+01:00",
  changeHistory: [
    { note: "First published.", public_timestamp: "2026-07-01T10:00:00+01:00" },
  ],
};

// A record with no change_history — exercises the content-hash fallback (§6.1)
const hashOnly: MockItem = {
  slug: "drug-device-alerts/national-patient-safety-alert-example",
  title: "National Patient Safety Alert: example device",
  published: "2026-08-01T08:00:00+01:00",
  updated: "2026-08-01T08:00:00+01:00",
  changeHistory: null,
  body: "<div><p>Providers should  review use of the device.</p></div>",
};

before(async () => {
  pool = await freshDatabase();
  mock = new MockGovUk([
    { path: "/feed/ukhsa.atom", items: [chapter21, scheduleNote] },
    { path: "/feed/mhra.atom", items: [hashOnly] },
  ]);
  await mock.start();

  // The seeded real feeds can't be reached from tests; point two sources at
  // the mock instead. Sources are rows, so this is data, not code (§4.2).
  await pool.query(`update sources set enabled = false`);
  await pool.query(
    `insert into sources (key, name, adapter, feed_url, enabled) values
       ('test_ukhsa', 'Test UKHSA', 'govuk_atom', $1, true),
       ('test_mhra', 'Test MHRA', 'govuk_atom', $2, true)`,
    [`${mock.baseUrl}/feed/ukhsa.atom`, `${mock.baseUrl}/feed/mhra.atom`]
  );
});

after(async () => {
  await mock.stop();
  await pool.end();
});

async function count(sql: string): Promise<number> {
  const { rows } = await pool.query(sql);
  return Number(rows[0].count);
}

test("first poll creates raw_items and 'new' changes with publisher notes", async () => {
  const results = await pollAllSources(pool);
  assert.deepEqual(
    results.map((r) => ({ key: r.sourceKey, seen: r.itemsSeen, new: r.itemsNew, ok: r.ok })),
    [
      { key: "test_mhra", seen: 1, new: 1, ok: true },
      { key: "test_ukhsa", seen: 2, new: 2, ok: true },
    ]
  );
  assert.equal(await count(`select count(*) from raw_items`), 3);
  assert.equal(await count(`select count(*) from changes where change_type = 'new'`), 3);

  // §9.3: publisher_note populated from change_history where supplied
  const { rows } = await pool.query(
    `select c.publisher_note from changes c
       join raw_items r on r.id = c.raw_item_id
      where r.title like 'Measles%'`
  );
  assert.match(rows[0].publisher_note, /MMRV vaccine from 1 January 2026/);
});

test("second poll with no upstream changes creates zero new changes (§9.2)", async () => {
  const before = await count(`select count(*) from changes`);
  const results = await pollAllSources(pool);
  assert.ok(results.every((r) => r.ok));
  assert.equal(await count(`select count(*) from changes`), before);
  assert.equal(await count(`select count(*) from raw_items`), 3);
});

test("unchanged entries are not re-enriched (§4.4)", () => {
  const enrichmentCalls = mock.requestLog.filter((p) => p.startsWith("/api/content/"));
  // 3 items enriched once each on first poll; none on the second
  assert.equal(enrichmentCalls.length, 3);
});

test("a change_history gaining an entry creates exactly one 'updated' change", async () => {
  chapter21.changeHistory!.push({
    note: "Updated wording on the routine vaccination schedule across MMRV Green Book chapters.",
    public_timestamp: "2026-08-28T14:00:00+01:00",
  });
  chapter21.updated = "2026-08-28T14:00:00+01:00";

  const results = await pollAllSources(pool);
  const ukhsa = results.find((r) => r.sourceKey === "test_ukhsa")!;
  assert.equal(ukhsa.itemsUpdated, 1);
  assert.equal(await count(`select count(*) from changes where change_type = 'updated'`), 1);

  const { rows } = await pool.query(
    `select publisher_note from changes where change_type = 'updated'`
  );
  assert.match(rows[0].publisher_note, /routine vaccination schedule/);

  // and it is idempotent: polling again creates nothing further
  const again = await pollAllSources(pool);
  assert.ok(again.every((r) => r.itemsNew === 0 && r.itemsUpdated === 0));
});

test("content-hash fallback detects a body change when there is no change_history", async () => {
  // whitespace-only churn is not an update
  hashOnly.body = "<div><p>Providers   should review use of the device.</p></div>";
  hashOnly.updated = "2026-08-29T08:00:00+01:00";
  let results = await pollAllSources(pool);
  assert.equal(results.find((r) => r.sourceKey === "test_mhra")!.itemsUpdated, 0);

  // a real text change is
  hashOnly.body = "<div><p>Providers must stop use of the device immediately.</p></div>";
  hashOnly.updated = "2026-08-29T09:00:00+01:00";
  results = await pollAllSources(pool);
  assert.equal(results.find((r) => r.sourceKey === "test_mhra")!.itemsUpdated, 1);
});

test("a withdrawal creates a 'withdrawn' change", async () => {
  scheduleNote.withdrawn = true;
  scheduleNote.updated = "2026-08-29T10:00:00+01:00";
  await pollAllSources(pool);
  assert.equal(
    await count(`select count(*) from changes where change_type = 'withdrawn'`),
    1
  );
});

test("every poll is logged to poll_runs, and failures are recorded not swallowed (§6.2)", async () => {
  const okRuns = await count(`select count(*) from poll_runs where ok`);
  assert.ok(okRuns >= 12); // 2 sources × 6 polls so far

  await pool.query(
    `insert into sources (key, name, adapter, feed_url, enabled)
     values ('test_broken', 'Broken', 'govuk_atom', $1, true)`,
    [`${mock.baseUrl}/feed/does-not-exist.atom`]
  );
  const results = await pollAllSources(pool);
  const broken = results.find((r) => r.sourceKey === "test_broken")!;
  assert.equal(broken.ok, false);
  assert.match(broken.error!, /404/);
  assert.equal(
    await count(`select count(*) from poll_runs where not ok and error like '%404%'`),
    1
  );
  await pool.query(`update sources set enabled = false where key = 'test_broken'`);
});

test("enabling a new source is a row insert, no code change (§9.4)", async () => {
  await pool.query(
    `insert into sources (key, name, adapter, feed_url, enabled)
     values ('test_fifth', 'Fifth feed', 'govuk_atom', $1, true)`,
    [`${mock.baseUrl}/feed/mhra.atom`]
  );
  const results = await pollAllSources(pool);
  const fifth = results.find((r) => r.sourceKey === "test_fifth")!;
  assert.equal(fifth.ok, true);
  assert.equal(fifth.itemsSeen, 1);

  // "removing it again" is disabling: hard delete is blocked by design while
  // ingested raw_items reference the source
  await pool.query(`update sources set enabled = false where key = 'test_fifth'`);
  const rerun = await pollAllSources(pool);
  assert.equal(rerun.find((r) => r.sourceKey === "test_fifth"), undefined);
  await assert.rejects(
    () => pool.query(`delete from sources where key = 'test_fifth'`),
    /violates foreign key constraint/
  );
});

test("/search/all* is never fetched (§4.4)", async () => {
  await assert.rejects(
    () => govukFetch("https://www.gov.uk/search/all.atom?keywords=x"),
    /Refusing to fetch disallowed path/
  );
});
