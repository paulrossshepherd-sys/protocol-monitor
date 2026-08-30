"use server";

import { revalidatePath } from "next/cache";

import { getPool } from "@/lib/db";

export async function setRelevance(changeId: string, relevance: "likely" | "other") {
  if (relevance !== "likely" && relevance !== "other") throw new Error("bad relevance");
  await getPool().query(
    `update changes set relevance = $2, status = 'pending'
      where id = $1 and status <> 'included'`,
    [changeId, relevance]
  );
  revalidatePath("/admin/queue");
}

export async function saveAdminNote(changeId: string, note: string) {
  await getPool().query(`update changes set admin_note = nullif($2, '') where id = $1`, [
    changeId,
    note,
  ]);
  revalidatePath("/admin/queue");
}

export async function setExcluded(changeId: string, excluded: boolean) {
  await getPool().query(
    `update changes set status = $2 where id = $1 and status <> 'included'`,
    [changeId, excluded ? "excluded_duplicate" : "pending"]
  );
  revalidatePath("/admin/queue");
}
