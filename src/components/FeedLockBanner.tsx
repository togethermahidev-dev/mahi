/**
 * Top of the feed, under the app header (flag 'feed-lock-explainer'):
 * - locked → one card saying why (who tagged you, or that you haven't posted) and, when there's
 *   something you can post, a button to the camera;
 * - open → a quiet line saying how long it stays open (or, if you're tagged, when it locks).
 * Lock state and open tags expire, so both come fresh from the server each session (never saved
 * on the phone); the card waits for this session's first read of open tags rather than guessing.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useOpenTags } from '@/hooks/useOpenTags';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import { feedTimerText, lockExplainer } from '@/lib/feedLock';
import { FONTS } from '@/constants/fonts';
import { FONT_SIZE, LINE_HEIGHT, RADIUS, SPACE, withAlpha } from '@/constants/tokens';

interface FeedLockBannerProps {
  locked: boolean;
  /** When the 24-hour window from the last post ends (null = never posted). */
  unlockedUntil: string | null;
  /** server clock − device clock, from the feed read. */
  serverOffsetMs: number;
  /** Go to the camera. */
  onPost: () => void;
}

export default function FeedLockBanner(props: FeedLockBannerProps): React.JSX.Element | null {
  return props.locked ? (
    <LockedCard
      onPost={props.onPost}
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
}: {
  unlockedUntil: string | null;
  serverOffsetMs: number;
  onPost: () => void;
}): React.JSX.Element | null {
  const { dark, colors } = useAppTheme();
  const { openTags, loaded } = useOpenTags();
  const deviceNow = useMinuteTick();
  if (!loaded) return null;

  const card = lockExplainer({ locked: true, unlockedUntil, openTags, serverOffsetMs, deviceNow });
  if (!card) return null;

  return (
    // Only the button takes touches, so the feed's scroll and swipe still start anywhere else.
    <View
      pointerEvents="box-none"
      style={[styles.card, { backgroundColor: dark ? colors.glassOnDark : colors.glassOnLight }]}
    >
      <Text style={[styles.headline, { color: colors.text }]} accessibilityRole="header">
        {card.headline}
      </Text>
      <Text style={[styles.body, { color: withAlpha(colors.text, 0.75) }]}>{card.body}</Text>
      {card.button ? (
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.accent },
            pressed && { opacity: 0.85 },
          ]}
          onPress={onPost}
          accessibilityRole="button"
          accessibilityLabel={card.button}
          accessibilityHint="Opens the camera"
        >
          <Text style={[styles.buttonText, { color: colors.offBlack }]}>{card.button}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function OpenTimer({
  locked,
  unlockedUntil,
  serverOffsetMs,
}: FeedLockBannerProps): React.JSX.Element | null {
  const { dark, colors } = useAppTheme();
  const { openTags, loaded } = useOpenTags();
  const deviceNow = useMinuteTick();
  // Wait for this session's open tags, so the line doesn't swap once they land.
  if (!loaded) return null;
  const text = feedTimerText({ locked, unlockedUntil, openTags, serverOffsetMs, deviceNow });
  if (!text) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.timer, { backgroundColor: dark ? colors.glassOnDark : colors.glassOnLight }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
    >
      <Text style={[styles.timerText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
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
    borderRadius: RADIUS.pill,
    paddingVertical: SPACE.s12,
    paddingHorizontal: SPACE.s20,
    marginTop: SPACE.s4,
  },
  buttonText: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.bold,
  },
  timer: {
    alignSelf: 'center',
    borderRadius: RADIUS.pill,
    paddingVertical: SPACE.s6,
    paddingHorizontal: SPACE.s12,
  },
  timerText: {
    fontSize: FONT_SIZE.f13,
    lineHeight: LINE_HEIGHT.l18,
    fontFamily: FONTS.semiBold,
  },
});
