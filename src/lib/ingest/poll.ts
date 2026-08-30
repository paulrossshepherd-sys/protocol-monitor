import type { Pool } from "pg";

import { GovUkAtomFeed } from "@/lib/ingest/govuk-atom";
import { enrichFromContentApi, type Enrichment } from "@/lib/ingest/govuk-content";
import type { FeedEntry, SourceRow } from "@/lib/ingest/types";

export interface PollResult {
  sourceKey: string;
  itemsSeen: number;
  itemsNew: number;
  itemsUpdated: number;
  ok: boolean;
  error: string | null;
}

interface RawItemRow {
  id: string;
  revised_at: Date | null;
  change_history_len: number | null;
  change_history_latest: string | null;
  content_hash: string | null;
  raw_payload: { withdrawn?: boolean } | null;
}

// Polls every enabled govuk_atom source, strictly sequentially (§4.4), and
// logs each run to poll_runs (§6.2) — success or failure, never swallowed.
export async function pollAllSources(pool: Pool): Promise<PollResult[]> {
  const { rows: sources } = await pool.query<SourceRow>(
    `select id, key, name, adapter, feed_url, enabled
       from sources
      where enabled and adapter = 'govuk_atom'
      order by key`
  );
  const results: PollResult[] = [];
  for (const source of sources) {
    results.push(await pollSource(pool, source));
  }
  return results;
}

export async function pollSource(pool: Pool, source: SourceRow): Promise<PollResult> {
  const {
    rows: [run],
  } = await pool.query<{ id: string }>(
    `insert into poll_runs (source_id) values ($1) returning id`,
    [source.id]
  );

  const result: PollResult = {
    sourceKey: source.key,
    itemsSeen: 0,
    itemsNew: 0,
    itemsUpdated: 0,
    ok: true,
    error: null,
  };

  try {
    if (!source.feed_url) throw new Error(`Source ${source.key} has no feed_url`);
    const entries = await new GovUkAtomFeed(source.feed_url).fetch();
    result.itemsSeen = entries.length;

    // Sequential on purpose — never parallelise gov.uk fetches (§4.4).
    for (const entry of entries) {
      const outcome = await processEntry(pool, source, entry);
      if (outcome === "new") result.itemsNew++;
      if (outcome === "updated") result.itemsUpdated++;
    }

    await pool.query(`update sources set last_polled_at = now() where id = $1`, [
      source.id,
    ]);
  } catch (err) {
    result.ok = false;
    result.error = err instanceof Error ? err.message : String(err);
  }

  await pool.query(
    `update poll_runs
        set finished_at = now(), items_seen = $2, items_new = $3,
            items_updated = $4, ok = $5, error = $6
      where id = $1`,
    [run.id, result.itemsSeen, result.itemsNew, result.itemsUpdated, result.ok, result.error]
  );

  return result;
}

type EntryOutcome = "new" | "updated" | "unchanged";

async function processEntry(
  pool: Pool,
  source: SourceRow,
  entry: FeedEntry
): Promise<EntryOutcome> {
  const {
    rows: [existing],
  } = await pool.query<RawItemRow>(
    `select id, revised_at, change_history_len, change_history_latest,
            content_hash, raw_payload
       from raw_items
      where source_id = $1 and external_id = $2`,
    [source.id, entry.externalId]
  );

  if (!existing) {
    // §6.1: unseen (source_id, external_id) → new
    const enrichment = await enrichFromContentApi(entry.url);
    const {
      rows: [item],
    } = await pool.query<{ id: string }>(
      `insert into raw_items
         (source_id, external_id, url, title, published_at, revised_at,
          raw_payload, change_history_len, change_history_latest, content_hash)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id`,
      [
        source.id,
        entry.externalId,
        entry.url,
        entry.title,
        entry.publishedAt,
        entry.revisedAt,
        enrichment.payload,
        enrichment.changeHistoryLen,
        enrichment.latestNote,
        enrichment.contentHash,
      ]
    );
    await pool.query(
      `insert into changes (raw_item_id, change_type, publisher_note)
       values ($1, 'new', $2)`,
      [item.id, enrichment.latestNote]
    );
    return "new";
  }

  // §4.4: only enrich entries the feed reports as changed.
  const feedRevised = entry.revisedAt ? new Date(entry.revisedAt) : null;
  if (
    feedRevised &&
    existing.revised_at &&
    feedRevised.getTime() <= existing.revised_at.getTime()
  ) {
    return "unchanged";
  }

  const enrichment = await enrichFromContentApi(entry.url);
  const wasWithdrawn = existing.raw_payload?.withdrawn === true;
  const changeType = detectChange(existing, enrichment, wasWithdrawn);

  await pool.query(
    `update raw_items
        set url = $2, title = $3, revised_at = $4, raw_payload = $5,
            change_history_len = $6, change_history_latest = $7, content_hash = $8
      where id = $1`,
    [
      existing.id,
      entry.url,
      entry.title,
      entry.revisedAt,
      enrichment.payload,
      enrichment.changeHistoryLen,
      enrichment.latestNote,
      enrichment.contentHash,
    ]
  );

  if (!changeType) return "unchanged";

  await pool.query(
    `insert into changes (raw_item_id, change_type, publisher_note)
     values ($1, $2, $3)`,
    [existing.id, changeType, enrichment.latestNote]
  );
  return "updated";
}

function detectChange(
  existing: RawItemRow,
  enrichment: Enrichment,
  wasWithdrawn: boolean
): "updated" | "withdrawn" | null {
  if (enrichment.withdrawn && !wasWithdrawn) return "withdrawn";

  // §6.1: for gov.uk, an update is change_history gaining an entry —
  // the publisher's own statement that something changed.
  if (enrichment.changeHistoryLen !== null && existing.change_history_len !== null) {
    return enrichment.changeHistoryLen > existing.change_history_len ? "updated" : null;
  }
  if (enrichment.changeHistoryLen !== null && existing.change_history_len === null) {
    // change_history appeared where there was none; trust a differing note
    return enrichment.latestNote !== existing.change_history_latest ? "updated" : null;
  }
  // No change_history at all: fall back to the normalised content hash.
  if (enrichment.contentHash && existing.content_hash) {
    return enrichment.contentHash !== existing.content_hash ? "updated" : null;
  }
  return null;
}
