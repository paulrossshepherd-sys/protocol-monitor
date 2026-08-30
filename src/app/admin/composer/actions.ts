"use server";

import { revalidatePath } from "next/cache";

import { getPool } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import { renderIssueHtml } from "@/lib/issue/render";
import { getIssueChanges, getIssueRow } from "@/app/admin/composer/data";

export async function updateIssueFields(
  issueId: string,
  fields: { subject: string; intro: string; period_start: string; period_end: string }
) {
  await getPool().query(
    `update issues
        set subject = nullif($2, ''), intro = nullif($3, ''),
            period_start = nullif($4, '')::date, period_end = nullif($5, '')::date
      where id = $1 and status = 'draft'`,
    [issueId, fields.subject, fields.intro, fields.period_start, fields.period_end]
  );
  revalidatePath("/admin/composer");
}

// §9.11: every polled item ends up included or explicitly excluded. Attaching
// pulls all pending changes into the draft; excluded ones stay excluded.
export async function attachPendingChanges(issueId: string) {
  await getPool().query(
    `update changes set issue_id = $1, status = 'included'
      where issue_id is null and status = 'pending'`,
    [issueId]
  );
  revalidatePath("/admin/composer");
  revalidatePath("/admin/queue");
}

export async function detachChange(changeId: string) {
  await getPool().query(
    `update changes set issue_id = null, status = 'pending' where id = $1`,
    [changeId]
  );
  revalidatePath("/admin/composer");
  revalidatePath("/admin/queue");
}

// Test send to the admin only (§7.1). The real subscriber send is step 6.
export async function sendTestToAdmin(issueId: string): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return "RESEND_API_KEY is not configured — test send unavailable.";

  const pool = getPool();
  const issue = await getIssueRow(pool, issueId);
  const changes = await getIssueChanges(pool, issueId);
  const html = renderIssueHtml(issue, changes);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: requireEnv("EMAIL_FROM"),
      to: [requireEnv("ADMIN_EMAIL")],
      reply_to: process.env.EMAIL_REPLY_TO,
      subject: `[TEST] ${issue.subject ?? `Protocol Monitor issue ${issue.number}`}`,
      html,
    }),
  });
  if (!res.ok) {
    return `Test send failed: ${res.status} ${(await res.text()).slice(0, 200)}`;
  }
  return "Test sent to the admin address.";
}
