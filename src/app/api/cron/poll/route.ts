import { getPool } from "@/lib/db";
import { draftPendingChanges } from "@/lib/draft/generate";
import { requireEnv } from "@/lib/env";
import { pollAllSources } from "@/lib/ingest/poll";

export const dynamic = "force-dynamic";
// Sequential polling of several feeds plus enrichment can exceed the default
// serverless timeout; Vercel caps this by plan.
export const maxDuration = 300;

// Daily poll (§6.2), invoked by Vercel Cron with "Authorization: Bearer CRON_SECRET".
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${requireEnv("CRON_SECRET")}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const pool = getPool();
  const results = await pollAllSources(pool);

  // §6.3: draft impact lines for the new items, OGL sources only. Drafting
  // never blocks ingestion — a failure here leaves the changes in the queue
  // without drafts, and never fails a poll that succeeded.
  let drafts = null;
  let draftError: string | null = null;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      drafts = await draftPendingChanges(pool);
    } catch (err) {
      draftError = err instanceof Error ? err.message : String(err);
    }
  }

  const ok = results.every((r) => r.ok);
  return Response.json(
    { ok, results, drafts, draftError },
    { status: ok ? 200 : 500 }
  );
}
