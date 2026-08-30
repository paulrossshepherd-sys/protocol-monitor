import { getPool } from "@/lib/db";
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

  const results = await pollAllSources(getPool());
  const ok = results.every((r) => r.ok);
  return Response.json({ ok, results }, { status: ok ? 200 : 500 });
}
