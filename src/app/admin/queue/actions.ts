"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";
import { getPool } from "@/lib/db";
import { acceptDraftIntoNote, draftOneChange, type AcceptResult } from "@/lib/draft/generate";

// §6.3: acceptance is an explicit act. The draft becomes the admin's text only
// here, by copying draft_note into admin_note — relevance is never touched, by
// this action or by any model output. An impact line already written is never
// overwritten; clearing it first is the way to take the draft instead.
export async function acceptDraft(changeId: string): Promise<AcceptResult> {
  await requireAdmin();
  const result = await acceptDraftIntoNote(getPool(), changeId);
  revalidatePath("/admin/queue");
  return result;
}

/** Draft this one item now, on the operator's request. */
export async function requestDraft(changeId: string): Promise<string | null> {
  await requireAdmin();
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured — drafting unavailable.");
  }
  const draft = await draftOneChange(getPool(), changeId);
  revalidatePath("/admin/queue");
  return draft;
}

export async function setRelevance(changeId: string, relevance: "likely" | "other") {
  await requireAdmin();
  if (relevance !== "likely" && relevance !== "other") throw new Error("bad relevance");
  await getPool().query(
    `update changes set relevance = $2, status = 'pending'
      where id = $1 and status <> 'included'`,
    [changeId, relevance]
  );
  revalidatePath("/admin/queue");
}

export async function saveAdminNote(changeId: string, note: string) {
  await requireAdmin();
  await getPool().query(`update changes set admin_note = nullif($2, '') where id = $1`, [
    changeId,
    note,
  ]);
  revalidatePath("/admin/queue");
}

export async function setExcluded(changeId: string, excluded: boolean) {
  await requireAdmin();
  await getPool().query(
    `update changes set status = $2 where id = $1 and status <> 'included'`,
    [changeId, excluded ? "excluded_duplicate" : "pending"]
  );
  revalidatePath("/admin/queue");
}
