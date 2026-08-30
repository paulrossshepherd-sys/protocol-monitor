// The single-admin rule (§7.1), enforced in code: a Supabase session is only
// accepted when its email matches ADMIN_EMAIL. Anyone else who somehow obtains
// an account on this Supabase project is still refused.
export function isAdminEmail(email: string | null | undefined): boolean {
  const admin = process.env.ADMIN_EMAIL;
  if (!admin || !email) return false;
  return email.trim().toLowerCase() === admin.trim().toLowerCase();
}
