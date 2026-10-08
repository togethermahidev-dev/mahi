// complete-signup — creates the account once the email's code has been verified.
//
// Body: { email, password, code }. The account is created only if verify-otp stamped a code for
// this email in the last 30 minutes AND the code sent here is that same code, so knowing someone's
// email is not enough to take the account in that window. Tries here count against the code's
// same five tries as verify-otp (tryVerifiedCode), so the code can't be guessed. The account is
// created already confirmed. The right code stamps the code row as claimed (tryVerifiedCode), and
// hook_require_verified_signup refuses an email sign-up without a stamp from the last 5 minutes,
// which keeps the public sign-up endpoint closed (20261008130000_security_followups). Deploy this
// right after that migration: it writes the new otp_codes.signup_claimed_at column.
import {
  admin,
  INVALID_CODE,
  isValidEmail,
  json,
  normalizeEmail,
  signupUserAttributes,
  tryVerifiedCode,
} from "../_shared/otp.ts";

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

    if (!(await tryVerifiedCode(db, email, code))) {
      return json({ error: "Your code has expired. Go back and ask for a new one." }, 400);
    }

    const { data, error } = await db.auth.admin.createUser(signupUserAttributes(email, password));
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
