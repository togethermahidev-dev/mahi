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
import { APP_BUILD } from '@/lib/appBuild';
import { OTA_NUMBER } from '@/constants/ota';
import { identityStep } from '@/lib/analyticsIdentity';

export type TagLoopEvents = {
  /**
   * A post was saved, with its slots filled: the "post created" event. One per post, not one
   * per tag. `replayed` when the server handed back a post this phone had already made (a retry
   * after a dropped answer) — count unique `post_id`s and it can never be counted twice.
   */
  tag_sent: { post_id: string; tag_count: number; invite_count: number; replayed: boolean };
  /** A post answered someone's tag. One per tag answered; `post_id` is the answering post. */
  tag_answered: { tagger_id: string; seconds: number; post_id: string; replayed: boolean };
  /**
   * A deadline ran out — read off the notification the server sends to the tagger, as it
   * arrives, so once per missed tag; `stats.tags_daily` has the number of record.
   */
  tag_missed: { challenge_id: string | null };
  /** The person who missed the tag lost their Mahi points — their side of the same miss. */
  streak_lost: { challenge_id: string | null };
  /** An invite link actually reached the share sheet and was sent (`via`: where, on the tag screen). */
  invite_shared: { via?: 'whatsapp' | 'messages' | 'more'; challenge_id?: string };
  /** An in-app invite went to someone on Mahi who isn't a friend yet (flag `tag-slots`). */
  tag_invite_sent: { challenge_id: string };
  /** Someone answered an in-app invite. */
  tag_invite_answered: { challenge_id: string; accepted: boolean };
  /** Mahi opened from an invite link (`cold`: the link started the app). Counts link opens. */
  invite_link_opened: { cold: boolean; signed_in: boolean };
  /** Someone joined from a link: you follow each other, and a tag starts if one came with it. */
  invite_claimed: { inviter_id: string };
  /** The feed went from locked to open for this user. */
  feed_unlocked: Record<string, never>;
  /** A push was tapped. */
  push_opened: { route: string };
  /** The notifications page was answered; `granted` is what the phone's own question got. */
  push_primer_answered: { choice: 'allow' | 'not_now'; granted: boolean };
  /** The camera's "turn on notifications" line was tapped ('settings' or 'ask') or dismissed. */
  push_nudge: { action: 'settings' | 'ask' | 'dismiss' };

  // Core actions (founder metrics). Sent from the store, once the server has the row; the row's
  // id rides along so a duplicate can be spotted. Supabase stays the number of record.
  /** I now follow `target_id`; `friends` when they already followed me (a friendship formed). */
  user_followed: { target_id: string; friends: boolean };
  /** I stopped following `target_id`. */
  user_unfollowed: { target_id: string };
  /** A post went from not liked to liked by me. */
  post_liked: { post_id: string };
  /** A comment was saved. */
  comment_added: { comment_id: string; post_id: string };
  /** A message was saved; `first` when it started the conversation. */
  message_sent: { message_id: string; conversation_id: string; first: boolean };
};

/** Send one tag-loop event. Never throws: analytics must not break what the user just did. */
export function track<K extends keyof TagLoopEvents>(event: K, props: TagLoopEvents[K]): void {
  try {
    posthog.capture(event, props);
  } catch {
    // An analytics SDK that isn't ready is not worth a crash.
  }
}

/**
 * Keep PostHog's person equal to the signed-in Supabase account (see `analyticsIdentity.ts`).
 * Call on every auth change; it only acts when the account actually changed. Waits for PostHog
 * to load its saved ids first, so a cold start compares against this phone's real ids.
 */
export async function syncAnalyticsIdentity(
  user: { id: string; email?: string | null } | null
): Promise<void> {
  try {
    await posthog.ready();
    const step = identityStep(user?.id ?? null, posthog.getDistinctId(), posthog.getAnonymousId());
    if (step === 'reset' || step === 'reset_then_identify') posthog.reset();
    if (user && (step === 'identify' || step === 'reset_then_identify')) {
      posthog.identify(user.id, { email: user.email ?? null });
    }
    // Every event says which app update sent it (a reset clears this, so it's set each time).
    await posthog.register(appUpdateProperties());
  } catch {
    // Same as `track`: analytics never breaks signing in or out.
  }
}

/**
 * Sent with every event (owner, 2026-10-07): which build and OTA update the phone runs, as
 * `app_update` "12.30", so numbers can be checked per update and old updates told apart.
 */
export function appUpdateProperties(): {
  app_build: number | null;
  ota: number;
  app_update: string;
} {
  return {
    app_build: APP_BUILD,
    ota: OTA_NUMBER,
    app_update: `${APP_BUILD ?? '?'}.${String(OTA_NUMBER).padStart(2, '0')}`,
  };
}
