import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

interface PollStatusRow {
  key: string;
  name: string;
  adapter: string;
  enabled: boolean;
  last_polled_at: Date | null;
  started_at: Date | null;
  items_seen: number | null;
  items_new: number | null;
  items_updated: number | null;
  ok: boolean | null;
  error: string | null;
}

export default async function DashboardPage() {
  const pool = getPool();
  const [{ rows: sources }, { rows: counts }, { rows: drafts }] = [
    await pool.query<PollStatusRow>(
      `select s.key, s.name, s.adapter, s.enabled, s.last_polled_at,
              r.started_at, r.items_seen, r.items_new, r.items_updated, r.ok, r.error
         from sources s
         left join lateral (
           select * from poll_runs where source_id = s.id
            order by started_at desc limit 1
         ) r on true
        order by s.key`
    ),
    await pool.query<{ pending: string; confirmed: string }>(
      `select
         (select count(*) from changes where status = 'pending') as pending,
         (select count(*) from subscribers
           where confirmed_at is not null and unsubscribed_at is null) as confirmed`
    ),
    await pool.query<{ number: number; included: string }>(
      `select i.number,
              (select count(*) from changes where issue_id = i.id) as included
         from issues i where i.status = 'draft' order by i.number desc limit 1`
    ),
  ];

  const draft = drafts[0];
  const fmt = (d: Date | null) =>
    d ? d.toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—";

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Pending changes
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{counts[0].pending}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Current draft
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {draft ? `Issue ${draft.number}` : "None"}
            {draft && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {draft.included} items
              </span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Confirmed subscribers
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{counts[0].confirmed}</CardContent>
        </Card>
      </div>

      <h2 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Poll status by source
      </h2>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Last run</TableHead>
              <TableHead className="text-right">Seen</TableHead>
              <TableHead className="text-right">New</TableHead>
              <TableHead className="text-right">Updated</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((s) => (
              <TableRow key={s.key}>
                <TableCell>
                  {s.name}
                  {!s.enabled && (
                    <Badge variant="outline" className="ml-2">
                      disabled
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {fmt(s.started_at ?? s.last_polled_at)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{s.items_seen ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{s.items_new ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{s.items_updated ?? "—"}</TableCell>
                <TableCell>
                  {s.adapter === "manual" ? (
                    <Badge variant="secondary">manual</Badge>
                  ) : s.ok === false ? (
                    <Badge variant="destructive">failed — {s.error ?? "see poll_runs"}</Badge>
                  ) : s.ok === true && s.items_seen === 0 ? (
                    <Badge variant="destructive">0 items — check the feed (§12)</Badge>
                  ) : s.ok === true ? (
                    <Badge variant="secondary">ok</Badge>
                  ) : (
                    <Badge variant="outline">never polled</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
