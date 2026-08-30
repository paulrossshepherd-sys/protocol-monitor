import Link from "next/link";

import { SignOutButton } from "@/app/admin/sign-out-button";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/queue", label: "Review queue" },
  { href: "/admin/nice", label: "Paste from NICE" },
  { href: "/admin/composer", label: "Issue composer" },
  { href: "/admin/sources", label: "Sources" },
  { href: "/admin/subscribers", label: "Subscribers" },
  { href: "/admin/delivery", label: "Delivery" },
  { href: "/admin/replies", label: "Replies" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <nav className="sticky top-0 flex h-screen w-52 flex-none flex-col gap-0.5 border-r p-3">
        <div className="px-2 pb-2 pt-1 text-sm font-semibold">Protocol Monitor</div>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-2 py-1.5 text-sm hover:bg-muted"
          >
            {item.label}
          </Link>
        ))}
        <div className="mt-auto">
          <SignOutButton />
        </div>
      </nav>
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
