import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import PushNudge from '@/components/PushNudge';
import { openTagsBanner } from '@/lib/openTagsBanner';
import { appHeaderHeight } from '@/lib/pip';
import type { OpenTag } from '@/api';
import { FONTS } from '@/constants/fonts';
import {
  BLUR_INTENSITY,
  BORDER_WIDTH,
  FONT_SIZE,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
} from '@/constants/tokens';

/**
 * Camera overlay: who tagged you and how long is left on the soonest deadline, and under it the
 * "turn on notifications" line for someone who has them off. With no open tags it says "First
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
  const top = appHeaderHeight(useSafeAreaInsets().top) + OFFSET.o12;
  // Hours and minutes only, so a refresh every minute keeps it right.
  const deviceNow = useMinuteTick();

  const banner = openTagsBanner({ openTags, serverOffsetMs, deviceNow, firstPost });
  if (!banner) return null;
  const isFirstPost = banner.firstPost === true;

  return (
    // box-none: touches pass through to the camera except on the notifications line.
    <View style={[styles.wrap, { top }]} pointerEvents="box-none">
      <View
        style={styles.pillRoom}
        pointerEvents="none"
        accessible
        accessibilityRole="text"
        accessibilityLabel={
          isFirstPost
            ? 'Your first post needs no tag.'
            : `${banner.who} tagged you. ${banner.left}.`
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
        </BlurView>
      </View>
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
  pillRoom: {
    // Keeps the pill clear of the points counter (top right) on small phones and at large text.
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingHorizontal: SPACE.s80,
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
  text: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f14,
    textAlign: 'center',
  },
  time: {
    fontFamily: FONTS.bold,
  },
});
