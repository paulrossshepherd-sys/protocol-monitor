"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ChangeForRender } from "@/lib/issue/render";
import type { IssueRow } from "@/app/admin/composer/data";
import {
  attachPendingChanges,
  detachChange,
  sendTestToAdmin,
  updateIssueFields,
} from "@/app/admin/composer/actions";

export function ComposerClient({
  issue,
  changes,
  pendingCount,
  previewHtml,
}: {
  issue: IssueRow;
  changes: (ChangeForRender & { id: string })[];
  pendingCount: number;
  previewHtml: string;
}) {
  const [subject, setSubject] = useState(issue.subject ?? "");
  const [intro, setIntro] = useState(issue.intro ?? "");
  const [periodStart, setPeriodStart] = useState(issue.period_start ?? "");
  const [periodEnd, setPeriodEnd] = useState(issue.period_end ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    await updateIssueFields(issue.id, {
      subject,
      intro,
      period_start: periodStart,
      period_end: periodEnd,
    });
    setBusy(false);
    setMessage("Saved.");
  }

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-semibold">Issue composer — issue {issue.number}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {changes.length} included · {pendingCount} pending in the queue. Sent issues
        render from a stored snapshot (§6.1a); the send itself arrives in step 6.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(320px,420px)_1fr]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ps">Period start</Label>
              <Input id="ps" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pe">Period end</Label>
              <Input id="pe" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="intro">Intro</Label>
            <Textarea id="intro" rows={5} value={intro} onChange={(e) => setIntro(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={busy}>Save draft</Button>
            <Button
              variant="outline"
              disabled={busy || pendingCount === 0}
              onClick={async () => {
                setBusy(true);
                await attachPendingChanges(issue.id);
                setBusy(false);
              }}
            >
              Attach {pendingCount} pending change{pendingCount === 1 ? "" : "s"}
            </Button>
            <Button
              variant="outline"
              disabled={busy || changes.length === 0}
              onClick={async () => {
                setBusy(true);
                setMessage(await sendTestToAdmin(issue.id));
                setBusy(false);
              }}
            >
              Send test to admin
            </Button>
          </div>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}

          {changes.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Included
              </div>
              <ul className="flex flex-col gap-1 text-sm">
                {changes.map((c) => (
                  <li key={c.id} className="flex items-baseline gap-2">
                    <span className="truncate">{c.title}</span>
                    <button
                      className="text-xs text-muted-foreground underline underline-offset-2"
                      onClick={() => detachChange(c.id)}
                    >
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Preview (save to refresh)
          </div>
          <div
            className="rounded-lg border bg-white p-6 text-black"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </div>
    </div>
  );
}
