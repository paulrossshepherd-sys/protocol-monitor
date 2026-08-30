import { XMLParser } from "fast-xml-parser";

import { govukFetch } from "@/lib/ingest/govuk-fetch";
import type { FeedEntry, SourceAdapter } from "@/lib/ingest/types";

// The one automated adapter (§4.2): parameterised by feed URL, nothing
// source-specific in code.
export class GovUkAtomFeed implements SourceAdapter {
  constructor(private readonly feedUrl: string) {}

  async fetch(): Promise<FeedEntry[]> {
    const res = await govukFetch(this.feedUrl);
    const xml = await res.text();
    return parseAtom(xml);
  }
}

interface AtomLink {
  "@_href"?: string;
  "@_rel"?: string;
}

interface AtomEntry {
  id?: unknown;
  title?: unknown;
  link?: AtomLink | AtomLink[];
  updated?: unknown;
  published?: unknown;
}

export function parseAtom(xml: string): FeedEntry[] {
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(xml);
  const feed = doc?.feed;
  if (!feed) throw new Error("Not an Atom feed: missing <feed> root");
  const entries: AtomEntry[] = feed.entry
    ? Array.isArray(feed.entry)
      ? feed.entry
      : [feed.entry]
    : [];

  return entries.map((entry) => {
    const externalId = text(entry.id);
    const title = text(entry.title);
    const url = entryUrl(entry.link);
    if (!externalId || !url || !title) {
      throw new Error(
        `Atom entry missing id/link/title: ${JSON.stringify(entry).slice(0, 200)}`
      );
    }
    return {
      externalId,
      url,
      title,
      publishedAt: text(entry.published) || null,
      revisedAt: text(entry.updated) || null,
    };
  });
}

function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (value && typeof value === "object" && "#text" in value) {
    return String((value as { "#text": unknown })["#text"]).trim();
  }
  return "";
}

function entryUrl(link: AtomLink | AtomLink[] | undefined): string {
  const links = link ? (Array.isArray(link) ? link : [link]) : [];
  const alternate =
    links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
  return alternate?.["@_href"]?.trim() ?? "";
}
