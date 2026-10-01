import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { openTagsBanner } from '@/lib/openTagsBanner';
import { appHeaderHeight } from '@/lib/pip';
import type { OpenTag } from '@/api';
import { FONTS } from '@/constants/fonts';
import { FONT_SIZE, SPACE, RADIUS, BORDER_WIDTH, OFFSET, SIZE } from '@/constants/tokens';

/**
 * Camera overlay: who tagged you and how long is left on the soonest deadline.
 * Renders nothing when there are no open tags.
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
  const [, setTick] = useState(0);

  // Hours and minutes only, so a refresh every 30 seconds keeps it right.
  useEffect(() => {
    if (openTags.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 30 * 1000);
    return () => clearInterval(id);
  }, [openTags.length]);

  const banner = openTagsBanner({ openTags, serverOffsetMs });
  if (!banner) return null;

  return (
    <View style={[styles.wrap, { top }]} pointerEvents="none">
      <BlurView intensity={40} tint="dark" style={[styles.pill, { borderColor: colors.accent }]}>
        <Text style={[styles.text, { color: colors.offWhite }]} numberOfLines={1}>
          {banner.who} tagged you ·{' '}
          <Text style={[styles.time, { color: colors.accent }]}>{banner.left}</Text>
        </Text>
      </BlurView>
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
