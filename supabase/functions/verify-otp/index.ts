// verify-otp — checks a typed sign-up code on the server.
//
// Body: { email, code }. Looks up the latest open code for the email and writes the attempt in
// one conditional UPDATE, so two parallel tries cannot both count as the same one. On a match the
// code is spent and stamped verified_at, which complete-signup and hook_require_verified_signup
// accept for 30 minutes. Five wrong tries spend the code. Every failure returns the same message,
// so it cannot be used to learn which emails have codes.
import { admin, attemptPatch, INVALID_CODE, isValidEmail, json, MAX_ATTEMPTS, normalizeEmail, sha256 } from "../_shared/otp.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { email: rawEmail, code } = await req.json().catch(() => ({}));
    if (!isValidEmail(rawEmail)) return json({ error: "Valid email required" }, 400);
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) return json({ error: "Enter the 6-digit code." }, 400);
    const email = normalizeEmail(rawEmail);
    const db = admin();

    const { data: rows, error: lookupError } = await db.from("otp_codes")
      .select("id, code_hash, attempts")
      .eq("email", email)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .lt("attempts", MAX_ATTEMPTS)
      .order("expires_at", { ascending: false })
      .limit(1);
    const row = rows?.[0];
    if (lookupError || !row) {
      if (lookupError) console.error("[verify-otp] lookup failed:", lookupError);
      return json({ error: INVALID_CODE }, 400);
    }

    const hashMatches = (await sha256(code)) === row.code_hash;
    const { data: updated, error: updateError } = await db.from("otp_codes")
      .update(attemptPatch({ hashMatches, attempts: row.attempts, now: new Date() }))
      .eq("id", row.id)
      .eq("used", false)
      .eq("attempts", row.attempts)
      .select("id");
    if (updateError) console.error("[verify-otp] update failed:", updateError);
    if (!hashMatches || updateError || !updated?.length) return json({ error: INVALID_CODE }, 400);

    return json({ verified: true });
  } catch (err) {
    console.error("[verify-otp] error:", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
