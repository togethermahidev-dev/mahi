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
 * Mahi's App Store id (the number in its apps.apple.com link). Null until the app has a listing:
 * Apple's banner needs a real one, so until then the invite page shows no App Clip banner (the
 * App Clip card still comes from the App Store Connect experience). To-do in web/DEPLOY.md.
 */
export const APP_STORE_ID: string | null = null;

/** The App Clip (ui/clip/MahiClip). */
const APP_CLIP_BUNDLE_ID = 'com.mahi.app.Clip';

/**
 * The `apple-itunes-app` meta tag on the invite page: Safari's banner that opens the App Clip
 * card. Null without an App Store id.
 */
export function appClipBanner(appStoreId: string | null): string | null {
  if (!appStoreId) return null;
  return `app-id=${appStoreId}, app-clip-bundle-id=${APP_CLIP_BUNDLE_ID}, app-clip-display=card`;
}

/**
 * The project's public address and publishable key: the same public values the app ships with.
 * They only allow what a signed-out person may do.
 */
const SUPABASE_URL = 'https://pzepodsppqtvptzmwxzs.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_2sNfUHdGuL1NQ_E5lC76XQ__pduUTG3';

/** PostHog's public project key (EU), the same one the app sends events with. */
const POSTHOG_HOST = 'https://eu.i.posthog.com';
const POSTHOG_PROJECT_KEY = 'phc_h8QH8xZj7AfoNBLR0gOOZZowY9bHePWxzF4FIaLbz8m';

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

/**
 * What get_invite_preview returns; null for a link it doesn't know. `tag`: a tag comes with the
 * link (false: an invite for a mate; missing from an older server).
 */
export type InvitePreview = {
  username: string;
  display_name: string | null;
  open: boolean;
  tag?: boolean;
} | null;

/** What get_invite_preview sent, as the page uses it; keeps `tag` so a tag link says "tagged you". */
export function parseInvitePreview(value: unknown): InvitePreview {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.username !== 'string') return null;
  return {
    username: v.username,
    display_name: typeof v.display_name === 'string' ? v.display_name : null,
    open: v.open === true,
    ...(typeof v.tag === 'boolean' ? { tag: v.tag } : {}),
  };
}

/** A link that still works and has a tag behind it (usability walkthrough, 2026-10-07). */
function isTagLink(preview: InvitePreview): boolean {
  return !!preview && preview.open && preview.tag === true;
}

export function inviteHeadline(preview: InvitePreview): string {
  if (!preview) return 'A friend invited you to Mahi';
  return isTagLink(preview)
    ? `@${preview.username} tagged you on Mahi`
    : `@${preview.username} invited you to Mahi`;
}

/** The line under the headline: the 48 hours for a tag link, else that you'll follow each other. */
export function inviteLine(preview: InvitePreview): string {
  return isTagLink(preview)
    ? 'Join and you’ll have 48 hours to post any workout back. You’ll follow each other and keep each other going.'
    : 'When you join, you’ll automatically follow each other.';
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

/**
 * Counts an opened link page in PostHog (`invite_page_opened` / `post_page_opened`): the first
 * step of the invite funnel. No person is made (`$process_person_profile: false`) and the token
 * is never sent, so visitors don't inflate the people counts. `id` is new for each page load.
 */
export function pageOpenedEvent(
  kind: 'invite' | 'post',
  userAgent: string,
  id: string
): { url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } } {
  const platform = /android/i.test(userAgent)
    ? 'android'
    : /iphone|ipad|ipod/i.test(userAgent)
      ? 'ios'
      : 'other';
  return {
    url: `${POSTHOG_HOST}/i/v0/e/`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_PROJECT_KEY,
        event: `${kind}_page_opened`,
        distinct_id: id,
        properties: { platform, $process_person_profile: false },
      }),
    },
  };
}
