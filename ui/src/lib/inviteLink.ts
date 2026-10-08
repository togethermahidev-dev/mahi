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
 * they post. An invite for a mate (`tag` false: no tag behind it) only makes you follow each
 * other. `tag` is missing from an older server: read as a tag, as before.
 */
export function claimedText({
  inviter,
  expiresAt,
  tag,
  followStatus,
}: {
  inviter: string;
  expiresAt: string | null;
  tag?: boolean;
  /** `requested`: a general invite from a private account — they follow you, yours waits. */
  followStatus?: 'following' | 'requested';
}): string {
  if (followStatus === 'requested') {
    return `@${inviter} follows you now. They approve followers, so your follow is a request.`;
  }
  if (tag === false) return `You and @${inviter} follow each other now.`;
  return expiresAt
    ? `You and @${inviter} follow each other now. You have 48 hours to answer their tag.`
    : `You and @${inviter} follow each other now. Their tag starts when they post.`;
}

/**
 * The line under "@sam invited you" on the sign-up screen: the automatic follow both ways is said
 * before joining, and a tag only when one comes with the link (`tag` missing: an older server).
 */
export function invitePreviewLine({
  open,
  tag,
  inviter,
  followRequest,
}: {
  open: boolean;
  tag?: boolean;
  inviter?: string;
  /** The server's `follow_request`: a mate invite from a private account. */
  followRequest?: boolean;
}): string {
  if (!open) return 'That invite has already been used, but you can still sign up.';
  if (tag === false && followRequest && inviter) return privateInviteLine(inviter);
  const follow = 'Join and you’ll automatically follow each other.';
  return tag === false
    ? follow
    : `${follow} Their tag starts when you join — you’ll have 48 hours to post back.`;
}

/**
 * A general invite ("invite a mate", no tag) from a private account: the inviter follows you,
 * and your follow is a request they approve (owner, 2026-10-08). A tag invite on a post still
 * makes you follow each other straight away.
 */
function privateInviteLine(inviter: string): string {
  return `@${inviter} approves followers — your follow will be a request.`;
}

/**
 * The line under "@sam invited you" on the sheet a signed-in person sees when an invite link
 * arrives: the same promise as the sign-up card, said before Accept.
 */
export function inviteAcceptLine({
  tag,
  inviter,
  followRequest,
}: {
  tag?: boolean;
  inviter?: string;
  /** The server's `follow_request`: a mate invite from a private account. */
  followRequest?: boolean;
}): string {
  if (tag === false && followRequest && inviter) return privateInviteLine(inviter);
  const follow = 'Accept and you’ll automatically follow each other.';
  return tag === false
    ? follow
    : `${follow} Their tag starts when you accept — you’ll have 48 hours to post back.`;
}

/**
 * What to do with an invite that is waiting while someone is signed in (`ready`: the account's
 * profile exists). `ask`: show the sheet. `used`: it can't be taken, say so and let it go.
 * `unreadable`: who sent it couldn't be found, let it go. `wait`: nothing yet — no invite, the
 * lookup is still out, a claim is on its way, or the person has already said yes.
 */
export type InviteAsk = 'ask' | 'used' | 'unreadable' | 'wait';

export function inviteAsk(s: {
  ready: boolean;
  pendingToken: string | null;
  confirmedToken: string | null;
  previewChecked: boolean;
  preview: { open: boolean } | null;
  isClaiming: boolean;
}): InviteAsk {
  if (!s.ready || !s.pendingToken || s.isClaiming) return 'wait';
  if (s.confirmedToken === s.pendingToken || !s.previewChecked) return 'wait';
  if (!s.preview) return 'unreadable';
  return s.preview.open ? 'ask' : 'used';
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

/**
 * Whether to try a kept invite again now: Mahi has come back to the front, someone is signed in,
 * an invite is still waiting (a dropped connection kept it), the person said yes to that invite
 * and no claim is on its way.
 */
export function claimOnReturn(
  appState: string,
  s: {
    signedIn: boolean;
    pendingToken: string | null;
    confirmedToken: string | null;
    isClaiming: boolean;
  }
): boolean {
  return (
    appState === 'active' &&
    s.signedIn &&
    !!s.pendingToken &&
    s.confirmedToken === s.pendingToken &&
    !s.isClaiming
  );
}
