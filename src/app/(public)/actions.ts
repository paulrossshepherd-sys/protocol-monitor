"use server";

import { redirect } from "next/navigation";

import { getPool } from "@/lib/db";
import { sendEmail, siteUrl } from "@/lib/email/send";
import { isOrgType, isPlausibleEmail } from "@/lib/subscribers/org-types";
import { startSignup } from "@/lib/subscribers/lifecycle";

// Plain form post so the page works with JavaScript disabled (§7.2): the
// result is carried in the query string rather than rendered client-side.
export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const orgTypeRaw = String(formData.get("org_type") ?? "").trim();

  if (!isPlausibleEmail(email)) redirect("/?signup=invalid#signup");
  const orgType = isOrgType(orgTypeRaw) ? orgTypeRaw : null;

  const outcome = await startSignup(getPool(), email, orgType);

  if (outcome.status === "already_confirmed") redirect("/?signup=already#signup");
  if (outcome.status === "suppressed") redirect("/?signup=suppressed#signup");
  if (outcome.status === "invalid") redirect("/?signup=invalid#signup");

  const confirmUrl = `${siteUrl()}/confirm/${outcome.confirmToken}`;
  const result = await sendEmail({
    to: outcome.email,
    subject: "Confirm your Protocol Monitor subscription",
    text: `Please confirm you want the weekly Protocol Monitor digest by opening this link:\n\n${confirmUrl}\n\nIf you did not ask for this, ignore this email — nothing will be sent to you.\n`,
    html: `<p>Please confirm you want the weekly Protocol Monitor digest:</p>
<p><a href="${confirmUrl}">Confirm my subscription</a></p>
<p>If you did not ask for this, ignore this email — nothing will be sent to you.</p>
<p style="color:#666;font-size:12px">What we hold and why is set out in our <a href="${siteUrl()}/privacy">privacy notice</a>.</p>`,
  });

  redirect(result.ok ? "/?signup=check-email#signup" : "/?signup=send-failed#signup");
}
