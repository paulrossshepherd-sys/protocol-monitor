import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import type { Pool } from "pg";

import {
  extractUpdateInformation,
  makeTargetedFetcher,
} from "@/lib/nice/fetch-update-info";
import { commitNicePaste, previewNicePaste } from "@/lib/nice/ingest";
import { parseEnGbDate, parseNiceTsv } from "@/lib/nice/paste";
import { freshDatabase } from "./helpers/db";

// ---------- unit: TSV parsing ----------

test("parses en-GB long dates", () => {
  assert.equal(parseEnGbDate("26 August 2026"), "2026-08-26");
  assert.equal(parseEnGbDate("2 December 2015"), "2015-12-02");
  assert.equal(parseEnGbDate("Last updated"), null);
});

test("parses pasted rows with and without a URL column, tolerating a header", () => {
  const pasted = [
    "Title\tReference number\tPublished\tLast updated",
    "https://www.nice.org.uk/guidance/ng28\tType 2 diabetes in adults: management\tNG28\t2 December 2015\t28 August 2026",
    "Stroke rehabilitation in adults\tNG236\t18 October 2023\t27 August 2026",
    "",
  ].join("\n");
  const rows = parseNiceTsv(pasted);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].url, "https://www.nice.org.uk/guidance/ng28");
  assert.equal(rows[0].ref, "NG28");
  assert.equal(rows[0].lastUpdatedAt, "2026-08-28");
  // URL derived from the reference when the column is absent
  assert.equal(rows[1].url, "https://www.nice.org.uk/guidance/ng236");
  assert.equal(rows[1].publishedAt, "2023-10-18");
});

test("extracts the update-information section from HTML", () => {
  const html = `<h1>NG28</h1><h2>Recommendations</h2><p>...</p>
    <h2 id="u">Update information</h2><p>August 2026: recommendation 1.7.2 amended.</p>
    <ul><li>SGLT2 eligibility widened.</li></ul><h2>Context</h2><p>other</p>`;
  const text = extractUpdateInformation(html)!;
  assert.match(text, /recommendation 1\.7\.2 amended/);
  assert.match(text, /SGLT2 eligibility widened/);
  assert.doesNotMatch(text, /Context|other/);
  assert.equal(extractUpdateInformation("<h2>Nothing here</h2>"), null);
});

// ---------- integration: paste → preview → commit against real Postgres ----------

let pool: Pool;
let server: Server;
let baseUrl = "";
const requestLog: string[] = [];

function page(updateInfo: string): string {
  return `<html><body><h2>Update information</h2><p>${updateInfo}</p><h2>Next</h2></body></html>`;
}

before(async () => {
  pool = await freshDatabase();
  server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    requestLog.push(path);
    if (path === "/guidance/ng28") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(page("August 2026: recommendation 1.7.2 amended."));
    } else if (path === "/guidance/ng236") {
      // §6.3 firewall contingency: cloud-origin fetch blocked
      res.writeHead(403);
      res.end("blocked");
    } else {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(page("generic"));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve()))
  );
  await pool.end();
});

function tsv(rows: string[][]): string {
  return rows.map((r) => r.join("\t")).join("\n");
}

const paste1 = () =>
  tsv([
    ["Title", "Reference number", "Published", "Last updated"],
    [`${baseUrl}/guidance/ng28`, "Type 2 diabetes in adults: management", "NG28", "2 December 2015", "28 August 2026"],
    [`${baseUrl}/guidance/ng236`, "Stroke rehabilitation in adults", "NG236", "18 October 2023", "27 August 2026"],
    [`${baseUrl}/guidance/ta10945`, "Abc-123 for rare condition X (terminated evaluation)", "TA10945", "26 August 2026", "26 August 2026"],
  ]);

test("preview classifies rows and commit creates them; repeat paste creates zero (§9.10a)", async () => {
  const preview = await previewNicePaste(pool, paste1());
  assert.deepEqual(
    preview.map((r) => [r.ref, r.action]),
    [["NG28", "new"], ["NG236", "new"], ["TA10945", "new"]]
  );
  assert.equal(preview[2].suggestOther, true); // deterministic rule, shown not hidden

  const result = await commitNicePaste(pool, paste1());
  assert.equal(result.created, 3);

  // pasting the same table again immediately: everything ignores, nothing created
  const again = await previewNicePaste(pool, paste1());
  assert.ok(again.every((r) => r.action === "ignore"));
  const commit2 = await commitNicePaste(pool, paste1());
  assert.equal(commit2.created, 0);

  const { rows } = await pool.query(
    `select count(*) from changes c join raw_items r on r.id = c.raw_item_id
      join sources s on s.id = r.source_id where s.key = 'nice'`
  );
  assert.equal(Number(rows[0].count), 3);
});

test("a later last-updated date creates exactly one 'updated' change", async () => {
  const paste2 = tsv([
    [`${baseUrl}/guidance/ng28`, "Type 2 diabetes in adults: management", "NG28", "2 December 2015", "30 August 2026"],
  ]);
  const preview = await previewNicePaste(pool, paste2);
  assert.deepEqual(preview.map((r) => [r.ref, r.action]), [["NG28", "updated"]]);
  const result = await commitNicePaste(pool, paste2);
  assert.equal(result.created, 1);
  const { rows } = await pool.query(
    `select count(*) from changes where change_type = 'updated'`
  );
  assert.equal(Number(rows[0].count), 1);
});

test("the fetcher only ever requests surfaced URLs, and excerpts stay internal (§9.10)", async () => {
  // every request the commits made was to a pasted URL
  const fetched = requestLog.filter((p) => p.startsWith("/guidance/"));
  assert.ok(fetched.length > 0);
  assert.ok(fetched.every((p) => ["/guidance/ng28", "/guidance/ng236", "/guidance/ta10945"].includes(p)));

  // and a URL outside the surfaced set is refused outright
  const fetcher = makeTargetedFetcher([`${baseUrl}/guidance/ng28`]);
  await assert.rejects(
    () => fetcher(`${baseUrl}/guidance/anything-else`),
    /not surfaced by clipboard ingestion/
  );

  // excerpt captured where the fetch succeeded; failure recorded where blocked
  const { rows } = await pool.query(
    `select external_id, raw_payload->>'update_information' as info,
            raw_payload->>'update_information_error' as err
       from raw_items r join sources s on s.id = r.source_id
      where s.key = 'nice' order by external_id`
  );
  const ng28 = rows.find((r) => r.external_id === "NG28")!;
  const ng236 = rows.find((r) => r.external_id === "NG236")!;
  assert.match(ng28.info, /recommendation 1\.7\.2 amended/);
  assert.equal(ng236.info, null);
  assert.match(ng236.err, /403/); // firewall contingency recorded, not fatal
});
