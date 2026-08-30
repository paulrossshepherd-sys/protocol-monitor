"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { commitAction, previewAction } from "@/app/admin/nice/actions";
import type { NiceDiffRow } from "@/lib/nice/paste";
import type { NiceCommitResult } from "@/lib/nice/ingest";

export function NicePasteClient() {
  const [pasted, setPasted] = useState("");
  const [preview, setPreview] = useState<NiceDiffRow[] | null>(null);
  const [result, setResult] = useState<NiceCommitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const creating = preview?.filter((r) => r.action !== "ignore") ?? [];

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <Textarea
        rows={7}
        className="font-mono text-xs"
        spellCheck={false}
        value={pasted}
        onChange={(e) => {
          setPasted(e.target.value);
          setPreview(null);
          setResult(null);
        }}
        placeholder={"URL\ttitle\treference\tpublished\tlast updated  (or without the URL column)"}
      />
      <div className="mt-3 flex gap-2">
        <Button
          disabled={busy || !pasted.trim()}
          onClick={() => run(async () => setPreview(await previewAction(pasted)))}
        >
          Preview diff
        </Button>
        <Button
          variant="outline"
          disabled={busy || creating.length === 0}
          onClick={() =>
            run(async () => {
              setResult(await commitAction(pasted));
              setPreview(null);
            })
          }
        >
          Commit {creating.length > 0 ? `${creating.length} change${creating.length === 1 ? "" : "s"}` : ""} to queue
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {result && (
        <p className="mt-4 text-sm">
          Committed {result.created} change{result.created === 1 ? "" : "s"} to the queue.
          Update-information fetched for {result.fetched}
          {result.fetchErrors > 0 &&
            `; ${result.fetchErrors} fetch${result.fetchErrors === 1 ? "" : "es"} failed (open those from the queue instead)`}
          .
        </p>
      )}

      {preview && (
        <div className="mt-5">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Preview — nothing committed yet
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Why</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((r) => (
                  <TableRow key={r.ref}>
                    <TableCell className="font-mono text-xs">{r.ref.toUpperCase()}</TableCell>
                    <TableCell>
                      {r.title}
                      {r.suggestOther && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          will suggest “other”
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className={
                        r.action === "new"
                          ? "font-medium text-green-700 dark:text-green-400"
                          : r.action === "updated"
                            ? "font-medium text-amber-700 dark:text-amber-400"
                            : "text-muted-foreground"
                      }
                    >
                      {r.action === "ignore" ? "ignore" : `create · ${r.action}`}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            On commit, each created item’s update-information section is fetched —
            those URLs only, never a crawl (§6.3, §9.10) — into the private queue.
          </p>
        </div>
      )}
    </div>
  );
}
