/**
 * The share sheet (owner, 2026-10-10: "This is what a share sheet should look like for Mahi, it's
 * how Instagram's look"): search, a grid of your friends to send a post to in your Mahi chat, and
 * a row of round buttons along the bottom (Copy link, WhatsApp, Messages, Snapchat, Instagram,
 * Share to…). "Invite a mate" uses the same sheet with a title and the row only.
 *
 * Pure rules (type imports only) so they run under the node-only jest harness. Friends are never
 * kept on the phone: the sheet reads them fresh each time it opens.
 */
import { SHARE_TARGETS, type ShareTarget } from './tagSlots';

/** The most people one share goes to (the server's rule: `share_post` takes 1 to 10). */
export const MAX_SHARE_RECIPIENTS = 10;
/** The longest note that goes with a post (the server's rule). */
export const MAX_SHARE_NOTE = 2000;
/** Friends are read a page at a time, up to this many, so search covers all of them. */
export const SHARE_FRIENDS_PAGE = 100;
export const SHARE_FRIENDS_MAX = 500;

export type ShareSheetMode = 'post' | 'invite';

/** A round button on the bottom row: Copy link, or one of the tag screen's share targets. */
export type ShareSheetTarget = 'copy' | ShareTarget;

/** What the sheet shows per use: a post gets search and the friends grid; an invite doesn't. */
export function shareSheetParts(mode: ShareSheetMode): { title: string; friends: boolean } {
  return mode === 'post'
    ? { title: 'Share', friends: true }
    : { title: 'Invite a mate', friends: false };
}

/** The sheet spells the apps out; the tag screen's small pills keep their short names. */
const TARGET_LABEL: Record<ShareTarget, string> = {
  whatsapp: 'WhatsApp',
  messages: 'Messages',
  snapchat: 'Snapchat',
  instagram: 'Instagram',
  more: 'Share to…',
};

/**
 * The bottom row, left to right. Copy link only on a build that can copy (`canCopyLink`). Snapchat
 * and Instagram open the phone's share sheet until a native build adds their kits (decision #156).
 * No story button.
 */
export function shareTargets(canCopy: boolean): { target: ShareSheetTarget; label: string }[] {
  const apps = SHARE_TARGETS.map(({ target }) => ({ target, label: TARGET_LABEL[target] }));
  return canCopy ? [{ target: 'copy', label: 'Copy link' }, ...apps] : apps;
}

/**
 * A tap on a friend: picks them, or lets them go. At the most (`full`), a new pick is refused and
 * the picks stay as they are. Never changes its input.
 */
export function toggleRecipient(
  selected: readonly string[],
  id: string,
  max: number = MAX_SHARE_RECIPIENTS
): { selected: string[]; full: boolean } {
  if (selected.includes(id)) return { selected: selected.filter((s) => s !== id), full: false };
  if (selected.length >= max) return { selected: [...selected], full: true };
  return { selected: [...selected, id], full: false };
}

/** The friends list is live: someone who stopped being a friend while it is open leaves the picks. */
export function keepFriends(selected: readonly string[], friends: { id: string }[]): string[] {
  const ids = new Set(friends.map((f) => f.id));
  return selected.filter((id) => ids.has(id));
}

type FriendNames = {
  username: string;
  display_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

/** The name under a friend's photo. */
export function friendLabel(friend: FriendNames): string {
  return friend.display_name?.trim() || friend.first_name?.trim() || friend.username;
}

/** Search: friends whose name or username holds what was typed (any case; a typed @ is fine). */
export function filterFriends<T extends FriendNames>(friends: T[], query: string): T[] {
  const q = query.trim().replace(/^@/, '').toLowerCase();
  if (!q) return friends;
  return friends.filter((f) =>
    [f.username, f.display_name, [f.first_name, f.last_name].filter(Boolean).join(' ')].some(
      (name) => !!name && name.toLowerCase().includes(q)
    )
  );
}

/**
 * `share_post`'s answer, as ids: who it went to, and who it couldn't be sent to (blocked, a closed
 * chat, a request still waiting). Missing fields read as empty, so an older server never crashes.
 */
export function readShareResult(raw: unknown): { sent: string[]; skipped: string[] } {
  const answer = (raw ?? {}) as { sent?: unknown; skipped?: unknown };
  const sent = Array.isArray(answer.sent) ? answer.sent : [];
  const skipped = Array.isArray(answer.skipped) ? answer.skipped : [];
  return {
    sent: sent.flatMap((row: { user_id?: unknown } | null) =>
      typeof row?.user_id === 'string' ? [row.user_id] : []
    ),
    skipped: skipped.filter((id): id is string => typeof id === 'string'),
  };
}

/** The toast once the server has answered. */
export function shareResultToast(sent: number, skipped: number): string {
  const could = sent > 0 ? `Sent to ${sent} ${sent === 1 ? 'friend' : 'friends'}` : '';
  const couldnt = skipped > 0 ? `Couldn’t send to ${skipped}.` : '';
  if (could && couldnt) return `${could}. ${couldnt}`;
  return could || couldnt;
}

const SEND_FAILED = 'Couldn’t send. Try again.';

/** A failed send in plain words. A post you can no longer see can't be fixed by trying again. */
export function shareErrorText(message: string): string {
  if (message.includes('post not found')) return 'You can’t share this post.';
  return SEND_FAILED;
}

/** True when the server refused by its rules (not a bug to report). */
export function isShareRefusal(message: string): boolean {
  return shareErrorText(message) !== SEND_FAILED;
}
