import React from 'react';
import { View, Text, StyleSheet, Pressable, type ViewStyle, type StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import type { TaggedUser } from '@/api';
import { TYPOGRAPHY } from '@/constants/typography';
import {
  COLORS,
  ALPHA,
  BLUR_INTENSITY,
  LAYOUT,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

interface Props {
  users: TaggedUser[];
  onPressUser?: (user: TaggedUser) => void;
  /** Override the default absolute `left OFFSET.o16, bottom OFFSET.o16` positioning. */
  style?: StyleProp<ViewStyle>;
}

export default function TaggedBubbleStack({ users, onPressUser, style }: Props) {
  if (users.length === 0) return null;
  const visible = users.slice(0, LAYOUT.taggedBubbles);
  const overflow = users.length - LAYOUT.taggedBubbles;

  return (
    <View style={[styles.stack, style]} pointerEvents="box-none">
      {visible.map((u) => (
        <Pressable
          style={({ pressed }) => pressed && { opacity: ALPHA.a85 }}
          key={u.user_id}
          disabled={!onPressUser}
          onPress={() => onPressUser?.(u)}
          // A 44-point target; the bubbles' gap fits both slops, so they meet but never overlap.
          hitSlop={{ top: OFFSET.o4, bottom: OFFSET.o4 }}
          accessibilityRole={onPressUser ? 'link' : 'text'}
          accessibilityLabel={`Tagged @${u.username}`}
          accessibilityHint={onPressUser ? 'Opens their profile' : undefined}
        >
          <BlurView intensity={BLUR_INTENSITY.i40} tint="dark" style={styles.bubble}>
            <Text style={styles.bubbleText} numberOfLines={1} ellipsizeMode="tail">
              @{u.username}
            </Text>
          </BlurView>
        </Pressable>
      ))}
      {overflow > 0 ? (
        <BlurView intensity={BLUR_INTENSITY.i40} tint="dark" style={styles.bubble}>
          <Text style={styles.bubbleText}>+{overflow} more</Text>
        </BlurView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    left: OFFSET.o16,
    bottom: OFFSET.o16,
    gap: SPACE.s8,
    alignItems: 'flex-start',
  },
  bubble: {
    // Grows with the text size instead of clipping it.
    minHeight: SIZE.z36,
    borderRadius: RADIUS.r16,
    paddingHorizontal: SPACE.s14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(COLORS.white, ALPHA.a18),
    backgroundColor: withAlpha(COLORS.black, ALPHA.a45),
    maxWidth: SIZE.z180,
  },
  bubbleText: {
    ...TYPOGRAPHY.chipLabel,
    color: COLORS.white,
  },
});
