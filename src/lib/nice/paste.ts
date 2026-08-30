// Clipboard ingestion of NICE's published-guidance table (§6.4).
// Rows copy as TSV: URL, title, reference number, published, last updated —
// or without the URL column, in which case the URL derives from the reference.

export interface NiceRow {
  url: string;
  title: string;
  ref: string;
  publishedAt: string | null; // ISO date
  lastUpdatedAt: string | null; // ISO date
}

const EN_GB_MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// "26 August 2026" → "2026-08-26"
export function parseEnGbDate(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const month = EN_GB_MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
}

export function parseNiceTsv(text: string): NiceRow[] {
  const rows: NiceRow[] = [];
  for (const line of text.split("\n")) {
    const cells = line.split("\t").map((c) => c.trim());
    if (cells.filter(Boolean).length < 4) continue;

    let url: string, title: string, ref: string, published: string, updated: string;
    if (/^https?:\/\//i.test(cells[0])) {
      [url, title, ref, published, updated] = cells;
    } else {
      [title, ref, published, updated] = cells;
      url = `https://www.nice.org.uk/guidance/${cells[1].toLowerCase()}`;
    }

    // tolerate a pasted header row: its date columns won't parse
    const publishedAt = parseEnGbDate(published ?? "");
    const lastUpdatedAt = parseEnGbDate(updated ?? "");
    if (!ref || (!publishedAt && !lastUpdatedAt)) continue;

    rows.push({ url, title, ref, publishedAt, lastUpdatedAt });
  }
  return rows;
}

export interface NiceDiffRow extends NiceRow {
  action: "new" | "updated" | "ignore";
  reason: string;
  /** Deterministic relevance suggestion, shown to the operator — never a filter (§6.4). */
  suggestOther: boolean;
}

export function suggestsOther(title: string): boolean {
  return title.toLowerCase().includes("(terminated evaluation)");
}
