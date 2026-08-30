"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";
import { getPool } from "@/lib/db";
import { draftOneChange } from "@/lib/draft/generate";

// §6.3: acceptance is an explicit act. The draft becomes the admin's text only
// here, by copying draft_note into admin_note — relevance is never touched, by
// this action or by any model output.
export async function acceptDraft(changeId: string): Promise<string | null> {
  await requireAdmin();
  const { rows } = await getPool().query<{ admin_note: string | null }>(
    `update changes set admin_note = draft_note
      where id = $1 and draft_note is not null
      returning admin_note`,
    [changeId]
  );
  revalidatePath("/admin/queue");
  return rows[0]?.admin_note ?? null;
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
