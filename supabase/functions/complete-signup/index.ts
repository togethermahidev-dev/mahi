// complete-signup — creates the account once the email's code has been verified.
//
// Body: { email, password, code }. The account is created only if verify-otp stamped a code for
// this email in the last 30 minutes AND the code sent here is that same code, so knowing someone's
// email is not enough to take the account in that window. The account is created already
// confirmed; hook_require_verified_signup applies the same 30-minute check inside Supabase Auth.
import { admin, INVALID_CODE, isValidEmail, json, normalizeEmail, sha256, VERIFIED_WINDOW_MS } from "../_shared/otp.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { email: rawEmail, password, code } = await req.json().catch(() => ({}));
    if (!isValidEmail(rawEmail)) return json({ error: "Valid email required" }, 400);
    if (typeof password !== "string" || password.length < 8) {
      return json({ error: "Password must be at least 8 characters" }, 400);
    }
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) return json({ error: INVALID_CODE }, 400);
    const email = normalizeEmail(rawEmail);
    const db = admin();

    const { data: rows, error: lookupError } = await db.from("otp_codes")
      .select("code_hash")
      .eq("email", email)
      .gt("verified_at", new Date(Date.now() - VERIFIED_WINDOW_MS).toISOString())
      .order("verified_at", { ascending: false })
      .limit(1);
    if (lookupError) console.error("[complete-signup] lookup failed:", lookupError);
    if (!rows?.[0] || rows[0].code_hash !== (await sha256(code))) {
      return json({ error: "Your code has expired. Go back and ask for a new one." }, 400);
    }

    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) {
      if (error?.code === "email_exists") {
        return json({ error: "This email already has an account. Log in instead." }, 409);
      }
      console.error("[complete-signup] createUser failed:", error);
      return json({ error: "Failed to create account. Please try again." }, 500);
    }

    return json({ ok: true, user: { id: data.user.id, email: data.user.email } });
  } catch (err) {
    console.error("[complete-signup] error:", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
