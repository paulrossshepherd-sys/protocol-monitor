import Link from "next/link";

import { getPool } from "@/lib/db";
import {
  formatPeriod,
  getLatestPublishedIssue,
  monthAndYear,
} from "@/lib/issue/public";
import { ORG_TYPES } from "@/lib/subscribers/org-types";
import { signUp } from "@/app/(public)/actions";

export const dynamic = "force-dynamic";

const SIGNUP_MESSAGES: Record<string, string> = {
  "check-email":
    "Almost done — open the confirmation link we've just emailed you. Nothing is sent until you do.",
  already: "You're already subscribed to this address.",
  invalid: "That doesn't look like an email address. Try again?",
  suppressed:
    "This address was previously removed from the list. Reply to any past issue, or email us, and we'll sort it out.",
  "send-failed":
    "We couldn't send the confirmation email just now. Please try again in a few minutes.",
};

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ signup?: string }>;
}) {
  const { signup } = await searchParams;
  const message = signup ? SIGNUP_MESSAGES[signup] : undefined;
  const issue = await getLatestPublishedIssue(getPool());

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">
        What changed in national guidance this week
      </h1>
      <p className="mt-4 text-lg leading-relaxed">
        A weekly email for the people who own clinical protocols. Every change UKHSA,
        MHRA and NICE published in the period, in one place, each with a line on which
        class of document it sends you back to.
      </p>
      <p className="mt-4 leading-relaxed text-muted-foreground">
        Nothing is filtered out. Changes likely to matter come with commentary; the rest
        are listed in full with links, so you can always see the complete set for the
        week and judge for yourself.
      </p>

      <section id="signup" className="mt-10 rounded-lg border p-6">
        <h2 className="text-lg font-semibold">Get the weekly digest</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Free. One email a week. Unsubscribe in one click, no account needed.
        </p>
        {message && (
          <p
            className="mt-4 rounded-md border bg-muted/50 px-3 py-2 text-sm"
            role="status"
          >
            {message}
          </p>
        )}
        <form action={signUp} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="org_type" className="text-sm font-medium">
              What kind of organisation?
            </label>
            <select
              id="org_type"
              name="org_type"
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
              defaultValue=""
            >
              <option value="" disabled>
                Choose one
              </option>
              {ORG_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="h-9 self-start rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            Subscribe
          </button>
        </form>
        <p className="mt-4 text-xs text-muted-foreground">
          We ask for the organisation type so the digest can be written for the people
          reading it. What we hold, where it came from and how to be removed is in the{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            privacy notice
          </Link>
          .
        </p>
      </section>

      {issue ? (
        <section className="mt-14">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            This week&rsquo;s issue · {monthAndYear(issue)}
          </h2>
          <h3 className="mt-1 text-xl font-semibold">
            {issue.subject ?? `Issue ${issue.number}`}
          </h3>
          <p className="text-sm text-muted-foreground">{formatPeriod(issue)}</p>
          {issue.rendered_html && (
            <article
              className="mt-6 rounded-lg border bg-white p-6 text-black"
              dangerouslySetInnerHTML={{ __html: issue.rendered_html }}
            />
          )}
          <p className="mt-4 text-sm">
            <Link href="/archive" className="underline underline-offset-2">
              Every past issue
            </Link>
          </p>
        </section>
      ) : (
        <section className="mt-14">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            First issue
          </h2>
          <p className="mt-1 text-sm">
            The first issue has not gone out yet. Subscribe above and it will be the
            first thing you get.
          </p>
        </section>
      )}
    </main>
  );
}
