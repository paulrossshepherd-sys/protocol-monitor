// Targeted retrieval of a changed NICE item's update-information section
// (§6.3): fetch ONLY URLs surfaced by the operator's paste, extract the
// section as an internal reading aid for the queue. Never crawl; the excerpt
// is queue data and is never rendered in a published issue (§9.10).

export interface UpdateInfoResult {
  excerpt: string | null;
  error: string | null;
}

const MAX_EXCERPT_CHARS = 4000;

export function makeTargetedFetcher(surfacedUrls: string[]) {
  const allowed = new Set(surfacedUrls.map((u) => new URL(u).toString()));

  return async function fetchUpdateInfo(url: string): Promise<UpdateInfoResult> {
    if (!allowed.has(new URL(url).toString())) {
      // Hard guard, not a soft skip: nothing outside the pasted set is fetchable.
      throw new Error(
        `Refusing to fetch ${url}: not surfaced by clipboard ingestion (§9.10)`
      );
    }
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (ProtocolMonitor operator queue)" },
        redirect: "follow",
        cache: "no-store",
      });
      if (!res.ok) {
        // §6.3 firewall contingency: nice.org.uk blocks much cloud-origin
        // traffic. Record the failure; the operator follows the link instead.
        return { excerpt: null, error: `fetch failed with status ${res.status}` };
      }
      const html = await res.text();
      const excerpt = extractUpdateInformation(html);
      return excerpt
        ? { excerpt, error: null }
        : { excerpt: null, error: "no update-information section found" };
    } catch (err) {
      return {
        excerpt: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };
}

// The section sits under a consistent "Update information" heading (§6.3), so
// this is a parser job: take content from that heading to the next same-level
// heading, tags stripped.
export function extractUpdateInformation(html: string): string | null {
  const headingRe = /<h([1-3])[^>]*>\s*Update information\s*<\/h\1>/i;
  const m = headingRe.exec(html);
  if (!m) return null;
  const level = m[1];
  const rest = html.slice(m.index + m[0].length);
  const next = new RegExp(`<h[1-${level}][^>]*>`, "i").exec(rest);
  const section = next ? rest.slice(0, next.index) : rest;
  const text = section
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|li|h\d|div)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return text ? text.slice(0, MAX_EXCERPT_CHARS) : null;
}
