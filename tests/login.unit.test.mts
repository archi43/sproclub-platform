/**
 * Login rules (OTP par code), pure — tested off-DB. Covers the user-typed code
 * normalization (paste artifacts, wrong lengths) and the brute-force limits:
 * a 6-digit code has 10^6 combinations, so verification attempts must be
 * capped per target e-mail independently of the client IP.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeOtpCode, OTP_CODE_LENGTH } from "../src/lib/login-rules.ts";
import { OTP_VERIFY_LIMIT, OTP_VERIFY_EMAIL_LIMIT, LOGIN_EMAIL_LIMIT } from "../src/lib/ratelimit-rules.ts";

test("sanitizeOtpCode accepts a clean 6-digit code", () => {
  assert.equal(sanitizeOtpCode("123456"), "123456");
  assert.equal(sanitizeOtpCode("000000"), "000000");
});

test("sanitizeOtpCode normalizes paste artifacts (spaces, separators)", () => {
  // Codes are often displayed grouped ("123 456") and pasted as-is from mail clients.
  assert.equal(sanitizeOtpCode("123 456"), "123456");
  assert.equal(sanitizeOtpCode(" 123-456 "), "123456");
  assert.equal(sanitizeOtpCode("12 34 56"), "123456");
});

test("sanitizeOtpCode rejects anything that is not exactly 6 digits", () => {
  assert.equal(sanitizeOtpCode(""), null);
  assert.equal(sanitizeOtpCode("12345"), null);
  assert.equal(sanitizeOtpCode("1234567"), null);
  assert.equal(sanitizeOtpCode("abcdef"), null);
  // Letters mixed in leave fewer than 6 digits — reject, never guess.
  assert.equal(sanitizeOtpCode("12a456"), null);
});

test("OTP length matches the Supabase configuration (otp_length = 6)", () => {
  assert.equal(OTP_CODE_LENGTH, 6);
});

test("verification attempts are capped per target e-mail, independent of IP", () => {
  // Distributed brute force rotates IPs: the per-e-mail budget is the real guard.
  assert.ok(OTP_VERIFY_EMAIL_LIMIT.max <= 10, "per-email attempts must stay far below 10^6 combinations");
  assert.ok(OTP_VERIFY_EMAIL_LIMIT.bucket !== OTP_VERIFY_LIMIT.bucket, "independent buckets");
  assert.ok(OTP_VERIFY_EMAIL_LIMIT.bucket !== LOGIN_EMAIL_LIMIT.bucket, "sending and verifying budgets are separate");
});
