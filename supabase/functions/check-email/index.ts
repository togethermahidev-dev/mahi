// check-email — does this email already have an account? A hint on the sign-up form only.
//
// Body: { email }. Answers { exists } from the server-only SQL function auth_user_id_by_email
// (one lookup, whatever the number of users; listUsers only ever read the first 50). Never blocks
// sign-up: bad input or any error answers { exists: false }.
import { admin, isValidEmail, json, normalizeEmail } from "../_shared/otp.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { email } = await req.json().catch(() => ({}));
    if (!isValidEmail(email)) return json({ exists: false });

    const { data: userId, error } = await admin().rpc("auth_user_id_by_email", { p_email: normalizeEmail(email) });
    if (error) {
      console.error("check-email lookup failed:", error);
      return json({ exists: false });
    }
    return json({ exists: !!userId });
  } catch (err) {
    console.error("check-email error:", err);
    return json({ exists: false });
  }
});
