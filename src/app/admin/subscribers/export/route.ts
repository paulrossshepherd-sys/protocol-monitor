import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET() {
  const { rows } = await getPool().query(
    `select email, org_type, confirmed_at, unsubscribed_at, source_note, created_at
       from subscribers order by created_at`
  );
  const header = "email,org_type,confirmed_at,unsubscribed_at,source_note,created_at";
  const body = rows
    .map((r) =>
      [r.email, r.org_type, r.confirmed_at?.toISOString() ?? "", r.unsubscribed_at?.toISOString() ?? "", r.source_note, r.created_at.toISOString()]
        .map(csvCell)
        .join(",")
    )
    .join("\n");
  return new Response(`${header}\n${body}\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="subscribers.csv"`,
    },
  });
}
