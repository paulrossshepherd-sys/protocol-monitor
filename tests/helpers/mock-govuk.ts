import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface MockItem {
  slug: string; // content path, e.g. "government/publications/measles-green-book-chapter-21"
  title: string;
  published: string;
  updated: string;
  changeHistory: { note: string; public_timestamp: string }[] | null;
  body?: string;
  withdrawn?: boolean;
}

export interface MockFeed {
  path: string; // e.g. "/feed/ukhsa.atom"
  items: MockItem[];
}

// Serves Atom feeds and Content API records in gov.uk's shapes, from mutable
// in-memory state, so the pipeline can be run repeatedly with controlled change.
export class MockGovUk {
  private server: Server | undefined;
  public baseUrl = "";
  public requestLog: string[] = [];

  constructor(public feeds: MockFeed[]) {}

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      this.requestLog.push(path);

      const feed = this.feeds.find((f) => f.path === path);
      if (feed) {
        res.writeHead(200, { "content-type": "application/atom+xml" });
        res.end(this.renderAtom(feed));
        return;
      }

      if (path.startsWith("/api/content/")) {
        const slug = path.slice("/api/content/".length);
        const item = this.feeds.flatMap((f) => f.items).find((i) => i.slug === slug);
        if (item) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(this.renderContent(item)));
          return;
        }
      }

      res.writeHead(404);
      res.end("not found");
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    const { port } = this.server!.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server ? this.server.close((e) => (e ? reject(e) : resolve())) : resolve()
    );
  }

  itemUrl(item: MockItem): string {
    return `${this.baseUrl}/${item.slug}`;
  }

  private renderAtom(feed: MockFeed): string {
    const entries = feed.items
      .map(
        (item) => `
  <entry>
    <id>${this.itemUrl(item)}</id>
    <title>${item.title}</title>
    <link rel="alternate" type="text/html" href="${this.itemUrl(item)}"/>
    <published>${item.published}</published>
    <updated>${item.updated}</updated>
    <summary>Summary of ${item.title}</summary>
  </entry>`
      )
      .join("");
    return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${this.baseUrl}${feed.path}</id>
  <title>Mock gov.uk feed</title>
  <updated>${new Date().toISOString()}</updated>${entries}
</feed>`;
  }

  private renderContent(item: MockItem): Record<string, unknown> {
    return {
      title: item.title,
      document_type: "guidance",
      first_published_at: item.published,
      public_updated_at: item.updated,
      ...(item.withdrawn
        ? { withdrawn_notice: { explanation: "Withdrawn", withdrawn_at: item.updated } }
        : {}),
      details: {
        ...(item.changeHistory ? { change_history: item.changeHistory } : {}),
        ...(item.body ? { body: item.body } : {}),
      },
    };
  }
}
