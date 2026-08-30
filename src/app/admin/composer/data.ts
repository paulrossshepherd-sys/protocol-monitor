import type { Pool } from "pg";

import type { ChangeForRender, IssueForRender } from "@/lib/issue/render";

export interface IssueRow extends IssueForRender {
  id: string;
  status: string;
}

export async function getOrCreateDraftIssue(pool: Pool): Promise<IssueRow> {
  const existing = await pool.query<IssueRow>(
    `select id, number, subject, period_start::text, period_end::text, intro, status
       from issues where status = 'draft' order by number desc limit 1`
  );
  if (existing.rows[0]) return existing.rows[0];

  const { rows } = await pool.query<IssueRow>(
    `insert into issues (number, period_start, period_end)
     select coalesce(max(number), 0) + 1,
            (current_date - interval '6 days')::date, current_date
       from issues
     returning id, number, subject, period_start::text, period_end::text, intro, status`
  );
  return rows[0];
}

export async function getIssueRow(pool: Pool, issueId: string): Promise<IssueRow> {
  const { rows } = await pool.query<IssueRow>(
    `select id, number, subject, period_start::text, period_end::text, intro, status
       from issues where id = $1`,
    [issueId]
  );
  if (!rows[0]) throw new Error("Issue not found");
  return rows[0];
}

export async function getIssueChanges(
  pool: Pool,
  issueId: string
): Promise<(ChangeForRender & { id: string })[]> {
  const { rows } = await pool.query(
    `select c.id, c.change_type, c.relevance, c.publisher_note, c.admin_note,
            r.title, r.url, r.external_id, s.name as source_name, s.key as source_key
       from changes c
       join raw_items r on r.id = c.raw_item_id
       join sources s on s.id = r.source_id
      where c.issue_id = $1 and c.status = 'included'
      order by (c.relevance = 'likely') desc, s.key, c.detected_at`,
    [issueId]
  );
  return rows;
}
