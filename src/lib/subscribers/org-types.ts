// §7.2: ordered by fit with the launch content, not alphabetically.
export const ORG_TYPES = [
  "Independent primary care provider",
  "Occupational health service",
  "GP federation",
  "Primary care network",
  "Urgent or out-of-hours care",
  "Hospice",
  "Other",
] as const;

export type OrgType = (typeof ORG_TYPES)[number];

export function isOrgType(value: unknown): value is OrgType {
  return typeof value === "string" && (ORG_TYPES as readonly string[]).includes(value);
}

// Deliberately permissive: the confirmation email is the real check (§7.2).
export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}
