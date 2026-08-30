import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DeliveryPage() {
  const { rows } = await getPool().query(
    `select i.number, i.subject, i.sent_at,
            count(s.id) as recipients,
            count(*) filter (where s.status = 'delivered') as delivered,
            count(*) filter (where s.status = 'bounced') as bounced,
            count(*) filter (where s.status = 'complained') as complained,
            count(*) filter (where s.status = 'failed') as failed
       from issues i join sends s on s.issue_id = i.id
      group by i.id order by i.number desc`
  );

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold">Delivery</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Per-issue outcomes from the sends table — how you notice a domain silently
        rejecting you (§7.1). Not vanity metrics.
      </p>
      <div className="mt-5 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Issue</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead className="text-right">Recipients</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead className="text-right">Bounced</TableHead>
              <TableHead className="text-right">Complained</TableHead>
              <TableHead className="text-right">Failed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.number}>
                <TableCell>
                  {r.number} {r.subject ? `— ${r.subject}` : ""}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {r.sent_at ? new Date(r.sent_at).toISOString().slice(0, 16).replace("T", " ") : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.recipients}</TableCell>
                <TableCell className="text-right tabular-nums">{r.delivered}</TableCell>
                <TableCell className="text-right tabular-nums">{r.bounced}</TableCell>
                <TableCell className="text-right tabular-nums">{r.complained}</TableCell>
                <TableCell className="text-right tabular-nums">{r.failed}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  Nothing sent yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
