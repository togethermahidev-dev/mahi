import React, { useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SWIPE_DEBUG, getSwipeLog, subscribeSwipeLog } from '@/lib/swipeDebug';
import { COLORS, FONT_SIZE, LINE_HEIGHT, RADIUS, SIZE, SPACE, withAlpha } from '@/constants/tokens';

/** Preview-lane only: the last swipe decisions, top-left, never taking a touch. */
export default function SwipeDebugOverlay(): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const lines = useSyncExternalStore(subscribeSwipeLog, getSwipeLog);
  if (!SWIPE_DEBUG || lines.length === 0) return null;
  return (
    <View pointerEvents="none" style={[styles.box, { top: insets.top + SIZE.z60 }]}>
      {lines.map((line, i) => (
        <Text key={i} style={styles.line}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    left: SPACE.s8,
    right: SIZE.z80,
    padding: SPACE.s8,
    borderRadius: RADIUS.r8,
    backgroundColor: withAlpha(COLORS.black, 0.7),
    zIndex: 1000,
  },
  line: {
    color: COLORS.white,
    fontSize: FONT_SIZE.f10,
    lineHeight: LINE_HEIGHT.l14,
  },
});
