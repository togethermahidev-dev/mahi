// send-otp — makes a 6-digit sign-up code, stores only its hash, emails the code via Resend.
//
// Body: { email }. A `code` sent by old app builds is ignored; the server always makes the code.
// Limits: 1 code per email per minute and 5 per hour; 5 per network address per minute and 30
// per hour. A new code retires the older ones, so verify-otp only ever sees the latest.
// Only sign-up codes (purpose 'signup') count here; reset codes are send-reset-code's.
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
    if (!isValidEmail(rawEmail)) return json({ error: "Valid email required" }, 400);
    const email = normalizeEmail(rawEmail);
    const db = admin();

    if (!(await withinIpLimit(db, getClientIp(req), "send-otp", 5, 30))) {
      return json({ error: "Too many requests. Please try again later." }, 429);
    }
    const limited = await emailLimitMessage(db, email, "signup");
    if (limited) return json({ error: limited }, 429);

    const stored = await storeNewCode(db, email, "signup");
    if (!stored) return json({ error: "Failed to send code. Please try again." }, 500);

    const sent = await sendEmail(
      email,
      `${stored.code} — Confirm your Mahi account`,
      codeEmailHtml(stored.code, {
        title: "Confirm your Mahi account",
        heading: "Welcome &mdash; you&rsquo;re almost in.",
        intro: "Thank you for joining Mahi. To finish setting up your account, enter this code in the app.",
        ignoreNote: "You can safely ignore this email. No account is created without this code.",
      }),
    );
    if (!sent) {
      // Don't let a failed send use up the user's per-minute allowance.
      await db.from("otp_codes").delete().eq("id", stored.id);
      return json({ error: "Failed to send email. Please try again." }, 500);
    }

    return json({ sent: true });
  } catch (err) {
    console.error("[send-otp] error:", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
