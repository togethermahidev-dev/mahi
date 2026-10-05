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

/**
 * What was typed or pasted into the sign-up screen's invite field: a code (forgiving spaces,
 * dashes and case) or a whole invite link. Null when it is neither.
 */
export function typedInvite(input: string | null | undefined): string | null {
  return parseInviteLink(input) ?? normaliseInviteCode(input);
}

/**
 * The note after joining from an invite. A slot that is already on a post starts its 48 hours
 * now; one shared before posting (`expiresAt` null) makes you friends, and its tag starts when
 * they post.
 */
export function claimedText({
  inviter,
  expiresAt,
}: {
  inviter: string;
  expiresAt: string | null;
}): string {
  return expiresAt
    ? `@${inviter} tagged you — you have 48 hours to post`
    : `You're friends with @${inviter}. Their tag starts when they post.`;
}

/** Why an invite couldn't be used, in plain words (the server's refusal in `message`). */
export function claimFailText(message: string, inviter: string | null): string {
  if (message.includes('new accounts')) {
    return `That invite is for people new to Mahi. Ask ${inviter ? `@${inviter}` : 'them'} to invite you in the app.`;
  }
  if (message.includes('been used')) return 'That invite has already been used.';
  if (message.includes('expired')) return 'That invite has expired.';
  if (message.includes('your own')) return "That's your own invite.";
  if (message.includes('not valid')) return "That invite code isn't right.";
  return "Couldn't use that invite. Try again.";
}
