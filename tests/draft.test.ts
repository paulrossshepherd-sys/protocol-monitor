import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Pool } from "pg";

import {
  acceptDraftIntoNote,
  allowedInAutomatedDrafting,
  buildDraftRequest,
  draftOneChange,
  draftPendingChanges,
} from "@/lib/draft/generate";
import type { DraftRequest } from "@/lib/draft/model";
import { freshDatabase } from "./helpers/db";

let pool: Pool;

/** Records every request that reaches "the model", for the §9.10 assertions. */
function recordingDrafter(reply = "Check protocols that name this product.") {
  const seen: DraftRequest[] = [];
  const drafter = async (request: DraftRequest) => {
    seen.push(request);
    return reply;
  };
  return { drafter, seen };
}

const NICE_EXCERPT = "August 2026: recommendation 1.7.2 amended, SGLT2 eligibility widened.";
const NICE_TITLE = "Type 2 diabetes in adults: management";

before(async () => {
  pool = await freshDatabase();
  const {
    rows: [ukhsa],
  } = await pool.query<{ id: string }>(`select id from sources where key = 'ukhsa_wide'`);
  const {
    rows: [nice],
  } = await pool.query<{ id: string }>(`select id from sources where key = 'nice'`);

  // one OGL item with a publisher note and body, one with nothing to draft from
  await pool.query(
    `with i as (
       insert into raw_items (source_id, external_id, url, title, raw_payload)
       values ($1, 'ukhsa-1', 'https://www.gov.uk/a', 'Measles: the Green Book, chapter 21',
               jsonb_build_object('body_excerpt', 'Chapter 21 covers measles immunisation.'))
       returning id
     )
     insert into changes (raw_item_id, change_type, publisher_note)
     select id, 'updated', 'Updated to include MMRV from 1 January 2026.' from i`,
    [ukhsa.id]
  );
  await pool.query(
    `with i as (
       insert into raw_items (source_id, external_id, url, title)
       values ($1, 'ukhsa-2', 'https://www.gov.uk/b', 'A page with no material')
       returning id
     )
     insert into changes (raw_item_id, change_type) select id, 'new' from i`,
    [ukhsa.id]
  );
  // a NICE item carrying an update-information excerpt in the queue
  await pool.query(
    `with i as (
       insert into raw_items (source_id, external_id, url, title, raw_payload)
       values ($1, 'NG28', 'https://www.nice.org.uk/guidance/ng28', $2,
               jsonb_build_object('update_information', $3::text))
       returning id
     )
     insert into changes (raw_item_id, change_type) select id, 'updated' from i`,
    [nice.id, NICE_TITLE, NICE_EXCERPT]
  );
});

after(async () => {
  await pool.end();
});

test("the automated pipeline never sends NICE-sourced content to a model (§9.10)", async () => {
  const { drafter, seen } = recordingDrafter();
  const result = await draftPendingChanges(pool, drafter);

  // the NICE item was skipped as licensed, not drafted and not silently dropped
  assert.equal(result.skippedLicensed, 1);
  assert.equal(result.drafted, 1);
  assert.equal(result.skippedNoMaterial, 1);

  // nothing NICE-derived reached the model: not the excerpt, not the title,
  // not the source label
  const everythingSent = JSON.stringify(seen);
  assert.doesNotMatch(everythingSent, /NICE/);
  assert.doesNotMatch(everythingSent, /SGLT2/);
  assert.doesNotMatch(everythingSent, new RegExp(NICE_TITLE));
  assert.equal(seen.length, 1);
  assert.match(seen[0].material, /MMRV from 1 January 2026/);

  // and the NICE change is still in the queue, drafted or not (§5)
  const { rows } = await pool.query(
    `select c.draft_note, c.admin_note from changes c
       join raw_items r on r.id = c.raw_item_id
      where r.external_id = 'NG28'`
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].draft_note, null);
  assert.equal(rows[0].admin_note, null);
});

test("the source-key boundary is explicit", () => {
  assert.equal(allowedInAutomatedDrafting("nice"), false);
  assert.equal(allowedInAutomatedDrafting("ukhsa_wide"), true);
  assert.equal(allowedInAutomatedDrafting("mhra_alerts"), true);
});

test("drafts land in draft_note and never in admin_note or relevance", async () => {
  const { rows } = await pool.query(
    `select c.draft_note, c.admin_note, c.relevance, c.draft_generated_at
       from changes c join raw_items r on r.id = c.raw_item_id
      where r.external_id = 'ukhsa-1'`
  );
  assert.match(rows[0].draft_note, /Check protocols/);
  assert.equal(rows[0].admin_note, null); // acceptance is a separate, explicit act
  assert.equal(rows[0].relevance, "other"); // the default — the model never sets it
  assert.ok(rows[0].draft_generated_at);
});

