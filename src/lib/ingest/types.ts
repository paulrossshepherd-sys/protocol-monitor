export interface FeedEntry {
  /** Stable identifier from the feed (Atom <id>); §6.1 dedupe key with source_id. */
  externalId: string;
  url: string;
  title: string;
  publishedAt: string | null;
  /** The feed's <updated> — the publisher saying whether the item changed. */
  revisedAt: string | null;
}

export interface SourceAdapter {
  fetch(): Promise<FeedEntry[]>;
}

export interface SourceRow {
  id: string;
  key: string;
  name: string;
  adapter: "govuk_atom" | "manual";
  feed_url: string | null;
  enabled: boolean;
}
