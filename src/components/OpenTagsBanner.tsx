import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useAppTheme } from '@/hooks/useAppTheme';
import { formatHms, msLeft } from '@/lib/countdown';
import type { OpenTag } from '@/api';

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
  const [, setTick] = useState(0);

  useEffect(() => {
    if (openTags.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [openTags.length]);

  const first = openTags[0];
  if (!first) return null;

  const others = openTags.length - 1;
  const who = `@${first.username}${others > 0 ? ` +${others}` : ''}`;
  const left = formatHms(msLeft(first.expires_at, serverOffsetMs));

  return (
    <View style={styles.wrap} pointerEvents="none">
      <BlurView intensity={40} tint="dark" style={[styles.pill, { borderColor: colors.accent }]}>
        <Text style={[styles.text, { color: colors.offWhite }]} numberOfLines={1}>
          {who} tagged you ·{' '}
          <Text style={[styles.time, { color: colors.accent }]}>{left}</Text> left
        </Text>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 14,
  },
  time: {
    fontFamily: 'JosefinSans_700Bold',
  },
});
