import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getPool } from "@/lib/db";
import { unsubscribeSubscriber } from "@/app/admin/subscribers/actions";

export const dynamic = "force-dynamic";

export default async function SubscribersPage() {
  const pool = getPool();
  const [{ rows: subs }, { rows: byOrg }, { rows: suppressions }] = [
    await pool.query(
      `select s.id, s.email, s.org_type, s.confirmed_at, s.unsubscribed_at,
              exists (select 1 from suppressions p where p.email = s.email) as suppressed
         from subscribers s order by s.created_at desc`
    ),
    await pool.query<{ org_type: string | null; count: string }>(
      `select org_type, count(*) from subscribers
        where confirmed_at is not null and unsubscribed_at is null
        group by org_type order by count(*) desc`
    ),
    await pool.query(
      `select email, reason, created_at, note from suppressions order by created_at desc`
    ),
  ];

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Subscribers</h1>
        <Button asChild variant="outline" size="sm">
          <a href="/admin/subscribers/export">Export CSV</a>
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {byOrg.map((o) => (
          <Badge key={o.org_type ?? "none"} variant="secondary">
            {o.org_type ?? "unspecified"}: {o.count}
          </Badge>
        ))}
        {byOrg.length === 0 && (
          <p className="text-sm text-muted-foreground">No confirmed subscribers yet.</p>
        )}
      </div>

      <div className="mt-5 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Org type</TableHead>
              <TableHead>Confirmed</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {subs.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-xs">{s.email}</TableCell>
                <TableCell>{s.org_type ?? "—"}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {s.confirmed_at ? new Date(s.confirmed_at).toISOString().slice(0, 10) : "—"}
                </TableCell>
                <TableCell>
                  {s.suppressed ? (
                    <Badge variant="destructive">suppressed</Badge>
                  ) : s.unsubscribed_at ? (
                    <Badge variant="outline">unsubscribed</Badge>
                  ) : s.confirmed_at ? (
                    <Badge variant="secondary">confirmed</Badge>
                  ) : (
                    <Badge variant="outline">awaiting confirm</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {!s.unsubscribed_at && (
                    <form
                      action={async () => {
                        "use server";
                        await unsubscribeSubscriber(s.id);
                      }}
                    >
                      <Button variant="outline" size="sm" type="submit">
                        Unsubscribe
                      </Button>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {subs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No subscribers yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <h2 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Suppression list — never sent to again (§6.5)
      </h2>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Since</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppressions.map((p) => (
              <TableRow key={p.email}>
                <TableCell className="font-mono text-xs">{p.email}</TableCell>
                <TableCell>{p.reason}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {new Date(p.created_at).toISOString().slice(0, 10)}
                </TableCell>
                <TableCell className="text-muted-foreground">{p.note ?? ""}</TableCell>
              </TableRow>
            ))}
            {suppressions.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Empty — good.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
