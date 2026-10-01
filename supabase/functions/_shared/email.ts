// The Mahi code email (sign-up and password reset share one look) and sending it via Resend.
// deno test supabase/functions/_shared/email_test.ts

const FROM_ADDRESS = "Mahi <noreply@mahitechnology.com>";

export interface CodeEmailWords {
  title: string; // <title> and the subject after the code
  heading: string; // white line under the MAHI wordmark
  intro: string; // first paragraph
  ignoreNote: string; // under "Didn't request this?"
}

/** Sends one email. False (and logs why) when Resend is not set up or refuses it. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("[email] RESEND_API_KEY not set");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
  });
  if (!res.ok) console.error("[email] Resend failed:", await res.text());
  return res.ok;
}

export function codeEmailHtml(code: string, words: CodeEmailWords): string {
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
  <title>${words.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#F0F0EB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0F0EB;padding:48px 0;">
    <tr>
      <td align="center">
        <table width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;">
          <tr>
            <td align="center" style="background:linear-gradient(135deg,#59c2d7 0%,#5B5BD6 100%);border-radius:16px 16px 0 0;padding:44px 40px 36px;">
              <span style="display:block;font-size:52px;font-weight:700;letter-spacing:14px;color:#ffffff;font-family:'Trebuchet MS','Century Gothic',Arial,sans-serif;text-transform:uppercase;">MAHI</span>
              <p style="margin:14px 0 0;font-size:18px;font-weight:600;color:#ffffff;letter-spacing:0.5px;">${words.heading}</p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:44px 32px 36px;">
              <p style="margin:0 0 20px;font-size:16px;color:#333;line-height:1.7;">${words.intro}</p>
              <p style="margin:0 0 20px;font-size:15px;font-weight:600;color:#999;">Your code</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>${digits}</tr>
              </table>
              <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.7;">This code is valid for <strong>10 minutes</strong>.</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#FFF8F0;border-left:3px solid #F0A500;border-radius:0 8px 8px 0;padding:16px 20px;">
                    <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#B07000;">Didn&rsquo;t request this?</p>
                    <p style="margin:0;font-size:13px;color:#888;line-height:1.6;">${words.ignoreNote}</p>
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
