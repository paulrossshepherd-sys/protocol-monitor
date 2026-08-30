import { getPool } from "@/lib/db";
import { unsubscribeByToken } from "@/lib/subscribers/lifecycle";

export const dynamic = "force-dynamic";

// RFC 8058 one-click endpoint (§8). Mail clients POST here from the
// List-Unsubscribe-Post header without a human visiting the site; no
// authentication beyond the token, and safe to repeat.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const outcome = await unsubscribeByToken(getPool(), token);
  if (outcome === "unknown_token") {
    return new Response("Unknown token", { status: 404 });
  }
  return new Response("Unsubscribed", { status: 200 });
}
