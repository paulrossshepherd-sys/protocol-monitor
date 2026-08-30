import { getPool } from "@/lib/db";
import { NicePasteClient } from "@/app/admin/nice/paste-client";

export const dynamic = "force-dynamic";

export default async function NicePage() {
  const { rows } = await getPool().query<{ last: Date | null }>(
    `select max(r.first_seen_at) as last
       from raw_items r join sources s on s.id = r.source_id
      where s.key = 'nice'`
  );
  const lastPaste = rows[0]?.last
    ? rows[0].last.toISOString().slice(0, 10)
    : null;

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold">Paste from NICE</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        On nice.org.uk/guidance/published: filter last-updated
        {lastPaste ? ` since ${lastPaste}` : " since your previous paste"}, results
        per page “All”, copy the table, paste here. Preview first — committing the
        same table twice creates nothing.
      </p>
      <NicePasteClient />
    </div>
  );
}
