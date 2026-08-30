import type { Pool } from "pg";

export interface PublishedIssue {
  number: number;
  subject: string | null;
  slug: string;
  sent_at: Date;
  period_start: string | null;
  period_end: string | null;
  /** §6.1a: the stored snapshot. Sent issues are never re-derived from joins. */
  rendered_html: string | null;
}

const PUBLISHED_COLUMNS = `number, subject, slug, sent_at,
       period_start::text as period_start, period_end::text as period_end,
       rendered_html`;

export async function listPublishedIssues(pool: Pool): Promise<PublishedIssue[]> {
  const { rows } = await pool.query<PublishedIssue>(
    `select ${PUBLISHED_COLUMNS} from issues
      where status = 'sent' and slug is not null
      order by number desc`
  );
  return rows;
}

export async function getPublishedIssue(
  pool: Pool,
  slug: string
): Promise<PublishedIssue | null> {
  const { rows } = await pool.query<PublishedIssue>(
    `select ${PUBLISHED_COLUMNS} from issues
      where status = 'sent' and slug = $1`,
    [slug]
  );
  return rows[0] ?? null;
}

export async function getLatestPublishedIssue(
  pool: Pool
): Promise<PublishedIssue | null> {
  const { rows } = await pool.query<PublishedIssue>(
    `select ${PUBLISHED_COLUMNS} from issues
      where status = 'sent' and slug is not null
      order by number desc limit 1`
  );
  return rows[0] ?? null;
}

export function formatPeriod(issue: {
  period_start: string | null;
  period_end: string | null;
}): string {
  if (!issue.period_start || !issue.period_end) return "";
  const f = (d: string, withYear: boolean) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
  const sameYear = issue.period_start.slice(0, 4) === issue.period_end.slice(0, 4);
  return `${f(issue.period_start, !sameYear)} to ${f(issue.period_end, true)}`;
}

/** Month and year for the archive heading (§7.2). */
export function monthAndYear(issue: { period_end: string | null; sent_at: Date }): string {
  const date = issue.period_end ? new Date(`${issue.period_end}T00:00:00Z`) : issue.sent_at;
  return date.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
