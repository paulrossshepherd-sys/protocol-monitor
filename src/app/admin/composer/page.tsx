import { getPool } from "@/lib/db";
import { renderIssueHtml } from "@/lib/issue/render";
import {
  getIssueChanges,
  getOrCreateDraftIssue,
} from "@/app/admin/composer/data";
import { ComposerClient } from "@/app/admin/composer/composer-client";

export const dynamic = "force-dynamic";

export default async function ComposerPage() {
  const pool = getPool();
  const issue = await getOrCreateDraftIssue(pool);
  const changes = await getIssueChanges(pool, issue.id);
  const { rows: pending } = await pool.query<{ count: string }>(
    `select count(*) from changes where issue_id is null and status = 'pending'`
  );
  const previewHtml = renderIssueHtml(issue, changes);

  return (
    <ComposerClient
      issue={issue}
      changes={changes}
      pendingCount={Number(pending[0].count)}
      previewHtml={previewHtml}
    />
  );
}
