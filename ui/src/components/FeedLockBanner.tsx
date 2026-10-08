/**
 * Top of the feed, under the app header:
 * - locked → one line in the middle of the frosted rows: the app's padlock in a circle, then a
 *   pill with a little pixel athlete and what to do ("Post your first workout") — to the camera
 *   when there's something to post, or to people search when there isn't (owner, 2026-10-08:
 *   black / white, all in line, no big card);
 * - open → a live countdown to when the feed would lock (or, if you're tagged, to when it locks),
 *   in the camera banner's style (founder, 2026-10-05).
 * Lock state and open tags expire, so both come fresh from the server each session (never saved
 * on the phone); the card waits for this session's first read of open tags rather than guessing.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { LockIcon } from '@/components/ScreenIcons';
import PixelAthlete from '@/components/PixelAthlete';
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
import { FONTS } from '@/constants/fonts';
import {
  ALPHA,
  BLUR_INTENSITY,
  BORDER_WIDTH,
  COLORS,
  FONT_SIZE,
  ICON_SIZE,
  LINE_HEIGHT,
  RADIUS,
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
              <PixelAthlete size={SIZE.z28} color={colors.bg} />
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
  const { dark, colors } = useAppTheme();
  const { openTags, loaded } = useOpenTags();
  // Ticks every second while there is a clock to show.
  const counting = loaded && !locked && !!unlockedUntil;
  const deviceNow = useSecondTick(counting);
  // Wait for this session's open tags, so the pill doesn't swap once they land.
  if (!loaded) return null;
  const timer = feedCountdown({ locked, unlockedUntil, openTags, serverOffsetMs, deviceNow });
  if (!timer) return null;

  return (
    <FadeInItem>
      <View
        pointerEvents="none"
        style={styles.timerWrap}
        accessible
        accessibilityRole="text"
        accessibilityLabel={timer.spoken}
      >
        <BlurView
          intensity={BLUR_INTENSITY.i40}
          tint={dark ? 'dark' : 'light'}
          style={[styles.timer, { borderColor: colors.accent }]}
        >
          {/* A ring that drains over the 24 hours: time left at a glance, never a warning. */}
          {timer.ms !== null ? (
            <CountdownRing
              progress={ringProgress(timer.ms, FEED_WINDOW_MS)}
              color={colors.accent}
              track={withAlpha(colors.text, ALPHA.a15)}
            />
          ) : null}
          <Text style={[styles.timerText, { color: colors.text }]} numberOfLines={2}>
            {timer.label}
            {timer.ms !== null ? (
              <Text style={[styles.clock, { color: colors.accentText }]}>
                {' '}
                {clockText(timer.ms)}
              </Text>
            ) : null}
          </Text>
        </BlurView>
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
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.bold,
  },
  buttonText: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.bold,
  },
  // The camera's open-tags pill (OpenTagsBanner): frosted, an accent outline, the time in bold
  // accent. The digits keep their width, so the pill doesn't wobble as they tick.
  timerWrap: {
    alignSelf: 'center',
  },
  timer: {
    minHeight: SIZE.z36,
    borderRadius: RADIUS.r18,
    borderWidth: BORDER_WIDTH.w1,
    paddingHorizontal: SPACE.s16,
    paddingVertical: SPACE.s8,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s8,
    overflow: 'hidden',
  },
  timerText: {
    fontSize: FONT_SIZE.f14,
    lineHeight: LINE_HEIGHT.l18,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
  },
  clock: {
    fontFamily: FONTS.bold,
    fontVariant: ['tabular-nums'],
  },
});
