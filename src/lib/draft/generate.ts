import type { Pool } from "pg";

import { claudeDrafter, type Drafter, type DraftRequest } from "@/lib/draft/model";

export interface DraftableChange {
  id: string;
  title: string;
  change_type: string;
  source_key: string;
  publisher_note: string | null;
  body_excerpt: string | null;
  update_information: string | null;
}

/**
 * §6.3: bulk, systematic processing of NICE content is the phase-3 licensed
 * feature. The automated path therefore never sends NICE-sourced material to a
 * model — not the excerpt, not the title, not anything. Per-item drafting the
 * operator asks for is a different matter (see draftOneChange), and stays
 * inside the "targeted, operator-in-the-loop" boundary the spec allows.
 */
export function allowedInAutomatedDrafting(sourceKey: string): boolean {
  return sourceKey !== "nice";
}

export function buildDraftRequest(change: DraftableChange): DraftRequest | null {
  const material = [
    change.publisher_note && `Publisher's note: ${change.publisher_note}`,
    change.update_information && `Update information: ${change.update_information}`,
    change.body_excerpt && `Body: ${change.body_excerpt}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!material.trim()) return null; // nothing to draft from

  return {
    title: change.title,
    sourceLabel: sourceLabel(change.source_key),
    changeType: change.change_type,
    material,
  };
}

function sourceLabel(key: string): string {
  if (key.startsWith("ukhsa")) return "UKHSA";
  if (key.startsWith("mhra")) return "MHRA";
  if (key === "nice") return "NICE";
  return key;
}

const SELECT_DRAFTABLE = `
  select c.id, c.change_type, c.publisher_note,
         r.title, s.key as source_key,
         r.raw_payload->>'body_excerpt' as body_excerpt,
         r.raw_payload->>'update_information' as update_information
    from changes c
    join raw_items r on r.id = c.raw_item_id
    join sources s on s.id = r.source_id`;

/** One item, on the operator's explicit request from the queue. */
export async function draftOneChange(
  pool: Pool,
  changeId: string,
  drafter: Drafter = claudeDrafter
): Promise<string | null> {
  const { rows } = await pool.query<DraftableChange>(
    `${SELECT_DRAFTABLE} where c.id = $1`,
    [changeId]
  );
  const change = rows[0];
  if (!change) throw new Error("Change not found");

  const request = buildDraftRequest(change);
  if (!request) return null;

  const draft = await drafter(request);
  await storeDraft(pool, change.id, draft);
  return draft || null;
}

export interface AutoDraftResult {
  drafted: number;
  skippedNoMaterial: number;
  /** NICE items, excluded from automated drafting by §6.3. */
  skippedLicensed: number;
  failed: number;
}

/**
 * The automated pass, run after each poll. Drafts for OGL sources only.
 * Model output lands in draft_note; relevance and admin_note are never
 * touched here — acceptance is the operator's explicit act (§6.3).
 */
export async function draftPendingChanges(
  pool: Pool,
  drafter: Drafter = claudeDrafter
): Promise<AutoDraftResult> {
  const { rows } = await pool.query<DraftableChange>(
    `${SELECT_DRAFTABLE}
      where c.draft_note is null
        and c.draft_generated_at is null
        and c.status = 'pending'
      order by c.detected_at`
  );

  const result: AutoDraftResult = {
    drafted: 0,
    skippedNoMaterial: 0,
    skippedLicensed: 0,
    failed: 0,
  };

  for (const change of rows) {
    if (!allowedInAutomatedDrafting(change.source_key)) {
      result.skippedLicensed++;
      continue;
    }
    const request = buildDraftRequest(change);
    if (!request) {
      // Stamp it so later polls don't re-examine an item that carries nothing
      // to draft from; the operator can still draft it by hand from the queue.
      await storeDraft(pool, change.id, "");
      result.skippedNoMaterial++;
      continue;
    }
    try {
      const draft = await drafter(request);
      await storeDraft(pool, change.id, draft);
      if (draft) result.drafted++;
      else result.skippedNoMaterial++;
    } catch {
      // A drafting failure must never cost the queue an item (§5): the change
      // stays, simply without a draft, and the operator writes the line.
      result.failed++;
    }
  }

  return result;
}

export interface AcceptResult {
  applied: boolean;
  adminNote: string | null;
  reason?: "already_written" | "no_draft";
}

/**
 * §6.3: acceptance copies draft_note into admin_note, and only ever into an
 * empty one. `a` is a single keystroke in a keyboard-driven queue, so an
 * accept that could overwrite the operator's own words would eventually
 * destroy them; the guard is in the SQL, not just the UI.
 */
export async function acceptDraftIntoNote(
  pool: Pool,
  changeId: string
): Promise<AcceptResult> {
  const { rows } = await pool.query<{ admin_note: string | null }>(
    `update changes set admin_note = draft_note
      where id = $1 and draft_note is not null and admin_note is null
      returning admin_note`,
    [changeId]
  );
  if (rows[0]) return { applied: true, adminNote: rows[0].admin_note };

  const { rows: current } = await pool.query<{
    admin_note: string | null;
    draft_note: string | null;
  }>(`select admin_note, draft_note from changes where id = $1`, [changeId]);
  if (!current[0]) throw new Error("Change not found");

  return {
    applied: false,
    adminNote: current[0].admin_note,
    reason: current[0].admin_note !== null ? "already_written" : "no_draft",
  };
}

async function storeDraft(pool: Pool, changeId: string, draft: string): Promise<void> {
  // draft_generated_at is stamped even for an empty draft, so a thin item is
  // not retried on every poll.
  await pool.query(
    `update changes
        set draft_note = nullif($2, ''), draft_generated_at = now()
      where id = $1`,
    [changeId, draft]
  );
}
