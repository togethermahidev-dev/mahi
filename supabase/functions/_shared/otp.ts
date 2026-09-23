// Shared pieces of the sign-up code flow (send-otp, verify-otp, complete-signup).
// Codes live hashed in public.otp_codes; see migration 20260923230000_signup_codes.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.116.0";

export const MAX_ATTEMPTS = 5;
export const CODE_TTL_MS = 10 * 60 * 1000;
// complete-signup and hook_require_verified_signup both allow 30 minutes after verify-otp.
export const VERIFIED_WINDOW_MS = 30 * 60 * 1000;
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
