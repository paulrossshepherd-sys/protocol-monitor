// Renders an issue to self-contained HTML. Used for the composer preview and,
// at send time, written to issues.rendered_html — the snapshot that the email
// and the archive page serve (§6.1a). Semantic HTML, no JavaScript (§7.2).

export interface IssueForRender {
  number: number;
  subject: string | null;
  period_start: string | null;
  period_end: string | null;
  intro: string | null;
}

export interface ChangeForRender {
  change_type: string;
  relevance: string;
  publisher_note: string | null;
  admin_note: string | null;
  title: string;
  url: string;
  source_name: string;
  source_key: string;
  external_id: string;
}

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function sourceLabel(c: ChangeForRender): string {
  const key = c.source_key.startsWith("ukhsa")
    ? "UKHSA"
    : c.source_key.startsWith("mhra")
      ? "MHRA"
      : c.source_key === "nice"
        ? "NICE"
        : c.source_name;
  const ref = c.source_key === "nice" ? ` · ${c.external_id.toUpperCase()}` : "";
  return `${key} · ${c.change_type.toUpperCase()}${ref}`;
}

function fmtPeriod(issue: IssueForRender): string {
  const f = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  if (!issue.period_start || !issue.period_end) return "";
  return `${f(issue.period_start)} to ${f(issue.period_end)}`;
}

// §5: every change appears — likely-relevant with commentary, the rest as a
// complete plain list with links. Nothing is omitted.
export function renderIssueHtml(
  issue: IssueForRender,
  changes: ChangeForRender[]
): string {
  const likely = changes.filter((c) => c.relevance === "likely");
  const other = changes.filter((c) => c.relevance !== "likely");

  const likelyHtml = likely
    .map(
      (c) => `
    <article style="margin:0 0 20px">
      <p style="margin:0;font-size:12px;color:#666;letter-spacing:.04em">${esc(sourceLabel(c))}</p>
      <h3 style="margin:2px 0 4px;font-size:16px"><a href="${esc(c.url)}" style="color:#111">${esc(c.title)}</a></h3>
      ${c.admin_note ? `<p style="margin:0;border-left:3px solid #ccc;padding-left:10px">${esc(c.admin_note)}</p>` : ""}
      ${c.publisher_note ? `<p style="margin:6px 0 0;font-size:13px;color:#555">Publisher's note: “${esc(c.publisher_note)}”</p>` : ""}
    </article>`
    )
    .join("");

  const otherHtml = other.length
    ? `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#666">Also this week</h2>
  <ul style="padding-left:18px;margin:6px 0">
    ${other
      .map(
        (c) =>
          `<li style="margin:4px 0"><a href="${esc(c.url)}" style="color:#111">${esc(c.title)}</a> <span style="color:#666;font-size:13px">— ${esc(sourceLabel(c))}</span></li>`
      )
      .join("\n    ")}
  </ul>`
    : "";

  return `<div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;color:#111;line-height:1.5">
  <h1 style="font-size:20px;margin:0 0 2px">Protocol Monitor — issue ${issue.number}</h1>
  <p style="margin:0 0 16px;color:#666;font-size:13px">Changes to national guidance, ${esc(fmtPeriod(issue))} · UKHSA · MHRA · NICE</p>
  ${issue.intro ? `<p>${esc(issue.intro)}</p>` : ""}
  ${likely.length ? `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#666">Likely relevant</h2>` : ""}
  ${likelyHtml}
  ${otherHtml}
  <hr style="border:none;border-top:1px solid #ddd;margin:20px 0 12px">
  <p style="font-size:12px;color:#666">Contains public sector information licensed under the
    <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" style="color:#666">Open Government Licence v3.0</a>.
    NICE entries are the operator's own commentary with a link to the source.</p>
</div>`;
}
