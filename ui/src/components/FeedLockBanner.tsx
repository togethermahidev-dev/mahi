/**
 * Top of the feed, under the app header:
 * - locked → one line in the middle of the frosted rows: the app's padlock in a circle, then a
 *   pill with what to do ("Start first workout") — to the camera
 *   when there's something to post, or to people search when there isn't (owner, 2026-10-08:
 *   black / white, all in line, no big card);
 * - open → a live countdown to when the feed would lock (or, if you're tagged, to when it locks),
 *   in the camera banner's style (founder, 2026-10-05).
 * Lock state and open tags expire, so both come fresh from the server each session (never saved
 * on the phone); the card waits for this session's first read of open tags rather than guessing.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LockIcon } from '@/components/ScreenIcons';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useUserStore } from '@/store';
import { useOpenTags } from '@/hooks/useOpenTags';
import { useCoachAnchor } from '@/hooks/useCoachMarks';
import { useSecondTick } from '@/hooks/useSecondTick';
import { clockText, feedCountdown, lockPill } from '@/lib/feedLock';
import { FEED_WINDOW_MS, ringProgress } from '@/lib/feedLayout';
import { CountdownRing, FadeInItem, PressScale } from '@/components/Motion';
import Reanimated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import { MOTION } from '@/constants/tokens';
import { TYPOGRAPHY } from '@/constants/typography';
import {
  ALPHA,
  BORDER_WIDTH,
  COLORS,
  ICON_SIZE,
  RADIUS,
  SHADOW_BLUR,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

interface FeedLockBannerProps {
  locked: boolean;
  /** When the 24-hour window from the last post ends (null = never posted). */
  unlockedUntil: string | null;
  /** server clock − device clock, from the feed read. */
  serverOffsetMs: number;
  /** Go to the camera. */
  onPost: () => void;
  /** Open people search (the way out when there's nothing to post yet). */
  onFindFriends?: () => void;
  /** Bumped each time a locked row is tapped: the padlock line wiggles "no". */
  shake?: number;
}

export default function FeedLockBanner(props: FeedLockBannerProps): React.JSX.Element | null {
  return props.locked ? (
    <LockedCard
      shake={props.shake ?? 0}
      onPost={props.onPost}
      onFindFriends={props.onFindFriends}
      unlockedUntil={props.unlockedUntil}
      serverOffsetMs={props.serverOffsetMs}
    />
  ) : (
    <OpenTimer {...props} />
  );
}

function LockedCard({
  unlockedUntil,
  serverOffsetMs,
  onPost,
  onFindFriends,
  shake,
}: {
  unlockedUntil: string | null;
  serverOffsetMs: number;
  onPost: () => void;
  onFindFriends?: () => void;
  shake: number;
}): React.JSX.Element | null {
  const { dark, colors } = useAppTheme();
  // A tap on a locked row behind: a quick sideways wiggle and a tick (still with Reduce Motion).
  const reduceMotion = useReducedMotion();
  const shakeX = useSharedValue(0);
  useEffect(() => {
    if (shake === 0) return;
    haptic('tick');
    if (reduceMotion) return;
    const { x, ms } = MOTION.shake;
    shakeX.value = withSequence(
      withTiming(-x, { duration: ms }),
      withTiming(x, { duration: ms }),
      withTiming(-x / 2, { duration: ms }),
      withTiming(x / 2, { duration: ms }),
      withTiming(0, { duration: ms })
    );
  }, [shake, reduceMotion, shakeX]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));
  const { openTags, loaded } = useOpenTags();
  // The tag clock ticks every second, like every tag countdown.
  const deviceNow = useSecondTick(openTags.length > 0);
  // The server's mark: someone who has posted is never asked for a first workout.
  const postedBefore = useUserStore((st) => st.profile?.has_posted_before ?? false);
  const pill = loaded
    ? lockPill({ locked: true, unlockedUntil, openTags, serverOffsetMs, deviceNow, postedBefore })
    : null;
  // The first locked feed: a one-time tip on this pill.
  const lockTip = useCoachAnchor('feedLocked', pill !== null);
  if (!pill) return null;
  const toFriends = pill.target === 'friends';
  const onPress = toFriends ? onFindFriends : onPost;

  return (
    // Only the button takes touches, so the feed's scroll and swipe still start anywhere else.
    <FadeInItem>
      <View ref={lockTip} pointerEvents="box-none" style={styles.lockWrap}>
        <Reanimated.View
          style={[
            styles.lockPill,
            { backgroundColor: colors.bg, borderColor: colors.border },
            shakeStyle,
          ]}
        >
          <View
            style={[styles.lockCircle, { backgroundColor: colors.text }]}
            accessible
            accessibilityLabel={pill.line}
          >
            <LockIcon size={ICON_SIZE.i22} color={colors.bg} />
          </View>
          {onPress ? (
            <PressScale
              style={[styles.actionPill, { backgroundColor: colors.text }]}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={pill.button}
              accessibilityHint={toFriends ? 'Opens search' : 'Opens the camera'}
            >
              <Text style={[styles.actionText, { color: colors.bg }]} numberOfLines={1}>
                {pill.button}
              </Text>
            </PressScale>
          ) : null}
        </Reanimated.View>
      </View>
    </FadeInItem>
  );
}

