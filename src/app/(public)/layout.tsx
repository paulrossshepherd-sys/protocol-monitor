import Link from "next/link";

import { Attribution } from "@/components/attribution";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-baseline justify-between gap-4 px-6 py-4">
          <Link href="/" className="font-semibold">
            Protocol Monitor
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/archive" className="underline-offset-2 hover:underline">
              Archive
            </Link>
            <Link href="/privacy" className="underline-offset-2 hover:underline">
              Privacy
            </Link>
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="mt-16 border-t">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-6 py-8">
          <p className="text-xs text-muted-foreground">
            Protocol Monitor reports that national guidance changed and which class of
            document a change may affect. It never says what a protocol should say, and
            holds no patient data.
          </p>
          <Attribution />
        </div>
      </footer>
    </>
  );
}
