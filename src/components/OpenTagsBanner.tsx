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
import { FONT_SIZE, SPACE, RADIUS, BORDER_WIDTH, OFFSET, SIZE } from '@/constants/tokens';

/**
 * Camera overlay: who tagged you and how long is left on the soonest deadline, and under it the
 * "turn on notifications" line for someone who has them off. Renders nothing when there are no
 * open tags.
 */
export default function OpenTagsBanner({
  openTags,
  serverOffsetMs,
}: {
  openTags: OpenTag[];
  serverOffsetMs: number;
}): React.JSX.Element | null {
  const { colors } = useAppTheme();
  // Just under the app header, whose height follows the status bar / notch.
  const top = appHeaderHeight(useSafeAreaInsets().top) + OFFSET.o12;
  // Hours and minutes only, so a refresh every minute keeps it right.
  const deviceNow = useMinuteTick();

  const banner = openTagsBanner({ openTags, serverOffsetMs, deviceNow });
  if (!banner) return null;

  return (
    // box-none: touches pass through to the camera except on the notifications line.
    <View style={[styles.wrap, { top }]} pointerEvents="box-none">
      <View pointerEvents="none">
        <BlurView intensity={40} tint="dark" style={[styles.pill, { borderColor: colors.accent }]}>
          <Text style={[styles.text, { color: colors.offWhite }]} numberOfLines={1}>
            {banner.who} tagged you ·{' '}
            <Text style={[styles.time, { color: colors.accent }]}>{banner.left}</Text>
          </Text>
        </BlurView>
      </View>
      {/* Tagged with notifications off: one line to turn them on (flag push-core). */}
      <PushNudge openTags={openTags} />
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
  pill: {
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    borderWidth: BORDER_WIDTH.w1,
    paddingHorizontal: SPACE.s16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f14,
  },
  time: {
    fontFamily: FONTS.bold,
  },
});
