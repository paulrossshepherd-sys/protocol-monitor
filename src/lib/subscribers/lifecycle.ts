import type { Pool } from "pg";

export type SignupOutcome =
  | { status: "confirmation_sent"; email: string; confirmToken: string }
  | { status: "already_confirmed" }
  | { status: "suppressed" }
  | { status: "invalid" };

/**
 * Double opt-in (§7.2): a signup only ever creates an unconfirmed row plus a
 * single-use token. Nothing is added to the sending list until the address is
 * confirmed, so a typo'd or malicious signup cannot subscribe someone else.
 */
export async function startSignup(
  pool: Pool,
  email: string,
  orgType: string | null,
  sourceNote = "public signup form"
): Promise<SignupOutcome> {
  const address = email.trim().toLowerCase();

  // A complaint or hard bounce is never silently undone by a new signup
  // (§6.5) — the person is told to get in touch instead.
  const { rows: suppressed } = await pool.query(
    `select 1 from suppressions where email = $1`,
    [address]
  );
  if (suppressed[0]) return { status: "suppressed" };

  const { rows: existing } = await pool.query<{
    id: string;
    confirmed_at: Date | null;
    unsubscribed_at: Date | null;
  }>(`select id, confirmed_at, unsubscribed_at from subscribers where email = $1`, [
    address,
  ]);

  if (existing[0]?.confirmed_at && !existing[0].unsubscribed_at) {
    return { status: "already_confirmed" };
  }

  if (existing[0]) {
    // Unconfirmed, or previously unsubscribed and coming back: issue a fresh
    // token and re-open the row. confirmed_at must be cleared alongside it —
    // the CHECK allows a token only while unconfirmed.
    const { rows } = await pool.query<{ confirm_token: string }>(
      `update subscribers
          set confirm_token = encode(gen_random_bytes(24), 'hex'),
              confirmed_at = null,
              unsubscribed_at = null,
              org_type = coalesce($2, org_type)
        where id = $1
        returning confirm_token`,
      [existing[0].id, orgType]
    );
    return { status: "confirmation_sent", email: address, confirmToken: rows[0].confirm_token };
  }

  const { rows } = await pool.query<{ confirm_token: string }>(
    `insert into subscribers (email, org_type, source_note)
     values ($1, $2, $3)
     returning confirm_token`,
    [address, orgType, sourceNote]
  );
  return { status: "confirmation_sent", email: address, confirmToken: rows[0].confirm_token };
}

export type ConfirmOutcome = "confirmed" | "already_confirmed" | "unknown_token";

/**
 * The confirm token is single-use: it is nulled as confirmed_at is set, and
 * the schema's CHECK holds that invariant. A replayed link finds no row.
 */
export async function confirmSubscriber(
  pool: Pool,
  token: string
): Promise<ConfirmOutcome> {
  if (!token) return "unknown_token";
  const { rows } = await pool.query<{ id: string }>(
    `update subscribers
        set confirmed_at = now(), confirm_token = null, unsubscribed_at = null
      where confirm_token = $1
      returning id`,
    [token]
  );
  return rows[0] ? "confirmed" : "unknown_token";
}

export type UnsubscribeOutcome = "unsubscribed" | "already_unsubscribed" | "unknown_token";

/**
 * One click, no login (§7.2), and idempotent — a mail client's RFC 8058 POST
 * and the human following the link must both be safe to repeat.
 */
export async function unsubscribeByToken(
  pool: Pool,
  token: string
): Promise<UnsubscribeOutcome> {
  if (!token) return "unknown_token";
  // The CTE reads the row as it stood before the update, so "was this already
  // unsubscribed" is answered from state rather than from clock arithmetic.
  const { rows } = await pool.query<{ already: boolean }>(
    `with prior as (
       select id, unsubscribed_at from subscribers where unsubscribe_token = $1
     ), updated as (
       update subscribers s set unsubscribed_at = now()
         from prior
        where s.id = prior.id and s.unsubscribed_at is null
       returning s.id
     )
     select (prior.unsubscribed_at is not null) as already from prior`,
    [token]
  );
  if (!rows[0]) return "unknown_token";
  return rows[0].already ? "already_unsubscribed" : "unsubscribed";
}
