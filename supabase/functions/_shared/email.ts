// The Mahi code email (sign-up and password reset share one look) and sending it via Resend.
// deno test supabase/functions/_shared/email_test.ts

import {
  BORDER_WIDTH,
  COLORS,
  FONT_LINK,
  FONT_SIZE,
  FONT_STACK,
  FONT_WEIGHT,
  LINE_HEIGHT,
  RADIUS,
  SIZE,
  SPACE,
  TRACKING,
} from "./emailTokens.ts";

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

// Every colour, size and font below comes from emailTokens.ts, built from the app's tokens.
// scripts/email-tokens.test.mjs (pnpm test:scripts) fails on any value typed here by hand.
export function codeEmailHtml(code: string, words: CodeEmailWords): string {
  // The brand gradient, with plain accent for mail apps that ignore gradients.
  const brand =
    `background-color:${COLORS.accent};background:linear-gradient(135deg,${COLORS.accent} 0%,${COLORS.iosBlue} 100%);`;
  const digits = code.split("").map((d) =>
    `<td align="center" style="width:${SIZE.z52}px;height:${SIZE.z72}px;${brand}border-radius:${RADIUS.r10}px;">
      <span style="font-size:${FONT_SIZE.f32}px;font-weight:${FONT_WEIGHT.bold};color:${COLORS.white};font-family:${FONT_STACK};">${d}</span>
    </td>`
  ).join(`<td style="width:${SIZE.z8}px;"></td>`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${FONT_LINK}" rel="stylesheet" />
  <title>${words.title}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.surfaceLight2};font-family:${FONT_STACK};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.surfaceLight2};padding:${SPACE.s48}px 0;font-family:${FONT_STACK};">
    <tr>
      <td align="center">
        <table width="${SIZE.z420}" cellpadding="0" cellspacing="0" style="max-width:${SIZE.z420}px;width:100%;">
          <tr>
            <td align="center" style="${brand}border-radius:${RADIUS.r16}px ${RADIUS.r16}px 0 0;padding:${SPACE.s40}px ${SPACE.s40}px ${SPACE.s36}px;">
              <span style="display:block;font-size:${FONT_SIZE.f56}px;font-weight:${FONT_WEIGHT.bold};letter-spacing:${TRACKING.t10}px;color:${COLORS.white};font-family:${FONT_STACK};">MAHI</span>
              <p style="margin:${SPACE.s14}px 0 0;font-size:${FONT_SIZE.f18}px;font-weight:${FONT_WEIGHT.semiBold};color:${COLORS.white};letter-spacing:${TRACKING.t0_5}px;">${words.heading}</p>
            </td>
          </tr>
          <tr>
            <td style="background:${COLORS.white};padding:${SPACE.s40}px ${SPACE.s32}px ${SPACE.s36}px;">
              <p style="margin:0 0 ${SPACE.s20}px;font-size:${FONT_SIZE.f16}px;color:${COLORS.iosGreyDark};line-height:${LINE_HEIGHT.l28}px;">${words.intro}</p>
              <p style="margin:0 0 ${SPACE.s20}px;font-size:${FONT_SIZE.f15}px;font-weight:${FONT_WEIGHT.semiBold};color:${COLORS.grey999};">Your code</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 auto ${SPACE.s28}px;">
                <tr>${digits}</tr>
              </table>
              <p style="margin:0 0 ${SPACE.s28}px;font-size:${FONT_SIZE.f15}px;color:${COLORS.iosGreyDark};line-height:${LINE_HEIGHT.l24}px;">This code is valid for <strong>10 minutes</strong>.</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:${COLORS.paper};border-left:${BORDER_WIDTH.w2}px solid ${COLORS.amber};border-radius:0 ${RADIUS.r8}px ${RADIUS.r8}px 0;padding:${SPACE.s16}px ${SPACE.s20}px;">
                    <p style="margin:0 0 ${SPACE.s4}px;font-size:${FONT_SIZE.f13}px;font-weight:${FONT_WEIGHT.bold};color:${COLORS.amberDeep};">Didn&rsquo;t request this?</p>
                    <p style="margin:0;font-size:${FONT_SIZE.f13}px;color:${COLORS.grey888};line-height:${LINE_HEIGHT.l20}px;">${words.ignoreNote}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:${COLORS.inkDeep};border-radius:0 0 ${RADIUS.r16}px ${RADIUS.r16}px;padding:${SPACE.s28}px ${SPACE.s40}px;">
              <p style="margin:0 0 ${SPACE.s4}px;font-size:${FONT_SIZE.f15}px;font-weight:${FONT_WEIGHT.bold};letter-spacing:${TRACKING.t5}px;color:${COLORS.accent};font-family:${FONT_STACK};">MAHI</p>
              <p style="margin:0;font-size:${FONT_SIZE.f11}px;color:${COLORS.grey888};">mahitechnology.com &middot; This is an automated message, please do not reply.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
