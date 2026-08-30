import type { Pool } from "pg";

import { makeTargetedFetcher } from "@/lib/nice/fetch-update-info";
import {
  parseNiceTsv,
  suggestsOther,
  type NiceDiffRow,
} from "@/lib/nice/paste";

// §6.4: diff the pasted table against raw_items; preview before commit;
// pasting the same table twice creates nothing (§9.10a).

async function niceSourceId(pool: Pool): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `select id from sources where key = 'nice'`
  );
  if (!rows[0]) throw new Error("The 'nice' source row is missing");
  return rows[0].id;
}

export async function previewNicePaste(
  pool: Pool,
  pasted: string
): Promise<NiceDiffRow[]> {
  const rows = parseNiceTsv(pasted);
  const sourceId = await niceSourceId(pool);
  const out: NiceDiffRow[] = [];

  for (const row of rows) {
    const { rows: existing } = await pool.query<{ revised_at: Date | null }>(
      `select revised_at from raw_items where source_id = $1 and external_id = $2`,
      [sourceId, row.ref]
    );
    let action: NiceDiffRow["action"];
    let reason: string;
    if (!existing[0]) {
      action = "new";
      reason = "unseen reference";
    } else {
      const stored = existing[0].revised_at
        ? existing[0].revised_at.toISOString().slice(0, 10)
        : null;
      if (row.lastUpdatedAt && (!stored || row.lastUpdatedAt > stored)) {
        action = "updated";
        reason = `last updated ${stored ?? "unknown"} → ${row.lastUpdatedAt}`;
      } else {
        action = "ignore";
        reason = "no change since last paste";
      }
    }
    out.push({ ...row, action, reason, suggestOther: suggestsOther(row.title) });
  }
  return out;
}

export interface NiceCommitResult {
  created: number;
  fetched: number;
  fetchErrors: number;
}

export async function commitNicePaste(
  pool: Pool,
  pasted: string
): Promise<NiceCommitResult> {
  const diff = await previewNicePaste(pool, pasted);
  const toCreate = diff.filter((d) => d.action !== "ignore");
  const sourceId = await niceSourceId(pool);

  const committedUrls: { itemId: string; url: string }[] = [];
  const client = await pool.connect();
  try {
    for (const row of toCreate) {
      await client.query("begin");
      try {
        let itemId: string;
        if (row.action === "new") {
          const {
            rows: [item],
          } = await client.query<{ id: string }>(
            `insert into raw_items
               (source_id, external_id, url, title, published_at, revised_at)
             values ($1, $2, $3, $4, $5, $6)
             on conflict (source_id, external_id) do nothing
             returning id`,
            [sourceId, row.ref, row.url, row.title, row.publishedAt, row.lastUpdatedAt]
          );
          if (!item) {
            // raced/duplicated within one paste — idempotence wins
            await client.query("rollback");
            continue;
          }
          itemId = item.id;
        } else {
          const {
            rows: [item],
          } = await client.query<{ id: string }>(
            `update raw_items set url = $3, title = $4, revised_at = $5
              where source_id = $1 and external_id = $2
              returning id`,
            [sourceId, row.ref, row.url, row.title, row.lastUpdatedAt]
          );
          itemId = item.id;
        }
        // relevance stays at its 'other' default; the terminated-evaluation
        // rule is a suggestion shown in the queue, never a preset (§6.4)
        await client.query(
          `insert into changes (raw_item_id, change_type)
           values ($1, $2)`,
          [itemId, row.action]
        );
        await client.query("commit");
        committedUrls.push({ itemId, url: row.url });
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
    }
  } finally {
    client.release();
  }

  // Targeted retrieval (§6.3): only the URLs this paste surfaced, sequentially.
  // Excerpts are internal queue data stored on raw_payload, never published.
  const fetchUpdateInfo = makeTargetedFetcher(committedUrls.map((c) => c.url));
  let fetched = 0;
  let fetchErrors = 0;
  for (const { itemId, url } of committedUrls) {
    const result = await fetchUpdateInfo(url);
    if (result.excerpt) fetched++;
    if (result.error) fetchErrors++;
    await pool.query(
      `update raw_items
          set raw_payload = coalesce(raw_payload, '{}'::jsonb) ||
            jsonb_build_object('update_information', $2::text, 'update_information_error', $3::text)
        where id = $1`,
      [itemId, result.excerpt, result.error]
    );
  }

  return { created: committedUrls.length, fetched, fetchErrors };
}
