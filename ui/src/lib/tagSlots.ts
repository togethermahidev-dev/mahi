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
  shared: 'Sent',
  joined: 'Joined · following',
  invite_sent: 'Request sent',
  accepted: 'Accepted · following',
  tagged: 'Tagged',
  answered: 'Answered',
  missed: 'Missed',
  declined: 'Not now',
  expired: 'Ended',
  cancelled: 'Ended',
};

export function slotStateText(state: SlotState): string {
  return STATE_TEXT[state];
}

/** The name under a slot: its person, or "Link 2" for a link nobody has joined from yet. */
export function slotLabel(slot: ScreenSlot, index: number): string {
  return slot.username ? `@${slot.username}` : `Link ${index + 1}`;
}

/**
 * The preview's Post button: "Post" when every tag is filled, else what's still missing ("Tag 3
 * mates to post", "Tag 1 more mate to post"). `anyTagged`: a friend, invite or slot is in.
 */
export function postButtonLabel(missing: number, anyTagged: boolean): string {
  if (missing <= 0) return 'Post';
  const mates = missing === 1 ? 'mate' : 'mates';
  return anyTagged ? `Tag ${missing} more ${mates} to post` : `Tag ${missing} ${mates} to post`;
}

export function inviteBlockedReason({
  filled,
  maxTags,
}: {
  filled: number;
  maxTags: number;
}): string | null {
  if (filled >= maxTags) return `All ${maxTags} tags used`;
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
      ? { action: 'none', note: 'you tagged them, open until they answer' }
      : { action: 'none', note: 'request sent' };
  }
  return person.is_friend
    ? { action: 'tag', note: null }
    : { action: 'invite', note: 'accepting means you’ll follow each other' };
}

/** The low-pressure message that goes with an invite link. */
export function slotShareMessage(url: string, _code: string): string {
  return `I tagged you on Mahi. Join me for a workout — we’ll automatically follow each other when you join.\n${url}`;
}

/** The message with an invite for a mate (no tag behind it: nothing to answer). */
export function mateInviteMessage(url: string): string {
  return `Join me on Mahi. We’ll automatically follow each other when you join.\n${url}`;
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

const SLOT_FALLBACK = 'Couldn’t do that. Try again.';

/** A server refusal, in plain words. */
export function slotErrorText(message: string): string {
  if (message.includes('too many open invites'))
    return 'Too many links and tag requests waiting. Take one back first.';
  if (message.includes('already friends')) return 'You’re friends already. Tag them instead.';
  if (message.includes('already invited')) return 'Tag request already sent.';
  if (message.includes('cannot invite that person')) return 'You can’t send them a tag request.';
  if (message.includes('no longer open')) return 'That link has ended.';
  if (message.includes('friends first')) return 'Tag your friends first.';
  if (message.includes('invite links are off')) return 'Links are off right now.';
  return SLOT_FALLBACK;
}

/** A refusal of an invite for a mate, in plain words (these can't be taken back, only used or run out). */
export function mateInviteErrorText(message: string): string {
  if (message.includes('too many open invites'))
    return 'Too many invites waiting. Try again when a mate joins.';
  return slotErrorText(message);
}

/** True when a tag rule said no (a known refusal), so it isn't reported as a bug. */
export function isSlotRefusal(message: string): boolean {
  return slotErrorText(message) !== SLOT_FALLBACK;
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
 * What to say when a post fails, whether to give the photos back so it can be posted again
 * (review, 2026-10-05: a refusal used to throw them away), and whether the server truly refused
 * it. Only a refusal (`refused`) means no post exists, so only then may the uploads be removed.
 * Anything else (a dropped connection) may have posted with the reply lost: the uploads stay and
 * the retry reuses the same post id, which the server answers with that same post. Only "no tag
 * to answer" can't be fixed from the preview.
 */
export function postRefusal(message: string): {
  text: string;
  keepPhotos: boolean;
  refused: boolean;
  report: boolean;
} {
  if (message.includes('reactive posting')) {
    return {
      text: 'Your tag has ended, so this can’t be posted. You can post again when a friend tags you.',
      keepPhotos: false,
      refused: true,
      report: false,
    };
  }
  if (message.includes('friends first')) {
    return {
      text: 'Tag your friends first. A link only fills a tag your friends can’t.',
      keepPhotos: true,
      refused: true,
      report: false,
    };
  }
  if (message.includes('no longer open')) {
    return {
      text: 'A link or tag request has ended. Check your tags and post again.',
      keepPhotos: true,
      refused: true,
      report: false,
    };
  }
  if (message.includes('tag')) {
    return {
      text: 'Your tags changed. Check them and post again.',
      keepPhotos: true,
      refused: true,
      report: false,
    };
  }
  return {
    text: 'Couldn’t post. Your photos are still here. Try again.',
    keepPhotos: true,
    refused: false,
    report: true,
  };
}
