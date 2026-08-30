import { Pool } from "pg";

import { requireEnv } from "@/lib/env";

// Server-side data access goes through Postgres directly (service-role level;
// RLS is deny-all and there are no client-side reads). On Vercel, point
// DATABASE_URL at Supabase's pooled (transaction-mode) connection string.
let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: requireEnv("DATABASE_URL"), max: 3 });
  }
  return pool;
}