test("an item with no material is stamped, not retried forever", async () => {
  const { drafter, seen } = recordingDrafter();
  const result = await draftPendingChanges(pool, drafter);
  // everything already attempted; nothing is sent a second time
  assert.equal(seen.length, 0);
  assert.equal(result.drafted, 0);
  const { rows } = await pool.query(
    `select draft_note, draft_generated_at from changes c
       join raw_items r on r.id = c.raw_item_id where r.external_id = 'ukhsa-2'`
  );
  assert.equal(rows[0].draft_note, null);
  assert.ok(rows[0].draft_generated_at);
});

test("a drafting failure costs the queue nothing (§5)", async () => {
  const {
    rows: [source],
  } = await pool.query<{ id: string }>(`select id from sources where key = 'mhra_alerts'`);
  await pool.query(
    `with i as (
       insert into raw_items (source_id, external_id, url, title, raw_payload)
       values ($1, 'mhra-1', 'https://www.gov.uk/c', 'Class 2 recall: example',
               jsonb_build_object('body_excerpt', 'Recall of specific batches.'))
       returning id
     )
     insert into changes (raw_item_id, change_type) select id, 'new' from i`,
    [source.id]
  );

  const result = await draftPendingChanges(pool, async () => {
    throw new Error("model unavailable");
  });
  assert.equal(result.failed, 1);
  assert.equal(result.drafted, 0);

  const { rows } = await pool.query(
    `select c.id, c.draft_note from changes c join raw_items r on r.id = c.raw_item_id
      where r.external_id = 'mhra-1'`
  );
  assert.equal(rows.length, 1); // still in the queue
  assert.equal(rows[0].draft_note, null);
});

test("per-item drafting may use a NICE excerpt when the operator asks (§6.3)", async () => {
  const { rows } = await pool.query<{ id: string }>(
    `select c.id from changes c join raw_items r on r.id = c.raw_item_id
      where r.external_id = 'NG28'`
  );
  const { drafter, seen } = recordingDrafter("Check medicines-optimisation protocols.");
  const draft = await draftOneChange(pool, rows[0].id, drafter);

  // targeted and operator-initiated — the boundary §6.3 draws, unlike the
  // bulk pass above
  assert.equal(seen.length, 1);
  assert.match(seen[0].material, /SGLT2/);
  assert.match(draft!, /medicines-optimisation/);

  const { rows: after } = await pool.query(
    `select draft_note, admin_note from changes where id = $1`,
    [rows[0].id]
  );
  assert.match(after[0].draft_note, /medicines-optimisation/);
  assert.equal(after[0].admin_note, null); // still requires acceptance
});

test("accepting a draft never overwrites an impact line already written", async () => {
  const { rows } = await pool.query<{ id: string }>(
    `select c.id from changes c join raw_items r on r.id = c.raw_item_id
      where r.external_id = 'ukhsa-1'`
  );
  const changeId = rows[0].id;

  // first acceptance takes the draft into an empty impact line
  const first = await acceptDraftIntoNote(pool, changeId);
  assert.equal(first.applied, true);
  assert.match(first.adminNote!, /Check protocols/);

  // the operator then edits it in their own words
  const edited = "Immunisation protocols naming MMR product choice need review.";
  await pool.query(`update changes set admin_note = $2 where id = $1`, [changeId, edited]);

  // a stray 'a' keystroke must not destroy that edit
  const second = await acceptDraftIntoNote(pool, changeId);
  assert.equal(second.applied, false);
  assert.equal(second.reason, "already_written");
  assert.equal(second.adminNote, edited);

  const { rows: after } = await pool.query(
    `select admin_note from changes where id = $1`,
    [changeId]
  );
  assert.equal(after[0].admin_note, edited);
});

test("accepting reports the case where there is no draft to take", async () => {
  const { rows } = await pool.query<{ id: string }>(
    `select c.id from changes c join raw_items r on r.id = c.raw_item_id
      where r.external_id = 'ukhsa-2'`
  );
  const result = await acceptDraftIntoNote(pool, rows[0].id);
  assert.equal(result.applied, false);
  assert.equal(result.reason, "no_draft");
  assert.equal(result.adminNote, null);
});

test("material assembly skips items carrying nothing", () => {
  assert.equal(
    buildDraftRequest({
      id: "x",
      title: "T",
      change_type: "new",
      source_key: "ukhsa_wide",
      publisher_note: null,
      body_excerpt: null,
      update_information: null,
    }),
    null
  );
  const request = buildDraftRequest({
    id: "x",
    title: "T",
    change_type: "updated",
    source_key: "mhra_alerts",
    publisher_note: "note",
    body_excerpt: "body",
    update_information: null,
  })!;
  assert.equal(request.sourceLabel, "MHRA");
  assert.match(request.material, /note/);
  assert.match(request.material, /body/);
});
