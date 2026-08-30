import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Attribution } from "@/components/attribution";
import { getPool } from "@/lib/db";
import { formatPeriod, getPublishedIssue, monthAndYear } from "@/lib/issue/public";

export const dynamic = "force-dynamic";

// §7.2: the most commercially important page on the site. Semantic HTML, a
// real title and meta description naming the period and the sources, month and
// year in the heading, and no JavaScript required to read any of it.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const issue = await getPublishedIssue(getPool(), slug);
  if (!issue) return { title: "Issue not found" };

  const period = formatPeriod(issue);
  return {
    title: issue.subject ?? `Issue ${issue.number}`,
    description: `Changes to UKHSA, MHRA and NICE guidance published ${period}: what changed and which class of clinical document each change affects. Issue ${issue.number} of the Protocol Monitor weekly digest.`,
    alternates: { canonical: `/archive/${issue.slug}` },
    openGraph: {
      type: "article",
      title: `${issue.subject ?? `Issue ${issue.number}`} · Protocol Monitor`,
      description: `UKHSA, MHRA and NICE guidance changes, ${period}.`,
      publishedTime: issue.sent_at.toISOString(),
    },
  };
}

export default async function IssuePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const issue = await getPublishedIssue(getPool(), slug);
  if (!issue) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <nav className="text-sm">
        <Link href="/archive" className="underline underline-offset-2">
          ← Archive
        </Link>
      </nav>

      <article className="mt-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Issue {issue.number} · {monthAndYear(issue)}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {issue.subject ?? `Issue ${issue.number}`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Guidance changes {formatPeriod(issue)} · UKHSA, MHRA and NICE · published{" "}
            <time dateTime={issue.sent_at.toISOString()}>
              {issue.sent_at.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            </time>
          </p>
        </header>

        {/* §6.1a: the stored snapshot exactly as it was sent, never re-derived. */}
        {issue.rendered_html ? (
          <div
            className="mt-8 rounded-lg border bg-white p-6 text-black"
            dangerouslySetInnerHTML={{ __html: issue.rendered_html }}
          />
        ) : (
          <p className="mt-8 text-muted-foreground">
            This issue has no stored copy.
          </p>
        )}
      </article>

      <aside className="mt-10 rounded-lg border p-5">
        <h2 className="font-semibold">Get this weekly</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One email a week, the complete set of changes each time. Unsubscribe in one
          click.
        </p>
        <Link
          href="/#signup"
          className="mt-3 inline-block h-9 rounded-md bg-primary px-5 text-sm font-medium leading-9 text-primary-foreground"
        >
          Subscribe
        </Link>
      </aside>

      <div className="mt-8">
        <Attribution />
      </div>
    </main>
  );
}
