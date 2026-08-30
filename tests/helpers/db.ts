import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

// Rebuilds the schema from the migration files — the same SQL that will run
// against Supabase, applied in filename order to an empty public schema.
export async function freshDatabase(): Promise<Pool> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must point at the local test Postgres");
  const pool = new Pool({ connectionString: url, max: 2 });
  await pool.query("drop schema public cascade; create schema public;");
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await pool.query(await readFile(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  return pool;
}