function OpenTimer({
  locked,
  unlockedUntil,
  serverOffsetMs,
}: FeedLockBannerProps): React.JSX.Element | null {
  const { openTags, loaded } = useOpenTags();
  // Ticks every second while there is a clock to show.
  const counting = loaded && !locked && !!unlockedUntil;
  const deviceNow = useSecondTick(counting);
  // Wait for this session's open tags, so the pill doesn't swap once they land.
  if (!loaded) return null;
  const timer = feedCountdown({ locked, unlockedUntil, openTags, serverOffsetMs, deviceNow });
  // Only the ring and the clock, clear on the right (owner, 2026-10-09: the words couldn't be read
  // over some posts). No clock (open until a friend tags you): nothing shows. The full sentence is
  // still what a screen reader hears.
  if (!timer || timer.ms === null) return null;

  return (
    <FadeInItem>
      <View
        pointerEvents="none"
        style={styles.timerWrap}
        accessible
        accessibilityRole="text"
        accessibilityLabel={timer.spoken}
      >
        {/* A ring that drains over the 24 hours: time left at a glance, never a warning. */}
        <View style={styles.shadowed}>
          <CountdownRing
            progress={ringProgress(timer.ms, FEED_WINDOW_MS)}
            color={COLORS.white}
            track={withAlpha(COLORS.white, ALPHA.a30)}
          />
        </View>
        <Text style={[styles.clock, styles.shadowed]}>{clockText(timer.ms)}</Text>
      </View>
    </FadeInItem>
  );
}

const styles = StyleSheet.create({
  // The lock pill: a padlock circle, the reason, and a round button, on a Mahi-blue gradient.
  lockWrap: {
    alignItems: 'center',
  },
  // One line: the padlock circle, then the action pill (black / white with the theme).
  lockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s10,
    padding: SPACE.s8,
    borderRadius: RADIUS.pill,
    borderWidth: BORDER_WIDTH.w1,
  },
  lockCircle: {
    width: SIZE.z44,
    height: SIZE.z44,
    borderRadius: RADIUS.r22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s8,
    minHeight: SIZE.z44,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACE.s8,
    paddingLeft: SPACE.s12,
    paddingRight: SPACE.s16,
  },
  actionText: {
    ...TYPOGRAPHY.pillLabel,
  },
  // The feed timer: the ring and the clock side by side, white with a soft shadow so they read
  // over any post (owner, 2026-10-09). The digits keep their width as they tick. The feed places
  // it on the right, apart from the header (feedTimerSpot, src/lib/feedHeader.ts).
  timerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s8,
  },
  clock: {
    ...TYPOGRAPHY.bodyStrong,
    color: COLORS.white,
    fontVariant: ['tabular-nums'],
  },
  shadowed: {
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: SIZE.z1 },
    shadowOpacity: ALPHA.a50,
    shadowRadius: SHADOW_BLUR.b3,
  },
});
