/**
 * Invite links.
 *
 * A link looks like `https://togethermahi.com/i/<token>`; the app's own scheme,
 * `mahi://i/<token>`, opens the same thing when Mahi is already installed. The landing page
 * also shows a 6-character code to read out or type in, for the trip through an app-store
 * install where the link itself doesn't survive.
 *
 * The domain is spelled here because the native link configuration in app.config.js spells it
 * too — both are build-time, unlike the server's `app_config.invite_base_url`.
 *
 * Pure and import-free so it runs under the node-only jest harness.
 */

const WEB_LINK = /^https?:\/\/(?:www\.)?togethermahi\.com\/i\/([^/?#]+)/i;
const APP_LINK = /^mahi:\/\/\/?i\/([^/?#]+)/i;
const TOKEN = /^[0-9a-f]{32}$/i;
/** The code alphabet has no 0, O, 1 or I — they get misread off a screen. */
const CODE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

/**
 * A code as the server stores it, from whatever someone typed: spaces, dashes and lower
 * case are all forgiven. Null when it isn't a code.
 */
export function normaliseInviteCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input.trim().toUpperCase().replace(/[\s-]/g, '');
  return CODE.test(cleaned) ? cleaned : null;
}

/**
 * The token or code an invite link carries, or null when the URL isn't one of ours.
 * Both go to the same place: `claim_invite` accepts either.
 */
export function parseInviteLink(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const match = WEB_LINK.exec(trimmed) ?? APP_LINK.exec(trimmed);
  if (!match) return null;

  let raw: string;
  try {
    raw = decodeURIComponent(match[1]);
  } catch {
    raw = match[1];
  }
  if (TOKEN.test(raw)) return raw.toLowerCase();
  return normaliseInviteCode(raw);
}
