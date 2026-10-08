// Shared pieces of the emailed-code flows: sign-up (send-otp, verify-otp, complete-signup) and
// password reset (send-reset-code, reset-password).
// Codes live hashed in public.otp_codes; see migration 20260923230000_signup_codes.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";

export const MAX_ATTEMPTS = 5;
export const CODE_TTL_MS = 10 * 60 * 1000;
// complete-signup and hook_require_verified_signup both allow 30 minutes after verify-otp.
export const VERIFIED_WINDOW_MS = 30 * 60 * 1000;
// complete-signup puts this in the new user's app_metadata. hook_require_verified_signup refuses
// an email sign-up without it (migration 20261008100000_security_hardening), so the public
// sign-up endpoint, which can't set app_metadata, stays closed even inside the 30 minutes.
export const SIGNUP_VIA = "complete-signup";
export const INVALID_CODE = "Invalid or expired code";

export function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// otp_codes.purpose (migration 20261001100000): sign-up and reset codes never count for each other.
export type CodePurpose = "signup" | "reset";

// Same rule as the app's src/lib/password.ts: not 'low' = 8+ characters and at least two of
// upper case, digit, symbol.
const SPECIAL = /[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/;
export function isStrongPassword(pw: unknown): pw is string {
  if (typeof pw !== "string" || pw.length < 8) return false;
  return [/[A-Z]/.test(pw), /[0-9]/.test(pw), SPECIAL.test(pw)].filter(Boolean).length >= 2;
}

// The signed-in caller's access token, or null.
export function bearerToken(req: Request): string | null {
  const m = /^bearer\s+(\S+)\s*$/i.exec(req.headers.get("authorization") ?? "");
  return m ? m[1] : null;
}

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function generateCode(): string {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return (n[0] % 1_000_000).toString().padStart(6, "0");
}

export async function sha256(input: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// What one verify attempt writes. The try always counts; the code is spent on a match or on
// the last wrong try; verified_at is stamped on a match ONLY, so burning all five tries never
// earns a sign-up.
export function attemptPatch(input: { hashMatches: boolean; attempts: number; now: Date }) {
  const attempts = input.attempts + 1;
  const used = input.hashMatches || attempts >= MAX_ATTEMPTS;
  return input.hashMatches ? { attempts, used, verified_at: input.now.toISOString() } : { attempts, used };
}

// Cloudflare sets cf-connecting-ip and overwrites any client value. x-forwarded-for is only a
// fallback, and only its LAST entry (the one the proxy appended) — the first is client-controlled.
export function getClientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const hops = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return hops.at(-1) ?? "unknown";
}

// Per-address limit backed by public.auth_rate_limits. Fails closed if the lookup errors.
export async function withinIpLimit(
  db: SupabaseClient,
  ip: string,
  action: string,
  perMinute: number,
  perHour: number,
): Promise<boolean> {
  for (const [ms, max] of [[60_000, perMinute], [3_600_000, perHour]]) {
    const { count, error } = await db.from("auth_rate_limits").select("id", { count: "exact", head: true })
      .eq("ip", ip).eq("action", action).gte("created_at", new Date(Date.now() - ms).toISOString());
    if (error) {
      console.error("[rate-limit] lookup failed:", error);
      return false;
    }
    if ((count ?? 0) >= max) return false;
  }
  const { error } = await db.from("auth_rate_limits").insert({ ip, action });
  if (error) console.error("[rate-limit] record failed (allowing):", error);
  return true;
}

// Per-email send limits for one kind of code: 1 a minute, 5 an hour. The message, or null.
export async function emailLimitMessage(db: SupabaseClient, email: string, purpose: CodePurpose) {
  for (const [ms, max, message] of [
    [60_000, 1, "Please wait a minute before asking for another code."],
    [3_600_000, 5, "Too many codes requested. Please try again later."],
  ] as const) {
    const { count } = await db.from("otp_codes").select("id", { count: "exact", head: true })
      .eq("email", email).eq("purpose", purpose).gte("created_at", new Date(Date.now() - ms).toISOString());
    if ((count ?? 0) >= max) return message;
  }
  return null;
}

// Retires the email's open codes of this kind and stores a new one (hash only). The row id and
// the code to email, or null if it could not be stored.
export async function storeNewCode(db: SupabaseClient, email: string, purpose: CodePurpose) {
  await db.from("otp_codes").update({ used: true }).eq("email", email).eq("purpose", purpose).eq("used", false);
  const code = generateCode();
  const { data: row, error } = await db.from("otp_codes").insert({
    email,
    purpose,
    code_hash: await sha256(code),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  }).select("id").single();
  if (error || !row) {
    console.error("[otp] store failed:", error);
    return null;
  }
  return { id: row.id as string, code };
}

// One try at the email's latest open code of this kind: looks it up and writes the attempt in one
// conditional UPDATE, so two parallel tries cannot both count as the same one. True on a match.
export async function tryCode(db: SupabaseClient, email: string, code: string, purpose: CodePurpose) {
  const { data: rows, error: lookupError } = await db.from("otp_codes")
    .select("id, code_hash, attempts")
    .eq("email", email)
    .eq("purpose", purpose)
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .lt("attempts", MAX_ATTEMPTS)
    .order("expires_at", { ascending: false })
    .limit(1);
  const row = rows?.[0];
  if (lookupError || !row) {
    if (lookupError) console.error("[otp] lookup failed:", lookupError);
    return false;
  }
  return await countTry(db, row, code, true, (hashMatches) =>
    attemptPatch({ hashMatches, attempts: row.attempts, now: new Date() }));
}

// complete-signup's check of a sign-up code verify-otp already accepted (in the last 30 minutes).
// Every try counts against the same five as verify-otp: the code stays usable while attempts is
// at most MAX_ATTEMPTS, so guessing it here gets at most five tries in all. True on a match.
export async function tryVerifiedCode(db: SupabaseClient, email: string, code: string) {
  const { data: rows, error: lookupError } = await db.from("otp_codes")
    .select("id, code_hash, attempts")
    .eq("email", email)
    .eq("purpose", "signup")
    .gt("verified_at", new Date(Date.now() - VERIFIED_WINDOW_MS).toISOString())
    .lte("attempts", MAX_ATTEMPTS)
    .order("verified_at", { ascending: false })
    .limit(1);
  const row = rows?.[0];
  if (lookupError || !row) {
    if (lookupError) console.error("[otp] lookup failed:", lookupError);
    return false;
  }
  // The right code also stamps the row as claimed: hook_require_verified_signup lets an email
  // account be created only within minutes of this stamp (20261008130000_security_followups).
  return await countTry(db, row, code, false, (hashMatches) => ({
    attempts: row.attempts + 1,
    ...(hashMatches ? { signup_claimed_at: new Date().toISOString() } : {}),
  }));
}

// Writes one try on a code row, only if nobody else counted a try on it since it was read (and,
// for an open code, it wasn't retired meanwhile). True when the code matched AND this write won,
// so a burst of parallel guesses gets one counted try, not many.
async function countTry(
  db: SupabaseClient,
  row: { id: string; code_hash: string; attempts: number },
  code: string,
  mustBeOpen: boolean,
  patch: (hashMatches: boolean) => Record<string, unknown>,
) {
  const hashMatches = (await sha256(code)) === row.code_hash;
  let update = db.from("otp_codes").update(patch(hashMatches)).eq("id", row.id);
  if (mustBeOpen) update = update.eq("used", false);
  const { data: updated, error: updateError } = await update.eq("attempts", row.attempts).select("id");
  if (updateError) console.error("[otp] update failed:", updateError);
  return hashMatches && !updateError && !!updated?.length;
}

// What complete-signup asks the admin API for: a confirmed email user carrying SIGNUP_VIA.
export function signupUserAttributes(email: string, password: string) {
  return { email, password, email_confirm: true, app_metadata: { signup_via: SIGNUP_VIA } };
}

// reset-password: sets the new password, then signs the account out everywhere
// (revoke_user_sessions, migration 20261008100000_security_hardening), so a session someone else
// holds doesn't outlive the reset. A failed sign-out is logged; the password change stands.
export async function setPasswordAndSignOut(db: SupabaseClient, userId: string, password: string) {
  const { error } = await db.auth.admin.updateUserById(userId, { password });
  if (error) return { error };
  const { error: signOutError } = await db.rpc("revoke_user_sessions", { p_user: userId });
  if (signOutError) console.error("[otp] sign-out after password change failed:", signOutError);
  return { error: null };
}
