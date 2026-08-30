import assert from "node:assert/strict";
import { test } from "node:test";

import { isAdminEmail } from "@/lib/auth/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

// The ADMIN_EMAIL restriction is enforced in code (middleware calls this on
// every /admin request); these are its rules.
test("only the configured admin email passes", () => {
  process.env.ADMIN_EMAIL = "operator@example.com";
  assert.equal(isAdminEmail("operator@example.com"), true);
  assert.equal(isAdminEmail("OPERATOR@Example.COM"), true); // case-insensitive
  assert.equal(isAdminEmail(" operator@example.com "), true); // whitespace-tolerant
  assert.equal(isAdminEmail("someone-else@example.com"), false);
  assert.equal(isAdminEmail("operator@example.com.attacker.net"), false);
  assert.equal(isAdminEmail(""), false);
  assert.equal(isAdminEmail(null), false);
  assert.equal(isAdminEmail(undefined), false);
});

test("no configured admin email means nobody is admin", () => {
  delete process.env.ADMIN_EMAIL;
  assert.equal(isAdminEmail("operator@example.com"), false);
  process.env.ADMIN_EMAIL = "";
  assert.equal(isAdminEmail(""), false);
});

// Server actions resolve by action ID and can be POSTed to any route, so
// path-matched middleware does not protect them: each one calls requireAdmin
// itself. These are the cases that must throw rather than proceed.
test("requireAdmin throws without a session", async () => {
  process.env.ADMIN_EMAIL = "operator@example.com";
  await assert.rejects(() => requireAdmin(async () => null), /Not authorised/);
});

test("requireAdmin throws for a signed-in non-admin", async () => {
  process.env.ADMIN_EMAIL = "operator@example.com";
  await assert.rejects(
    () => requireAdmin(async () => ({ email: "someone-else@example.com" })),
    /Not authorised/
  );
  await assert.rejects(
    () => requireAdmin(async () => ({ email: null })),
    /Not authorised/
  );
});

test("requireAdmin passes for the admin session", async () => {
  process.env.ADMIN_EMAIL = "operator@example.com";
  await requireAdmin(async () => ({ email: "Operator@Example.com" }));
});

test("requireAdmin throws when ADMIN_EMAIL is unset, even with a session", async () => {
  delete process.env.ADMIN_EMAIL;
  await assert.rejects(
    () => requireAdmin(async () => ({ email: "operator@example.com" })),
    /Not authorised/
  );
});
