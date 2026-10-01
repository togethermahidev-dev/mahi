// send-reset-code — emails a 6-digit code for choosing a new password (flag auth-password-reset).
//
// Body: { email }. Never reveals whether the email has an account: every valid email gets the
// same answer AND the same work (a code is stored and emailed either way, so even the response
// time is the same); the email's words make sense with or without an account. reset-password
// only changes a password for an account that exists.
// Limits as send-otp: 1 code per email per minute and 5 per hour (reset codes only); 5 per
// network address per minute and 30 per hour. Stores only the code's hash (purpose 'reset').
// Secrets: RESEND_API_KEY, plus the built-in SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
import { codeEmailHtml, sendEmail } from "../_shared/email.ts";
import {
  admin,
  emailLimitMessage,
  getClientIp,
  isValidEmail,
  json,
  normalizeEmail,
  storeNewCode,
  withinIpLimit,
} from "../_shared/otp.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { email: rawEmail } = await req.json().catch(() => ({}));
    if (!isValidEmail(rawEmail)) return json({ error: "Enter a valid email." }, 400);
    const email = normalizeEmail(rawEmail);
    const db = admin();

    if (!(await withinIpLimit(db, getClientIp(req), "send-reset-code", 5, 30))) {
      return json({ error: "Too many requests. Please try again later." }, 429);
    }
    const limited = await emailLimitMessage(db, email, "reset");
    if (limited) return json({ error: limited }, 429);

    const stored = await storeNewCode(db, email, "reset");
    if (!stored) return json({ error: "Failed to send code. Please try again." }, 500);

    const sent = await sendEmail(
      email,
      `${stored.code} — Reset your Mahi password`,
      codeEmailHtml(stored.code, {
        title: "Reset your Mahi password",
        heading: "Choose a new password",
        intro: "Someone asked to reset the password of the Mahi account on this email. " +
          "To choose a new password, enter this code in the app.",
        ignoreNote: "You can safely ignore this email. Your password only changes with this code.",
      }),
    );
    if (!sent) {
      await db.from("otp_codes").delete().eq("id", stored.id);
      return json({ error: "Failed to send email. Please try again." }, 500);
    }

    return json({ sent: true });
  } catch (err) {
    console.error("[send-reset-code] error:", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
