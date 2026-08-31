// Local demo data only — never run against production.
import { Pool } from "pg";
import { renderIssueHtml, type ChangeForRender } from "../src/lib/issue/render";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ITEMS: (ChangeForRender & { relevance: "likely" | "other" })[] = [
  { source_key: "ukhsa_wide", source_name: "UKHSA", change_type: "updated", relevance: "likely",
    title: "Measles: the green book, chapter 21", url: "https://www.gov.uk/government/publications/measles-the-green-book-chapter-21", external_id: "ukhsa-1",
    publisher_note: "This chapter has been updated to include the introduction of the MMRV vaccine from 1 January 2026.",
    admin_note: "Immunisation protocols citing MMR product choice need review — MMRV becomes the routine offer for eligible cohorts from 1 January 2026." },
  { source_key: "mhra_alerts", source_name: "MHRA", change_type: "new", relevance: "likely",
    title: "Class 2 medicines recall: adrenaline auto-injectors, specific batches", url: "https://www.gov.uk/drug-device-alerts", external_id: "mhra-1",
    publisher_note: null,
    admin_note: "Anaphylaxis kits and emergency drug lists naming the affected batches should be checked against the recall notice this week." },
  { source_key: "nice", source_name: "NICE", change_type: "updated", relevance: "likely",
    title: "Type 2 diabetes in adults: management", url: "https://www.nice.org.uk/guidance/ng28", external_id: "NG28",
    publisher_note: null,
    admin_note: "Medicines-optimisation protocols referencing SGLT2 inhibitor eligibility pick up a widened criterion; check any local threshold tables." },
  { source_key: "ukhsa_wide", source_name: "UKHSA", change_type: "updated", relevance: "other",
    title: "Varicella: the green book, chapter 34", url: "https://www.gov.uk/government/publications/varicella-the-green-book-chapter-34", external_id: "ukhsa-2",
    publisher_note: "Updated wording on the routine vaccination schedule across MMRV green book chapters.", admin_note: null },
  { source_key: "ukhsa_wide", source_name: "UKHSA", change_type: "new", relevance: "other",
    title: "Vaccine Update: issue 372, August 2026", url: "https://www.gov.uk/government/collections/vaccine-update", external_id: "ukhsa-3",
    publisher_note: "First published.", admin_note: null },
  { source_key: "mhra_alerts", source_name: "MHRA", change_type: "new", relevance: "other",
    title: "Device safety information: infusion pump battery latch", url: "https://www.gov.uk/drug-device-alerts", external_id: "mhra-2",
    publisher_note: null, admin_note: null },
  { source_key: "nice", source_name: "NICE", change_type: "new", relevance: "other",
    title: "Abc-123 for rare condition X (terminated evaluation)", url: "https://www.nice.org.uk/guidance/ta10945", external_id: "TA10945",
    publisher_note: null, admin_note: null },
];

async function main() {
  await pool.query(`delete from changes; delete from raw_items; delete from issues; delete from subscribers; delete from suppressions;`);

  const issue = {
    number: 3,
    subject: "Guidance changes, 24–30 August: MMRV enters the Green Book",
    period_start: "2026-08-24",
    period_end: "2026-08-30",
    intro: "A heavy week for immunisation teams: the MMRV introduction reaches four Green Book chapters, and MHRA has recalled specific batches of adrenaline auto-injectors. NICE's diabetes update is small but touches standing medication protocols.",
  };
  const html = renderIssueHtml(issue, ITEMS);
  await pool.query(
    `insert into issues (number, subject, period_start, period_end, status, sent_at, slug, intro, rendered_html)
     values ($1,$2,$3,$4,'sent', now() - interval '1 day', $5, $6, $7)`,
    [issue.number, issue.subject, issue.period_start, issue.period_end, "2026-08-30-mmrv-enters-the-green-book", issue.intro, html]
  );

  // a couple of earlier issues so the archive list has depth
  for (const [n, subject, start, end, slug] of [
    [2, "Guidance changes, 17–23 August: flu programme letter and two device alerts", "2026-08-17", "2026-08-23", "2026-08-23-flu-programme-letter"],
    [1, "Guidance changes, 10–16 August: pertussis chapter revision", "2026-08-10", "2026-08-16", "2026-08-16-pertussis-chapter-revision"],
  ] as [number, string, string, string, string][]) {
    const past = { number: n, subject, period_start: start, period_end: end, intro: "A quieter week." };
    await pool.query(
      `insert into issues (number, subject, period_start, period_end, status, sent_at, slug, intro, rendered_html)
       values ($1,$2,$3,$4,'sent', $5::date + interval '1 day', $6, $7, $8)`,
      [n, subject, start, end, end, slug, past.intro, renderIssueHtml(past, ITEMS.slice(3, 6))]
    );
  }

  await pool.query(
    `insert into subscribers (email, org_type, confirmed_at, source_note, confirm_token)
     values ('governance@example-hospice.org', 'Hospice', now(), 'public signup form', null)`
  );
  console.log("seeded");
  await pool.end();
}
main();
