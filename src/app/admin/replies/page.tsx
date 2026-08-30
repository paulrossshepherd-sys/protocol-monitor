import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function RepliesPage() {
  const { rows } = await getPool().query(
    `select q.id, q.body, q.received_at, i.number as issue_number, s.email
       from question_responses q
       join issues i on i.id = q.issue_id
       left join subscribers s on s.id = q.subscriber_id
      order by q.received_at desc`
  );

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold">Replies</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Answers to the footer question, captured against the issue.
      </p>
      <div className="mt-5 flex flex-col divide-y rounded-lg border px-4">
        {rows.map((r) => (
          <div key={r.id} className="py-3">
            <div className="flex justify-between gap-3 text-sm">
              <strong>{r.email ?? "unknown sender"}</strong>
              <span className="tabular-nums text-muted-foreground">
                issue {r.issue_number} · {new Date(r.received_at).toISOString().slice(0, 10)}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-line text-sm">{r.body}</p>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="py-3 text-sm text-muted-foreground">No replies captured yet.</p>
        )}
      </div>
    </div>
  );
}
