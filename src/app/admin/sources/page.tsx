import { getPool } from "@/lib/db";
import { SourcesClient, type SourceListRow } from "@/app/admin/sources/sources-client";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const { rows } = await getPool().query<SourceListRow>(
    `select id, key, name, adapter, feed_url, enabled, licence_note
       from sources order by key`
  );
  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold">Sources</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A source is a row, not code — enable, disable or edit the feed URL without
        a deployment (§4.2). Changes take effect on the next poll.
      </p>
      <SourcesClient sources={rows} />
    </div>
  );
}
