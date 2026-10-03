/**
 * Tag-loop analytics.
 *
 * Every event here is sent *after the server confirms* the thing happened, so a failed post or
 * a refused claim never shows up as one. These are behaviour numbers, for funnels and drop-off.
 * The numbers of record — how many tags were answered, how many invites joined — come from the
 * `stats` views on the database, which can't be lost, duplicated, or sent twice from two phones.
 *
 * Keeping every key in one typed map stops the names drifting apart across call sites, the way
 * `FEATURE_FLAGS` does for flags. See docs/tag-loop-plan.md, Phase 8.
 */
import { posthog } from '@/lib/posthog';

export type TagLoopEvents = {
  /** A post went out with its slots filled. One per post, not one per tag. */
  tag_sent: { post_id: string; tag_count: number; invite_count: number };
  /** A post answered someone's tag. One per tag answered. */
  tag_answered: { tagger_id: string; seconds: number };
  /**
   * A deadline ran out — read off the notification the server sends to the tagger, as it
   * arrives, so once per missed tag; `stats.tags_daily` has the number of record.
   */
  tag_missed: { challenge_id: string | null };
  /** The person who missed the tag lost their Mahi points — their side of the same miss. */
  streak_lost: { challenge_id: string | null };
  /** An invite link actually reached the share sheet and was sent (`via`: where, on the tag screen). */
  invite_shared: { via?: 'whatsapp' | 'messages' | 'more' };
  /** An in-app invite went to someone on Mahi who isn't a friend yet (flag `tag-slots`). */
  tag_invite_sent: Record<string, never>;
  /** Someone answered an in-app invite. */
  tag_invite_answered: { accepted: boolean };
  /** Someone joined from a link and their 48 hours started. */
  invite_claimed: { inviter_id: string };
  /** The feed went from locked to open for this user. */
  feed_unlocked: Record<string, never>;
  /** A push was tapped. */
  push_opened: { route: string };
  /** The notifications page was answered; `granted` is what the phone's own question got. */
  push_primer_answered: { choice: 'allow' | 'not_now'; granted: boolean };
  /** The camera's "turn on notifications" line was tapped ('settings' or 'ask') or dismissed. */
  push_nudge: { action: 'settings' | 'ask' | 'dismiss' };
};

/** Send one tag-loop event. Never throws: analytics must not break what the user just did. */
export function track<K extends keyof TagLoopEvents>(event: K, props: TagLoopEvents[K]): void {
  try {
    posthog.capture(event, props);
  } catch {
    // An analytics SDK that isn't ready is not worth a crash.
  }
}
