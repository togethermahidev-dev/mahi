// reset-password — sets a new password once the emailed reset code checks out
// (flag auth-password-reset).
//
// Body: { email, code, password }. The password must pass the same rule as sign-up before the
// code is tried, so a weak password does not use up a try. The code gets 5 tries (see tryCode)
// and is spent on a match. Only then is the account looked up (server-only SQL function
// auth_user_id_by_email) and its password set with the service-role admin API, and then every
// session of the account is signed out (setPasswordAndSignOut → revoke_user_sessions), so
// whoever else was signed in loses access. A wrong code, an expired one, and an email without an
// account all get the same answer.
import {
  admin,
  INVALID_CODE,
  isStrongPassword,
  isValidEmail,
  json,
  normalizeEmail,
  setPasswordAndSignOut,
  tryCode,
} from "../_shared/otp.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { email: rawEmail, code, password } = await req.json().catch(() => ({}));
    if (!isValidEmail(rawEmail)) return json({ error: "Enter a valid email." }, 400);
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) return json({ error: "Enter the 6-digit code." }, 400);
    if (!isStrongPassword(password)) {
      return json({ error: "Use 8 or more characters with two of: a capital letter, a number, a symbol." }, 400);
    }
    const email = normalizeEmail(rawEmail);
    const db = admin();

    if (!(await tryCode(db, email, code, "reset"))) return json({ error: INVALID_CODE }, 400);

    const { data: userId, error: lookupError } = await db.rpc("auth_user_id_by_email", { p_email: email });
    if (lookupError) console.error("[reset-password] lookup failed:", lookupError);
    if (!userId) return json({ error: INVALID_CODE }, 400);

    const { error } = await setPasswordAndSignOut(db, userId as string, password);
    if (error) {
      console.error("[reset-password] update failed:", error);
      return json({ error: "Couldn't change your password. Ask for a new code and try again." }, 500);
    }
    return json({ ok: true });
  } catch (err) {
    console.error("[reset-password] error:", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
