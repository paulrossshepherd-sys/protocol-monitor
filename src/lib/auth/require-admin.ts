import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { isAdminEmail } from "@/lib/auth/admin";

export interface SessionUser {
  email?: string | null;
}

export type UserGetter = () => Promise<SessionUser | null>;

/**
 * Authorisation for anything reachable outside a matched route: server actions
 * resolve by action ID and can be POSTed to any route, so path-matched
 * middleware does not protect them. Every server action and every route
 * handler that reads or writes data calls this first.
 */
export async function requireAdmin(getUser: UserGetter = sessionUser): Promise<void> {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) {
    throw new Error("Not authorised");
  }
}

async function sessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        // Server actions may not write cookies during render; token refresh is
        // the middleware's job, so this is deliberately a no-op.
        setAll: () => {},
      },
    }
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
