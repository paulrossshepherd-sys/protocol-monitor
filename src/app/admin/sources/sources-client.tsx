"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setFeedUrl, setSourceEnabled } from "@/app/admin/sources/actions";

export interface SourceListRow {
  id: string;
  key: string;
  name: string;
  adapter: string;
  feed_url: string | null;
  enabled: boolean;
  licence_note: string | null;
}

export function SourcesClient({ sources }: { sources: SourceListRow[] }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-5 flex flex-col gap-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {sources.map((s) => (
        <div key={s.id} className="rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              defaultChecked={s.enabled}
              aria-label={`${s.key} enabled`}
              onChange={(e) => void setSourceEnabled(s.id, e.target.checked)}
            />
            <span className="font-medium">{s.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{s.key}</span>
            <Badge variant="outline">{s.adapter}</Badge>
          </div>
          {s.adapter === "govuk_atom" && (
            <form
              className="mt-3 flex gap-2"
              action={async (formData: FormData) => {
                setError(null);
                try {
                  await setFeedUrl(s.id, String(formData.get("feed_url") ?? ""));
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                }
              }}
            >
              <Input
                name="feed_url"
                defaultValue={s.feed_url ?? ""}
                className="font-mono text-xs"
              />
              <Button type="submit" variant="outline" size="sm">
                Save URL
              </Button>
            </form>
          )}
          {s.licence_note && (
            <p className="mt-2 text-xs text-muted-foreground">{s.licence_note}</p>
          )}
        </div>
      ))}
    </div>
  );
}
