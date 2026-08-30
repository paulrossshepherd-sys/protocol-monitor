import type { Metadata } from "next";
import Link from "next/link";

import { getPool } from "@/lib/db";
import { unsubscribeByToken } from "@/lib/subscribers/lifecycle";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribed",
  robots: { index: false },
};

// §7.2: one click, no login, confirmation page. Following the link from the
// email does the unsubscribe — there is no second button to hunt for, and the
// operation is idempotent so a repeated visit is harmless.
export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const outcome = await unsubscribeByToken(getPool(), token);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      {outcome === "unknown_token" ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">
            We couldn&rsquo;t find that subscription
          </h1>
          <p className="mt-3">
            The link may be incomplete. Reply to any issue and we&rsquo;ll remove you by
            hand — you will not be emailed again either way.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">
            You&rsquo;ve been unsubscribed
          </h1>
          <p className="mt-3">
            {outcome === "already_unsubscribed"
              ? "You were already unsubscribed — nothing further will be sent."
              : "That takes effect immediately. The next issue will not be sent to you."}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            If this was a mistake, you can{" "}
            <Link href="/#signup" className="underline underline-offset-2">
              subscribe again
            </Link>
            .
          </p>
        </>
      )}
    </main>
  );
}
