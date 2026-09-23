// send-otp — makes a 6-digit sign-up code, stores only its hash, emails the code via Resend.
//
// Body: { email }. A `code` sent by old app builds is ignored; the server always makes the code.
// Limits: 1 code per email per minute and 5 per hour; 5 per network address per minute and 30
// per hour. A new code retires the older ones, so verify-otp only ever sees the latest.
// Secrets: RESEND_API_KEY, plus the built-in SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
import {
  admin,
  CODE_TTL_MS,
  generateCode,
  getClientIp,
  isValidEmail,
  json,
  normalizeEmail,
  sha256,
  withinIpLimit,
} from "../_shared/otp.ts";

const FROM_ADDRESS = "Mahi <noreply@mahitechnology.com>";

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

    for (const [ms, max, message] of [
      [60_000, 1, "Please wait a minute before asking for another code."],
      [3_600_000, 5, "Too many codes requested. Please try again later."],
    ] as const) {
      const { count } = await db.from("otp_codes").select("id", { count: "exact", head: true })
        .eq("email", email).gte("created_at", new Date(Date.now() - ms).toISOString());
      if ((count ?? 0) >= max) return json({ error: message }, 429);
    }

    await db.from("otp_codes").update({ used: true }).eq("email", email).eq("used", false);

    const code = generateCode();
    const { data: row, error: insertError } = await db.from("otp_codes").insert({
      email,
      code_hash: await sha256(code),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    }).select("id").single();
    if (insertError || !row) {
      console.error("[send-otp] store failed:", insertError);
      return json({ error: "Failed to send code. Please try again." }, 500);
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    const res = apiKey
      ? await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: [email],
          subject: `${code} — Confirm your Mahi account`,
          html: emailHtml(code),
        }),
      })
      : null;
    if (!res?.ok) {
      console.error("[send-otp] Resend failed:", res ? await res.text() : "RESEND_API_KEY not set");
      // Don't let a failed send use up the user's per-minute allowance.
      await db.from("otp_codes").delete().eq("id", row.id);
      return json({ error: "Failed to send email. Please try again." }, 500);
    }

    return json({ sent: true });
  } catch (err) {
    console.error("[send-otp] error:", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});

function emailHtml(code: string): string {
  const digits = code.split("").map((d) =>
    `<td align="center" style="width:52px;height:68px;background:linear-gradient(135deg,#59c2d7 0%,#5B5BD6 100%);border-radius:10px;">
      <span style="font-size:34px;font-weight:800;color:#ffffff;font-family:'Courier New',monospace;line-height:68px;">${d}</span>
    </td>`
  ).join('<td style="width:8px;"></td>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirm your Mahi account</title>
</head>
<body style="margin:0;padding:0;background-color:#F0F0EB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0F0EB;padding:48px 0;">
    <tr>
      <td align="center">
        <table width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;">
          <tr>
            <td align="center" style="background:linear-gradient(135deg,#59c2d7 0%,#5B5BD6 100%);border-radius:16px 16px 0 0;padding:44px 40px 36px;">
              <span style="display:block;font-size:52px;font-weight:700;letter-spacing:14px;color:#ffffff;font-family:'Trebuchet MS','Century Gothic',Arial,sans-serif;text-transform:uppercase;">MAHI</span>
              <p style="margin:14px 0 0;font-size:18px;font-weight:600;color:#ffffff;letter-spacing:0.5px;">Welcome &mdash; you&rsquo;re almost in.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:44px 32px 36px;">
              <p style="margin:0 0 20px;font-size:16px;color:#333;line-height:1.7;">Thank you for joining Mahi. To finish setting up your account, enter this code in the app.</p>
              <p style="margin:0 0 20px;font-size:13px;font-weight:600;color:#999;letter-spacing:2px;text-transform:uppercase;">Your verification code</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>${digits}</tr>
              </table>
              <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.7;">This code is valid for <strong>10 minutes</strong>.</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#FFF8F0;border-left:3px solid #F0A500;border-radius:0 8px 8px 0;padding:16px 20px;">
                    <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#B07000;">Didn&rsquo;t request this?</p>
                    <p style="margin:0;font-size:13px;color:#888;line-height:1.6;">You can safely ignore this email. No account is created without this code.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#0F0F0D;border-radius:0 0 16px 16px;padding:28px 44px;">
              <p style="margin:0 0 4px;font-size:15px;font-weight:700;letter-spacing:6px;color:#59c2d7;text-transform:uppercase;font-family:'Trebuchet MS','Century Gothic',Arial,sans-serif;">MAHI</p>
              <p style="margin:0;font-size:11px;color:#555;">mahitechnology.com &middot; This is an automated message, please do not reply.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
