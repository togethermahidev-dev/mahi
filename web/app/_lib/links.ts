/**
 * Invite links (/i/<token>) and post links (/p/<id>) on togethermahi.com.
 *
 * On an iPhone with Mahi installed these open the app straight away (Universal Links, from
 * public/.well-known/apple-app-site-association) and the pages below are never seen. Everyone
 * else gets a fallback page. The site is a static export, so Netlify serves /i/index.html and
 * /p/index.html for every token and id (netlify.toml); the page reads the link from the address.
 *
 * Import-free so the node tests can load it (scripts/links.test.mjs). Reads like the app's own
 * ui/src/lib/inviteLink.ts.
 */

/**
 * Not the real listing yet: Mahi has no App Store or Google Play page. These search the stores
 * until it does — swap in the listing links when they exist.
 */
const APP_STORE_URL = 'https://apps.apple.com/gb/search?term=Mahi%20fitness';
const PLAY_STORE_URL = 'https://play.google.com/store/search?q=Mahi%20fitness&c=apps';

const SITE = 'https://togethermahi.com';

/**
 * The project's public address and publishable key: the same public values the app ships with.
 * They only allow what a signed-out person may do.
 */
const SUPABASE_URL = 'https://pzepodsppqtvptzmwxzs.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_2sNfUHdGuL1NQ_E5lC76XQ__pduUTG3';

const TOKEN = /^[0-9a-f]{32}$/i;
/** The code alphabet has no 0, O, 1 or I. */
const CODE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

function segment(pathname: string, prefix: 'i' | 'p'): string | null {
  const match = new RegExp(`^/${prefix}/([^/?#]+)/?$`).exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** The token (or 6-character code) in an invite link's path, or null when it isn't one. */
export function inviteFromPath(pathname: string): string | null {
  const raw = segment(pathname, 'i');
  if (!raw) return null;
  if (TOKEN.test(raw)) return raw.toLowerCase();
  const code = raw.trim().toUpperCase().replace(/[\s-]/g, '');
  return CODE.test(code) ? code : null;
}

/** The post id in a post link's path, or null. */
export function postIdFromPath(pathname: string): string | null {
  return segment(pathname, 'p');
}

/** Opens Mahi when it's installed (its own scheme). */
export function appInviteLink(invite: string): string {
  return `mahi://i/${encodeURIComponent(invite)}`;
}

export function appPostLink(postId: string): string {
  return `mahi://p/${encodeURIComponent(postId)}`;
}

/** The invite link to copy: the sign-up screen takes a whole link as well as a code. */
export function webInviteLink(invite: string): string {
  return `${SITE}/i/${encodeURIComponent(invite)}`;
}

/** What get_invite_preview returns; null for a link it doesn't know. */
export type InvitePreview = { username: string; display_name: string | null; open: boolean } | null;

export function inviteHeadline(preview: InvitePreview): string {
  return preview ? `@${preview.username} invited you to Mahi` : 'A mate invited you to Mahi';
}

/** Who sent the invite: a read anyone may make before signing in (the app's landing uses it too). */
export function invitePreviewRequest(invite: string): {
  url: string;
  init: { method: 'POST'; headers: Record<string, string>; body: string };
} {
  return {
    url: `${SUPABASE_URL}/rest/v1/rpc/get_invite_preview`,
    init: {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: invite }),
    },
  };
}

/** The store for this phone: Google Play on Android, the App Store everywhere else. */
export function storeFor(userAgent: string): { name: string; url: string } {
  return /android/i.test(userAgent)
    ? { name: 'Google Play', url: PLAY_STORE_URL }
    : { name: 'the App Store', url: APP_STORE_URL };
}
