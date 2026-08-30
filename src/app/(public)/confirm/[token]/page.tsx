import type { Metadata } from "next";
import Link from "next/link";

import { getPool } from "@/lib/db";
import { confirmSubscriber } from "@/lib/subscribers/lifecycle";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm your subscription",
  robots: { index: false },
};

export default async function ConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const outcome = await confirmSubscriber(getPool(), token);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      {outcome === "confirmed" ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">You&rsquo;re subscribed</h1>
          <p className="mt-3">
            The next issue will arrive in your inbox. Every one carries a one-click
            unsubscribe link — no account, no login.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">
            This confirmation link has already been used
          </h1>
          <p className="mt-3">
            Confirmation links work once. If you&rsquo;re already subscribed, there is
            nothing more to do. If you&rsquo;re not sure, sign up again and we&rsquo;ll
            send a fresh link.
          </p>
        </>
      )}
      <p className="mt-6 text-sm">
        <Link href="/archive" className="underline underline-offset-2">
          Read the archive
        </Link>
      </p>
    </main>
  );
}
