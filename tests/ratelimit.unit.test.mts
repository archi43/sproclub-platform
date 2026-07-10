/**
 * Rate-limiting rules (INC-12), pure — tested off-DB. Covers the client-identifier
 * derivation from proxy headers (fail-safe, never throws) and the named limits.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIdentifier, LOGIN_LIMIT, LOGIN_EMAIL_LIMIT } from "../src/lib/ratelimit-rules.ts";

test("clientIdentifier prefers x-real-ip (platform-set, non-spoofable)", () => {
  // Even when a caller-supplied x-forwarded-for is present, the trusted x-real-ip wins.
  assert.equal(clientIdentifier("198.51.100.9", "1.2.3.4, 5.6.7.8"), "198.51.100.9");
  assert.equal(clientIdentifier("  198.51.100.9  ", null), "198.51.100.9");
});

test("clientIdentifier falls back to the first x-forwarded-for hop, then 'unknown'", () => {
  assert.equal(clientIdentifier(null, "203.0.113.7, 70.41.3.18"), "203.0.113.7");
  assert.equal(clientIdentifier("", "203.0.113.7"), "203.0.113.7");
  assert.equal(clientIdentifier(null, null), "unknown");
  assert.equal(clientIdentifier("", ""), "unknown");
});

test("login is limited on two axes: per IP and per recipient e-mail", () => {
  assert.equal(LOGIN_LIMIT.bucket, "login");
  assert.equal(LOGIN_LIMIT.max, 5);
  assert.equal(LOGIN_LIMIT.windowSeconds, 900);
  assert.equal(LOGIN_EMAIL_LIMIT.bucket, "login-email");
  assert.equal(LOGIN_EMAIL_LIMIT.max, 5);
  assert.equal(LOGIN_EMAIL_LIMIT.windowSeconds, 900);
});
