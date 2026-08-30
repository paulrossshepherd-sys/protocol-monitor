import type { Metadata } from "next";
import Link from "next/link";

import { getPool } from "@/lib/db";
import { formatPeriod, listPublishedIssues, monthAndYear } from "@/lib/issue/public";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Archive",
  description:
    "Every past issue of Protocol Monitor: weekly summaries of changes to UKHSA, MHRA and NICE guidance for UK clinical governance leads.",
};

export default async function ArchivePage() {
  const issues = await listPublishedIssues(getPool());

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Archive</h1>
      <p className="mt-2 text-muted-foreground">
        Every issue, newest first. Each one lists the complete set of guidance changes
        for its period.
      </p>

      {issues.length === 0 ? (
        <p className="mt-8">
          No issues have been published yet.{" "}
          <Link href="/#signup" className="underline underline-offset-2">
            Subscribe
          </Link>{" "}
          to get the first one.
        </p>
      ) : (
        <ol className="mt-8 flex flex-col gap-6">
          {issues.map((issue) => (
            <li key={issue.slug}>
              <article>
                <h2 className="text-lg font-semibold">
                  <Link
                    href={`/archive/${issue.slug}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {issue.subject ?? `Issue ${issue.number}`}
                  </Link>
                </h2>
                <p className="text-sm text-muted-foreground">
                  <time dateTime={issue.sent_at.toISOString()}>
                    {monthAndYear(issue)}
                  </time>
                  {" · "}
                  {formatPeriod(issue)} · UKHSA, MHRA and NICE
                </p>
              </article>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
