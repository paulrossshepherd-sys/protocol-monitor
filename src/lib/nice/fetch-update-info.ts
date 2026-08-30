// Targeted retrieval of a changed NICE item's update-information section
// (§6.3): fetch ONLY URLs surfaced by the operator's paste, extract the
// section as an internal reading aid for the queue. Never crawl; the excerpt
// is queue data and is never rendered in a published issue (§9.10).

export interface UpdateInfoResult {
  excerpt: string | null;
  error: string | null;
}

const MAX_EXCERPT_CHARS = 4000;

/** Guidance pages carry the section on its own chapter page (verified on NG220). */
export function updateInformationUrl(guidanceUrl: string): string {
  const base = guidanceUrl.replace(/\/+$/, "");
  return `${base}/chapter/Update-information`;
}

// A surfaced guidance URL authorises that page and the chapter pages beneath
// it — nothing else, and never another guidance item.
function isBeneath(candidate: URL, surfaced: URL): boolean {
  if (candidate.origin !== surfaced.origin) return false;
  const base = surfaced.pathname.replace(/\/+$/, "");
  return candidate.pathname === base || candidate.pathname.startsWith(`${base}/`);
}

export function makeTargetedFetcher(surfacedUrls: string[]) {
  const surfaced = surfacedUrls.map((u) => new URL(u));

  async function fetchOne(url: string): Promise<
    { html: string } | { error: string }
  > {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (ProtocolMonitor operator queue)" },
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok) {
      // §6.3 firewall contingency: nice.org.uk blocks much cloud-origin
      // traffic. Record the failure; the operator follows the link instead.
      return { error: `fetch failed with status ${res.status}` };
    }
    return { html: await res.text() };
  }

  return async function fetchUpdateInfo(guidanceUrl: string): Promise<UpdateInfoResult> {
    const target = new URL(guidanceUrl);
    if (!surfaced.some((s) => isBeneath(target, s))) {
      // Hard guard, not a soft skip: nothing outside the pasted set is fetchable.
      throw new Error(
        `Refusing to fetch ${guidanceUrl}: not surfaced by clipboard ingestion (§9.10)`
      );
    }
    try {
      // The section lives at <url>/chapter/Update-information; the root
      // guidance page is the fallback for items laid out differently.
      const chapterResult = await fetchOne(updateInformationUrl(guidanceUrl));
      if ("html" in chapterResult) {
        const excerpt = extractUpdateInformation(chapterResult.html);
        if (excerpt) return { excerpt, error: null };
      }

      const rootResult = await fetchOne(guidanceUrl);
      if ("error" in rootResult) {
        return { excerpt: null, error: rootResult.error };
      }
      const excerpt = extractUpdateInformation(rootResult.html);
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
