"use server";

import { revalidatePath } from "next/cache";

import { getPool } from "@/lib/db";

// Manual unsubscribe (§7.1): mark unsubscribed and suppress, in one transaction.
export async function unsubscribeSubscriber(subscriberId: string) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const {
      rows: [sub],
    } = await client.query<{ email: string }>(
      `update subscribers set unsubscribed_at = coalesce(unsubscribed_at, now())
        where id = $1 returning email`,
      [subscriberId]
    );
    if (sub) {
      await client.query(
        `insert into suppressions (email, reason, note)
         values ($1, 'manual', 'unsubscribed by admin')
         on conflict (email) do nothing`,
        [sub.email]
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
  revalidatePath("/admin/subscribers");
}
