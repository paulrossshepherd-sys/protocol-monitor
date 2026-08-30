import { requireEnv } from "@/lib/env";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** RFC 8058 one-click unsubscribe (§8) — set on anything bulk. */
  unsubscribeUrl?: string;
}

export interface SendOutcome {
  ok: boolean;
  providerMessageId: string | null;
  error: string | null;
}

export function siteUrl(): string {
  return requireEnv("NEXT_PUBLIC_SITE_URL").replace(/\/+$/, "");
}

/**
 * One transactional message through Resend (§6.5 — never Broadcasts). The
 * per-issue batch send is step 6; this is the single-recipient path used by
 * double opt-in and test sends.
 */
export async function sendEmail(email: OutgoingEmail): Promise<SendOutcome> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, providerMessageId: null, error: "RESEND_API_KEY is not set" };
  }

  const headers: Record<string, string> = {};
  if (email.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${email.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: requireEnv("EMAIL_FROM"),
        to: [email.to],
        reply_to: process.env.EMAIL_REPLY_TO,
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(Object.keys(headers).length ? { headers } : {}),
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        providerMessageId: null,
        error: `${res.status} ${(await res.text()).slice(0, 200)}`,
      };
    }
    const body = (await res.json()) as { id?: string };
    return { ok: true, providerMessageId: body.id ?? null, error: null };
  } catch (err) {
    return {
      ok: false,
      providerMessageId: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
