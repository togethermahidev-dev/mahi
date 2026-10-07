import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import PushNudge from '@/components/PushNudge';
import { FadeInItem } from '@/components/Motion';
import Reanimated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  ZoomIn,
  useReducedMotion,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { msLeft } from '@/lib/countdown';
import { openTagsBanner } from '@/lib/openTagsBanner';
import { openTagsTop } from '@/lib/pip';
import type { OpenTag } from '@/api';
import { FONTS } from '@/constants/fonts';
import {
  BLUR_INTENSITY,
  BORDER_WIDTH,
  DURATION,
  FONT_SIZE,
  ICON_SIZE,
  MOTION,
  RADIUS,
  SIZE,
  SPACE,
  STROKE,
} from '@/constants/tokens';

/**
 * Camera overlay: who tagged you and how long is left on the soonest deadline, and under it the
 * "turn on notifications" line for someone who has them off. A second line in the pill says when
 * one workout answers several tags, or that any workout counts for a newcomer's first post. With no open tags it says "First
 * post · no tag needed" to someone who has never posted (`firstPost`), else renders nothing.
 */
export default function OpenTagsBanner({
  openTags,
  serverOffsetMs,
  firstPost = false,
}: {
  openTags: OpenTag[];
  serverOffsetMs: number;
  firstPost?: boolean;
}): React.JSX.Element | null {
  const { colors } = useAppTheme();
  // Just under the app header, whose height follows the status bar / notch.
  // Under the points counter (top right), so the two never overlap.
  const top = openTagsTop(useSafeAreaInsets().top, useWindowDimensions().fontScale);
  // Hours and minutes only, so a refresh every minute keeps it right.
  const deviceNow = useMinuteTick();

  // The moment you answer: the tag pill morphs into a check for a beat. Only when the tags
  // left while still open (answered), never when they ran out.
  const reduceMotion = useReducedMotion();
  const prevTags = useRef(openTags);
  const [answered, setAnswered] = useState(false);
  useEffect(() => {
    const before = prevTags.current;
    prevTags.current = openTags;
    const stillOpen = before.some((t) => msLeft(t.expires_at, serverOffsetMs) > 0);
    if (before.length > 0 && openTags.length === 0 && stillOpen) setAnswered(true);
  }, [openTags, serverOffsetMs]);
  useEffect(() => {
    if (!answered) return;
    const id = setTimeout(() => setAnswered(false), MOTION.celebrateMs);
    return () => clearTimeout(id);
  }, [answered]);

  const banner = openTagsBanner({ openTags, serverOffsetMs, deviceNow, firstPost });
  if (answered) {
    return (
      <View style={[styles.wrap, { top }]} pointerEvents="none">
        <Reanimated.View
          entering={
            reduceMotion
              ? FadeIn.duration(DURATION.d200).reduceMotion(ReduceMotion.Never)
              : ZoomIn.springify().damping(MOTION.morph.damping).stiffness(MOTION.morph.stiffness)
          }
          exiting={FadeOut.duration(DURATION.d300)}
          style={[styles.pill, styles.donePill, { backgroundColor: colors.accent }]}
          accessible
          accessibilityRole="text"
          accessibilityLabel="Tag answered"
          accessibilityLiveRegion="polite"
        >
          <Svg width={ICON_SIZE.i16} height={ICON_SIZE.i16} viewBox="0 0 24 24">
            <Path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke={colors.offBlack}
              strokeWidth={STROKE.s2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <Text style={[styles.text, { color: colors.offBlack }]}>Tag answered</Text>
        </Reanimated.View>
      </View>
    );
  }
  if (!banner) return null;
  const isFirstPost = banner.firstPost === true;

  return (
    // box-none: touches pass through to the camera except on the notifications line.
    <View style={[styles.wrap, { top }]} pointerEvents="box-none">
      <FadeInItem style={styles.fadeRoom}>
        <View
          style={styles.pillRoom}
          pointerEvents="none"
          accessible
          accessibilityRole="text"
          accessibilityLabel={
            isFirstPost
              ? `Your first post needs no tag. ${banner.note ?? ''}`.trim()
              : `${banner.who} tagged you. ${banner.left}.${banner.note ? ` ${banner.note}` : ''}`
          }
        >
          <BlurView
            intensity={BLUR_INTENSITY.i40}
            tint="dark"
            style={[styles.pill, { borderColor: colors.accent }]}
          >
            <Text style={[styles.text, { color: colors.offWhite }]} numberOfLines={2}>
              {isFirstPost ? banner.who : `${banner.who} tagged you`} ·{' '}
              <Text style={[styles.time, { color: colors.accent }]}>{banner.left}</Text>
            </Text>
            {/* One post answers every open tag; a newcomer hears that any workout counts. */}
            {banner.note ? (
              <Text style={[styles.note, { color: colors.offWhite }]} numberOfLines={2}>
                {banner.note}
              </Text>
            ) : null}
          </BlurView>
        </View>
      </FadeInItem>
      {/* Tagged with notifications off: one line to turn them on (flag push-core). */}
      {isFirstPost ? null : <PushNudge openTags={openTags} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fadeRoom: {
    alignSelf: 'stretch',
  },
  pillRoom: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingHorizontal: SPACE.s24,
  },
  pill: {
    // Grows with the text size instead of clipping it.
    minHeight: SIZE.z36,
    paddingVertical: SPACE.s8,
    borderRadius: RADIUS.r18,
    borderWidth: BORDER_WIDTH.w1,
    paddingHorizontal: SPACE.s16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  donePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s6,
    borderWidth: 0,
  },
  text: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f14,
    textAlign: 'center',
  },
  time: {
    fontFamily: FONTS.bold,
  },
  note: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f13,
    textAlign: 'center',
    marginTop: SPACE.s4,
  },
});
