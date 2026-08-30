import assert from "node:assert/strict";
import { test } from "node:test";

import { isAdminEmail } from "@/lib/auth/admin";

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
