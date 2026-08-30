"use client";

import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { saveAdminNote, setExcluded, setRelevance } from "@/app/admin/queue/actions";

export interface QueueItem {
  id: string;
  change_type: string;
  relevance: "likely" | "other";
  status: "pending" | "included" | "excluded_duplicate";
  publisher_note: string | null;
  admin_note: string | null;
  detected_at: string;
  title: string;
  url: string;
  external_id: string;
  source_key: string;
  update_information: string | null;
  update_information_error: string | null;
}

function sourceBadge(key: string): string {
  if (key.startsWith("ukhsa")) return "UKHSA";
  if (key.startsWith("mhra")) return "MHRA";
  if (key === "nice") return "NICE";
  return key;
}

// Reviewed = the operator has touched it: relevance decided via 1/2, or excluded.
// Tracked client-side per session; the durable state is relevance/status/note.
export function QueueClient({ initialItems }: { initialItems: QueueItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [sel, setSel] = useState(0);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const selRef = useRef<HTMLDivElement>(null);

  const current = items[sel];

  function patch(id: string, p: Partial<QueueItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }
  function markReviewed(id: string) {
    setReviewed((prev) => new Set(prev).add(id));
  }
  function advance() {
    setSel((s) => Math.min(s + 1, items.length - 1));
  }

  function relevanceKey(rel: "likely" | "other") {
    if (!current || current.status === "included") return;
    patch(current.id, { relevance: rel, status: "pending" });
    markReviewed(current.id);
    void setRelevance(current.id, rel);
    advance();
  }

  function excludeKey() {
    if (!current || current.status === "included") return;
    const excluding = current.status !== "excluded_duplicate";
    patch(current.id, { status: excluding ? "excluded_duplicate" : "pending" });
    if (excluding) markReviewed(current.id);
    void setExcluded(current.id, excluding);
    if (excluding) advance();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.matches("textarea, input")) {
        if (e.key === "Escape") target.blur();
        return;
      }
      switch (e.key) {
        case "j":
          setSel((s) => Math.min(s + 1, items.length - 1));
          break;
        case "k":
          setSel((s) => Math.max(s - 1, 0));
          break;
        case "1":
          relevanceKey("likely");
          break;
        case "2":
          relevanceKey("other");
          break;
        case "x":
          excludeKey();
          break;
        case "i":
          e.preventDefault();
          noteRef.current?.focus();
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    selRef.current?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (items.length === 0) {
    return <p className="mt-6 text-sm text-muted-foreground">The queue is empty.</p>;
  }

  const done = items.filter(
    (it) => reviewed.has(it.id) || it.status !== "pending" || it.admin_note
  ).length;

  return (
    <>
      <p className="mt-1 text-sm text-muted-foreground">
        {done} of {items.length} reviewed
      </p>
      <div className="mt-4 rounded-lg border">
        {items.map((item, i) => (
          <div
            key={item.id}
            ref={i === sel ? selRef : undefined}
            className={cn("border-b last:border-b-0", i === sel && "bg-muted/50")}
          >
            <button
              type="button"
              onClick={() => setSel(i)}
              className={cn(
                "grid w-full grid-cols-[90px_84px_1fr_auto] items-baseline gap-3 px-4 py-2 text-left text-sm",
                i === sel && "border-l-2 border-l-foreground pl-[14px]"
              )}
            >
              <span className="font-mono text-[11px] text-muted-foreground">
                {sourceBadge(item.source_key)}
                {item.source_key === "nice" ? ` ${item.external_id.toUpperCase()}` : ""}
              </span>
              <span
                className={cn(
                  "font-medium",
                  item.change_type === "new" && "text-green-700 dark:text-green-400",
                  item.change_type === "updated" && "text-amber-700 dark:text-amber-400",
                  item.change_type === "withdrawn" && "text-red-700 dark:text-red-400"
                )}
              >
                {item.change_type}
              </span>
              <span className="min-w-0 truncate font-medium">{item.title}</span>
              <span>
                {item.status === "excluded_duplicate" ? (
                  <Badge variant="outline">excluded · duplicate</Badge>
                ) : item.status === "included" ? (
                  <Badge>in issue</Badge>
                ) : reviewed.has(item.id) || item.admin_note ? (
                  item.relevance === "likely" ? (
                    <Badge variant="secondary">likely relevant</Badge>
                  ) : (
                    <Badge variant="outline">other</Badge>
                  )
                ) : (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    pending
                  </Badge>
                )}
              </span>
            </button>

            {i === sel && (
              <div className="grid grid-cols-1 gap-4 px-6 pb-4 pt-1 md:grid-cols-2">
                <div className="flex items-center gap-2 md:col-span-2">
                  <div className="inline-flex overflow-hidden rounded-md border">
                    <button
                      type="button"
                      onClick={() => relevanceKey("likely")}
                      className={cn(
                        "px-3 py-1 text-xs",
                        item.relevance === "likely" && (reviewed.has(item.id) || item.admin_note)
                          ? "bg-foreground text-background"
                          : "hover:bg-muted"
                      )}
                    >
                      1 · likely
                    </button>
                    <button
                      type="button"
                      onClick={() => relevanceKey("other")}
                      className={cn(
                        "px-3 py-1 text-xs",
                        item.relevance === "other" && (reviewed.has(item.id) || item.admin_note)
                          ? "bg-foreground text-background"
                          : "hover:bg-muted"
                      )}
                    >
                      2 · other
                    </button>
                  </div>
                  <Button variant="outline" size="sm" onClick={excludeKey} className="h-6 text-xs">
                    {item.status === "excluded_duplicate" ? "un-exclude" : "x · exclude as duplicate"}
                  </Button>
                  {item.title.toLowerCase().includes("(terminated evaluation)") && (
                    <span className="text-xs text-muted-foreground">
                      suggested “other” (terminated evaluation)
                    </span>
                  )}
                  <span className="flex-1" />
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline underline-offset-2"
                  >
                    open source page ↗
                  </a>
                </div>

                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {item.source_key === "nice"
                      ? "Update information (internal excerpt)"
                      : "Publisher note — change_history"}
                  </div>
                  {item.source_key === "nice" ? (
                    item.update_information ? (
                      <blockquote className="whitespace-pre-line rounded-r-md border-l-2 bg-muted/50 px-3 py-2 text-sm">
                        {item.update_information}
                      </blockquote>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {item.update_information_error
                          ? `Couldn't fetch (${item.update_information_error}) — open the source page.`
                          : "No excerpt held."}
                      </p>
                    )
                  ) : item.publisher_note ? (
                    <blockquote className="rounded-r-md border-l-2 bg-muted/50 px-3 py-2 text-sm">
                      “{item.publisher_note}”
                    </blockquote>
                  ) : (
                    <p className="text-sm text-muted-foreground">No publisher note supplied.</p>
                  )}
                </div>

                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Impact line — your words, what ships
                  </div>
                  <Textarea
                    ref={noteRef}
                    rows={3}
                    defaultValue={item.admin_note ?? ""}
                    placeholder="i · write the impact line"
                    onBlur={(e) => {
                      if (e.target.value !== (item.admin_note ?? "")) {
                        patch(item.id, { admin_note: e.target.value || null });
                        void saveAdminNote(item.id, e.target.value);
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        <kbd className="rounded border px-1">j</kbd>/<kbd className="rounded border px-1">k</kbd> move ·{" "}
        <kbd className="rounded border px-1">1</kbd> likely · <kbd className="rounded border px-1">2</kbd> other ·{" "}
        <kbd className="rounded border px-1">x</kbd> exclude · <kbd className="rounded border px-1">i</kbd> impact line ·{" "}
        <kbd className="rounded border px-1">Esc</kbd> leave field
      </p>
    </>
  );
}
