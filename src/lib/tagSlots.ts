/**
 * Tag slots (flag `tag-slots`, owner 2026-10-03): every slot of a post is filled on the tag
 * screen — a friend tagged, an in-app invite for someone on Mahi who isn't a friend yet, or a
 * link shared the moment you tap. Each slot says where it's at; the server is the source
 * (`get_tag_slots`, migration 20261003120000_tag_slots) and the screen shows your own taps at
 * once. Nothing here is kept on the phone: slots expire.
 *
 * Pure and import-free so it runs under the node-only jest harness.
 */

export type SlotKind = 'friend' | 'request' | 'link';
export type SlotState =
  | 'link_ready'
  | 'shared'
  | 'joined'
  | 'invite_sent'
  | 'accepted'
  | 'tagged'
  | 'answered'
  | 'missed'
  | 'declined'
  | 'expired'
  | 'cancelled';

/** One row of `get_tag_slots`. */
export type TagSlot = {
  challenge_id: string;
  kind: SlotKind;
  state: SlotState;
  user_id: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  token: string | null;
  code: string | null;
  url: string | null;
  expires_at: string | null;
  server_now: string;
  created_at: string;
};

/** A slot on screen: from the server, or still being made after a tap (`pending`). */
export type ScreenSlot = TagSlot & { pending?: boolean };

const STATE_TEXT: Record<SlotState, string> = {
  link_ready: 'Link ready',
  shared: 'Shared',
  joined: 'Joined',
  invite_sent: 'Invite sent',
  accepted: 'Accepted',
  tagged: 'Tagged',
  answered: 'Answered',
  missed: 'Missed',
  declined: 'Not now',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

export function slotStateText(state: SlotState): string {
  return STATE_TEXT[state];
}

/** The name under a slot: its person, or "Invite 2" for a link nobody has joined from yet. */
export function slotLabel(slot: ScreenSlot, index: number): string {
  return slot.username ? `@${slot.username}` : `Invite ${index + 1}`;
}

/**
 * Friends first (the server's rule in create_post): an empty slot may go to an invite only when
 * no friend is left to tag. `freeFriends` = friends who can be tagged now and aren't picked.
 */
export function inviteBlockedReason({
  freeFriends,
  filled,
  maxTags,
}: {
  freeFriends: number;
  filled: number;
  maxTags: number;
}): string | null {
  if (filled >= maxTags) return `All ${maxTags} filled`;
  if (freeFriends > 0) {
    return freeFriends === 1
      ? 'Tag your free friend first'
      : `Tag your ${freeFriends} free friends first`;
  }
  return null;
}

/** What tapping someone in the list does, and the note under their name. */
export function personAction(
  person: { is_friend: boolean; has_open_tag: boolean; tagged_you: boolean },
  selected: boolean
): { action: 'tag' | 'untag' | 'invite' | 'none'; note: string | null } {
  if (selected) return { action: 'untag', note: null };
  if (person.tagged_you) return { action: 'none', note: 'tagged you, can’t tag back' };
  if (person.has_open_tag) {
    return person.is_friend
      ? { action: 'none', note: 'you tagged them, free again when they post or their 48 hours end' }
      : { action: 'none', note: 'invite sent' };
  }
  return person.is_friend
    ? { action: 'tag', note: null }
    : { action: 'invite', note: 'not your friend yet' };
}

/**
 * The message that goes with a link. The code is in it too: until the invite page is live, a
 * link opens nothing and the code is how a new person gets linked to you.
 */
export function slotShareMessage(url: string, code: string): string {
  return (
    'I tagged you on Mahi. Join and you’ve got 48 hours to post your workout, then tag 3 mates.\n' +
    `${url}\nOr use code ${code} when you sign up.`
  );
}

/** A link that opens WhatsApp or Messages with the message already written. */
export function shareAppUrl(
  app: 'whatsapp' | 'messages',
  text: string,
  platform: 'ios' | 'android'
): string {
  const body = encodeURIComponent(text);
  if (app === 'whatsapp') return `whatsapp://send?text=${body}`;
  return platform === 'ios' ? `sms:&body=${body}` : `sms:?body=${body}`;
}

/**
 * Fresh server slots, plus any still being made on this phone. A read that left the server before
 * "shared" was saved still says "link ready": the share you just made wins.
 */
export function mergeSlots(server: TagSlot[], local: ScreenSlot[]): ScreenSlot[] {
  const known = new Set(server.map((s) => s.challenge_id));
  const sharedHere = new Set(local.filter((s) => s.state === 'shared').map((s) => s.challenge_id));
  return [
    ...server.map((s) =>
      s.state === 'link_ready' && sharedHere.has(s.challenge_id)
        ? { ...s, state: 'shared' as const }
        : s
    ),
    ...local.filter((s) => s.pending && !known.has(s.challenge_id)),
  ];
}

/** A server refusal, in plain words. */
export function slotErrorText(message: string): string {
  if (message.includes('too many open invites'))
    return 'Too many invites waiting. Remove one first.';
  if (message.includes('already friends')) return 'You’re friends already. Tag them instead.';
  if (message.includes('already invited')) return 'Invite already sent.';
  if (message.includes('cannot invite that person')) return 'You can’t invite them.';
  if (message.includes('no longer open')) return 'That invite has ended.';
  if (message.includes('friends first')) return 'Tag your free friends first.';
  if (message.includes('invite links are off')) return 'Invites are switched off right now.';
  return 'Couldn’t do that. Try again.';
}

/** How long an in-app invite stays open (app_config.invite_ttl). */
const INVITE_OPEN_MS = 7 * 24 * 60 * 60 * 1000;

/** Where an in-app invite is at, for the person invited (their notifications list). */
export function tagInviteState(
  row: {
    requested_at: string | null;
    accepted_at: string | null;
    declined_at: string | null;
    cancelled_at: string | null;
  },
  now: number
): 'open' | 'accepted' | 'declined' | 'ended' {
  if (row.accepted_at) return 'accepted';
  if (row.declined_at) return 'declined';
  if (row.cancelled_at) return 'ended';
  if (!row.requested_at || Date.parse(row.requested_at) + INVITE_OPEN_MS < now) return 'ended';
  return 'open';
}

/**
 * What to say when the server refuses a post, and whether to give the photos back so it can be
 * posted again (review, 2026-10-05: a refusal used to throw them away). Only "no tag to answer"
 * can't be fixed from the preview.
 */
export function postRefusal(message: string): {
  text: string;
  keepPhotos: boolean;
  report: boolean;
} {
  if (message.includes('reactive posting')) {
    return { text: 'No tags to answer', keepPhotos: false, report: false };
  }
  if (message.includes('friends first')) {
    return {
      text: 'Tag your free friends first. Invites only fill the slots friends can’t.',
      keepPhotos: true,
      report: false,
    };
  }
  if (message.includes('no longer open')) {
    return {
      text: 'One of your invites has ended. Check your tags and post again.',
      keepPhotos: true,
      report: false,
    };
  }
  if (message.includes('tag')) {
    return {
      text: 'Your tags changed. Check them and post again.',
      keepPhotos: true,
      report: false,
    };
  }
  return {
    text: 'Couldn’t post. Your photos are still here, try again.',
    keepPhotos: true,
    report: true,
  };
}
