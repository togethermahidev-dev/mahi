// verify-otp — checks a typed sign-up code on the server.
//
// Body: { email, code }. Tries the latest open sign-up code for the email (see tryCode). On a
// match the code is spent and stamped verified_at, which complete-signup and
// hook_require_verified_signup accept for 30 minutes. Five wrong tries spend the code. Every
// failure returns the same message, so it cannot be used to learn which emails have codes.
import { admin, INVALID_CODE, isValidEmail, json, normalizeEmail, tryCode } from "../_shared/otp.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { email: rawEmail, code } = await req.json().catch(() => ({}));
    if (!isValidEmail(rawEmail)) return json({ error: "Valid email required" }, 400);
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) return json({ error: "Enter the 6-digit code." }, 400);

    if (!(await tryCode(admin(), normalizeEmail(rawEmail), code, "signup"))) {
      return json({ error: INVALID_CODE }, 400);
    }
    return json({ verified: true });
  } catch (err) {
    console.error("[verify-otp] error:", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
