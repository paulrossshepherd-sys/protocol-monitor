"use server";

import { revalidatePath } from "next/cache";

import { getPool } from "@/lib/db";
import { commitNicePaste, previewNicePaste } from "@/lib/nice/ingest";
import type { NiceDiffRow } from "@/lib/nice/paste";
import type { NiceCommitResult } from "@/lib/nice/ingest";

export async function previewAction(pasted: string): Promise<NiceDiffRow[]> {
  return previewNicePaste(getPool(), pasted);
}

export async function commitAction(pasted: string): Promise<NiceCommitResult> {
  const result = await commitNicePaste(getPool(), pasted);
  revalidatePath("/admin/queue");
  revalidatePath("/admin/nice");
  return result;
}
