"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";
import { getPool } from "@/lib/db";

export async function setSourceEnabled(sourceId: string, enabled: boolean) {
  await requireAdmin();
  await getPool().query(`update sources set enabled = $2 where id = $1`, [
    sourceId,
    enabled,
  ]);
  revalidatePath("/admin/sources");
}

export async function setFeedUrl(sourceId: string, feedUrl: string) {
  await requireAdmin();
  // never allow the disallowed search path in as data either (§4.4)
  if (feedUrl && new URL(feedUrl).pathname.startsWith("/search/all")) {
    throw new Error("/search/all* is disallowed by gov.uk robots.txt (§4.4)");
  }
  await getPool().query(
    `update sources set feed_url = nullif($2, '') where id = $1`,
    [sourceId, feedUrl]
  );
  revalidatePath("/admin/sources");
}
