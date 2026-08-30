import { getPool } from "@/lib/db";
import { QueueClient, type QueueItem } from "@/app/admin/queue/queue-client";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const { rows } = await getPool().query<QueueItem>(
    `select c.id, c.change_type, c.relevance, c.status, c.publisher_note,
            c.admin_note, c.detected_at::text as detected_at,
            r.title, r.url, r.external_id,
            s.key as source_key,
            r.raw_payload->>'update_information' as update_information,
            r.raw_payload->>'update_information_error' as update_information_error
       from changes c
       join raw_items r on r.id = c.raw_item_id
       join sources s on s.id = r.source_id
      where c.issue_id is null
      order by c.detected_at desc`
  );

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold">Review queue</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every item ships in the issue — relevance ranks, it never hides (§5).
      </p>
      <QueueClient initialItems={rows} />
    </div>
  );
}
