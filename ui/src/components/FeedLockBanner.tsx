/**
 * Top of the feed, under the app header:
 * - locked → one card saying why (who tagged you, or that you haven't posted) and one button: to
 *   the camera when there's something to post, or to people search when there isn't;
 * - open → a live countdown to when the feed would lock (or, if you're tagged, to when it locks),
 *   in the camera banner's style (founder, 2026-10-05).
 * Lock state and open tags expire, so both come fresh from the server each session (never saved
 * on the phone); the card waits for this session's first read of open tags rather than guessing.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useOpenTags } from '@/hooks/useOpenTags';
import { useSecondTick } from '@/hooks/useSecondTick';
import { clockText, feedCountdown, lockExplainer } from '@/lib/feedLock';
import { FEED_WINDOW_MS, ringProgress } from '@/lib/feedLayout';
import { CountdownRing, FadeInItem, PressScale } from '@/components/Motion';
import { FONTS } from '@/constants/fonts';
import {
  ALPHA,
  BLUR_INTENSITY,
  BORDER_WIDTH,
  FONT_SIZE,
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
}

export default function FeedLockBanner(props: FeedLockBannerProps): React.JSX.Element | null {
  return props.locked ? (
    <LockedCard
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
}: {
  unlockedUntil: string | null;
  serverOffsetMs: number;
  onPost: () => void;
  onFindFriends?: () => void;
}): React.JSX.Element | null {
  const { dark, colors } = useAppTheme();
  const { openTags, loaded } = useOpenTags();
  // The tag clock ticks every second, like every tag countdown.
  const deviceNow = useSecondTick(openTags.length > 0);
  if (!loaded) return null;

  const card = lockExplainer({ locked: true, unlockedUntil, openTags, serverOffsetMs, deviceNow });
  if (!card) return null;
  const toFriends = card.target === 'friends';
  const onPress = toFriends ? onFindFriends : onPost;

  return (
    // Only the button takes touches, so the feed's scroll and swipe still start anywhere else.
    <FadeInItem>
      <View
        pointerEvents="box-none"
        style={[
          styles.card,
          {
            backgroundColor: dark ? colors.glassOnDark : colors.glassOnLight,
            borderColor: withAlpha(colors.accent, ALPHA.a35),
          },
        ]}
      >
        <Text style={[styles.headline, { color: colors.text }]} accessibilityRole="header">
          {card.headline}
        </Text>
        <Text style={[styles.body, { color: withAlpha(colors.text, ALPHA.a75) }]}>{card.body}</Text>
        {onPress ? (
          <PressScale
            style={[styles.button, { backgroundColor: colors.accent }]}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={card.button}
            accessibilityHint={toFriends ? 'Opens search' : 'Opens the camera'}
          >
            <Text style={[styles.buttonText, { color: colors.offBlack }]}>{card.button}</Text>
          </PressScale>
        ) : null}
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
  card: {
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r16,
    padding: SPACE.s16,
    gap: SPACE.s8,
  },
  headline: {
    fontSize: FONT_SIZE.f18,
    lineHeight: LINE_HEIGHT.l24,
    fontFamily: FONTS.bold,
  },
  body: {
    fontSize: FONT_SIZE.f14,
    lineHeight: LINE_HEIGHT.l20,
    fontFamily: FONTS.regular,
  },
  button: {
    alignSelf: 'flex-start',
    minHeight: SIZE.z44,
    justifyContent: 'center',
    borderRadius: RADIUS.pill,
    paddingVertical: SPACE.s12,
    paddingHorizontal: SPACE.s20,
    marginTop: SPACE.s4,
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
