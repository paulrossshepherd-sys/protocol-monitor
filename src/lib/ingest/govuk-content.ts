import { createHash } from "node:crypto";

import { govukFetch } from "@/lib/ingest/govuk-fetch";

export interface Enrichment {
  /** Number of change_history entries, or null when the record has none. */
  changeHistoryLen: number | null;
  /** The publisher's note on the most recent change — quotable (§4.1). */
  latestNote: string | null;
  withdrawn: boolean;
  /** Fallback for records with no change_history (§6.1). */
  contentHash: string | null;
  /** Slim metadata kept in raw_payload (no body text — it can be large). */
  payload: Record<string, unknown>;
}

interface ChangeHistoryEntry {
  note?: unknown;
  public_timestamp?: unknown;
}

// Content API enrichment (§4.2): …/api/content/<path>, no auth, OGL.
// change_history on the item's own page is the authoritative change record.
export async function enrichFromContentApi(itemUrl: string): Promise<Enrichment> {
  const u = new URL(itemUrl);
  const res = await govukFetch(`${u.origin}/api/content${u.pathname}`);
  const record = (await res.json()) as {
    document_type?: unknown;
    public_updated_at?: unknown;
    withdrawn_notice?: Record<string, unknown>;
    details?: {
      change_history?: ChangeHistoryEntry[];
      body?: unknown;
    };
  };

  const history = Array.isArray(record.details?.change_history)
    ? record.details.change_history
    : null;
  const latest = history?.length
    ? [...history].sort((a, b) =>
        String(b.public_timestamp ?? "").localeCompare(String(a.public_timestamp ?? ""))
      )[0]
    : null;

  const body = typeof record.details?.body === "string" ? record.details.body : null;

  return {
    changeHistoryLen: history ? history.length : null,
    latestNote: latest?.note ? String(latest.note) : null,
    withdrawn:
      !!record.withdrawn_notice && Object.keys(record.withdrawn_notice).length > 0,
    contentHash: body ? hashNormalisedContent(body) : null,
    payload: {
      document_type: record.document_type ?? null,
      public_updated_at: record.public_updated_at ?? null,
      withdrawn: !!record.withdrawn_notice && Object.keys(record.withdrawn_notice).length > 0,
      change_history_latest_timestamp: latest?.public_timestamp ?? null,
    },
  };
}

// §6.1: hash normalised content — text only, tags and whitespace stripped —
// so markup or whitespace churn never reads as an update.
export function hashNormalisedContent(html: string): string {
  const textContent = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return createHash("sha256").update(textContent).digest("hex");
}
