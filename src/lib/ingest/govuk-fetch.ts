// gov.uk polling etiquette (§4.4): descriptive User-Agent with a contact
// address, sequential fetching (enforced by callers — nothing in this module
// or its callers runs fetches in parallel), and /search/all* is never fetched.

export function govukUserAgent(): string {
  const contact = process.env.GOVUK_CONTACT_EMAIL;
  return `ProtocolMonitor/0.1 (guidance change digest; contact: ${contact ?? "unset"})`;
}

export async function govukFetch(url: string): Promise<Response> {
  const parsed = new URL(url);
  // robots.txt disallows /search/all*; never fall back to it (§4.4)
  if (parsed.pathname.startsWith("/search/all")) {
    throw new Error(`Refusing to fetch disallowed path: ${parsed.pathname}`);
  }
  const res = await fetch(url, {
    headers: { "user-agent": govukUserAgent() },
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GET ${url} responded ${res.status}`);
  }
  return res;
}
