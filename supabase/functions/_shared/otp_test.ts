// deno test supabase/functions/_shared/otp_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import {
  attemptPatch,
  bearerToken,
  generateCode,
  getClientIp,
  isStrongPassword,
  isValidEmail,
  MAX_ATTEMPTS,
  setPasswordAndSignOut,
  sha256,
  signupUserAttributes,
  tryVerifiedCode,
} from "./otp.ts";

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

Deno.test("new password: same rule as the app (8+ characters, two of upper case, digit, symbol)", () => {
  assert(!isStrongPassword("Ab1!"));
  assert(!isStrongPassword("abcdefgh"));
  assert(!isStrongPassword("Abcdefgh"));
  assert(isStrongPassword("Abcdefg1"));
  assert(isStrongPassword("abcdef1!"));
  assert(isStrongPassword("Abcdef1!"));
  assert(!isStrongPassword(undefined));
});

Deno.test("signed-in caller: the token from the Authorization header", () => {
  const req = (h: Record<string, string>) => new Request("http://x", { headers: h });
  assertEquals(bearerToken(req({ Authorization: "Bearer abc.def" })), "abc.def");
  assertEquals(bearerToken(req({ authorization: "bearer  xyz " })), "xyz");
  assertEquals(bearerToken(req({ Authorization: "Basic abc" })), null);
  assertEquals(bearerToken(req({})), null);
});

// A stand-in for the Supabase client: every query step records itself, and awaiting a query
// gives the next queued result.
function fakeDb(results: unknown[]) {
  const calls: unknown[][] = [];
  const query = (first: unknown[]) => {
    calls.push(first);
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gt", "lt", "lte", "order", "limit", "update"]) {
      q[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return q;
      };
    }
    q.then = (resolve: (v: unknown) => void) => resolve(results.shift());
    return q;
  };
  return { db: { from: (t: string) => query(["from", t]) } as unknown as SupabaseClient, calls };
}

Deno.test("complete-signup creates a confirmed user with the marker the sign-up hook needs", () => {
  assertEquals(signupUserAttributes("a@b.co", "Secret1!"), {
    email: "a@b.co",
    password: "Secret1!",
    email_confirm: true,
    app_metadata: { signup_via: "complete-signup" },
  });
});

Deno.test("checked code: only one inside the five tries is looked up", async () => {
  const { db, calls } = fakeDb([{ data: [], error: null }]);
  assertEquals(await tryVerifiedCode(db, "a@b.co", "123456"), false);
  assertEquals(calls.find((c) => c[0] === "lte"), ["lte", "attempts", MAX_ATTEMPTS]);
  assert(calls.some((c) => c[0] === "eq" && c[1] === "purpose" && c[2] === "signup"));
  assert(calls.some((c) => c[0] === "gt" && c[1] === "verified_at"));
});

Deno.test("checked code: a wrong code counts a try and is refused", async () => {
  const row = { id: "r1", code_hash: await sha256("111111"), attempts: 2 };
  const { db, calls } = fakeDb([{ data: [row], error: null }, { data: [{ id: "r1" }], error: null }]);
  assertEquals(await tryVerifiedCode(db, "a@b.co", "999999"), false);
  assertEquals(calls.find((c) => c[0] === "update"), ["update", { attempts: 3 }]);
  assert(calls.some((c) => c[0] === "eq" && c[1] === "attempts" && c[2] === 2), "only if nobody counted a try since");
});

Deno.test("checked code: the right code counts a try and passes", async () => {
  const row = { id: "r1", code_hash: await sha256("111111"), attempts: 1 };
  const { db, calls } = fakeDb([{ data: [row], error: null }, { data: [{ id: "r1" }], error: null }]);
  assertEquals(await tryVerifiedCode(db, "a@b.co", "111111"), true);
  assertEquals(calls.find((c) => c[0] === "update"), ["update", { attempts: 2 }]);
});

Deno.test("checked code: the right code loses to a parallel try that was counted first", async () => {
  const row = { id: "r1", code_hash: await sha256("111111"), attempts: 1 };
  const { db } = fakeDb([{ data: [row], error: null }, { data: [], error: null }]);
  assertEquals(await tryVerifiedCode(db, "a@b.co", "111111"), false);
});

function fakeAdmin(updateError: unknown, rpcError: unknown = null) {
  const calls: unknown[][] = [];
  const db = {
    auth: {
      admin: {
        updateUserById: (id: string, attrs: unknown) => {
          calls.push(["updateUserById", id, attrs]);
          return Promise.resolve({ error: updateError });
        },
      },
    },
    rpc: (fn: string, args: unknown) => {
      calls.push(["rpc", fn, args]);
      return Promise.resolve({ error: rpcError });
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

Deno.test("new password: set, then every session signed out", async () => {
  const { db, calls } = fakeAdmin(null);
  assertEquals(await setPasswordAndSignOut(db, "u1", "Secret1!"), { error: null });
  assertEquals(calls, [
    ["updateUserById", "u1", { password: "Secret1!" }],
    ["rpc", "revoke_user_sessions", { p_user: "u1" }],
  ]);
});

Deno.test("new password: nobody is signed out when the change fails", async () => {
  const failure = { message: "boom" };
  const { db, calls } = fakeAdmin(failure);
  const result = await setPasswordAndSignOut(db, "u1", "Secret1!");
  assertEquals(result.error as unknown, failure);
  assertEquals(calls.length, 1);
});

Deno.test("new password: still changed when the sign-out fails (logged)", async () => {
  const { db } = fakeAdmin(null, { message: "no function" });
  assertEquals(await setPasswordAndSignOut(db, "u1", "Secret1!"), { error: null });
});
