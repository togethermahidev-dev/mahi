// deno test supabase/functions/_shared/otp_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { attemptPatch, generateCode, getClientIp, isValidEmail, MAX_ATTEMPTS, sha256 } from "./otp.ts";

const now = new Date("2026-09-23T12:00:00Z");

Deno.test("codes are 6 digits, leading zeros kept", () => {
  for (let i = 0; i < 500; i++) assert(/^\d{6}$/.test(generateCode()));
});

Deno.test("sha256 matches the known hash", async () => {
  assertEquals(await sha256("123456"), "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92");
});

Deno.test("right code: used and stamped verified", () => {
  assertEquals(attemptPatch({ hashMatches: true, attempts: 0, now }), {
    attempts: 1, used: true, verified_at: now.toISOString(),
  });
});

Deno.test("wrong code: counts the try, stays open", () => {
  assertEquals(attemptPatch({ hashMatches: false, attempts: 0, now }), { attempts: 1, used: false });
});

Deno.test("last wrong try locks the code and never stamps it verified", () => {
  assertEquals(attemptPatch({ hashMatches: false, attempts: MAX_ATTEMPTS - 1, now }), {
    attempts: MAX_ATTEMPTS, used: true,
  });
});

Deno.test("email check", () => {
  assert(isValidEmail("a@b.co"));
  assert(!isValidEmail("a@b"));
  assert(!isValidEmail("a b@c.co"));
  assert(!isValidEmail(42));
});

Deno.test("client address: Cloudflare header first, then the last forwarded hop", () => {
  const req = (h: Record<string, string>) => new Request("http://x", { headers: h });
  assertEquals(getClientIp(req({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9" })), "1.1.1.1");
  assertEquals(getClientIp(req({ "x-forwarded-for": "6.6.6.6, 2.2.2.2" })), "2.2.2.2");
  assertEquals(getClientIp(req({})), "unknown");
});
