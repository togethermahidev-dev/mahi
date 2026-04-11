import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type ViewStyle, type StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import type { TaggedUser } from '@/api';

const MAX_VISIBLE = 3;

interface Props {
  users:        TaggedUser[];
  onPressUser?: (user: TaggedUser) => void;
  /** Override the default absolute `left:16, bottom:16` positioning. */
  style?:       StyleProp<ViewStyle>;
}

export default function TaggedBubbleStack({ users, onPressUser, style }: Props) {
  if (users.length === 0) return null;
  const visible  = users.slice(0, MAX_VISIBLE);
  const overflow = users.length - MAX_VISIBLE;

  return (
    <View style={[styles.stack, style]} pointerEvents="box-none">
      {visible.map((u) => (
        <TouchableOpacity
          key={u.user_id}
          activeOpacity={0.85}
          disabled={!onPressUser}
          onPress={() => onPressUser?.(u)}
        >
          <BlurView intensity={40} tint="dark" style={styles.bubble}>
            <Text style={styles.bubbleText} numberOfLines={1} ellipsizeMode="tail">
              @{u.username}
            </Text>
          </BlurView>
        </TouchableOpacity>
      ))}
      {overflow > 0 ? (
        <BlurView intensity={40} tint="dark" style={styles.bubble}>
          <Text style={styles.bubbleText}>+{overflow} more</Text>
        </BlurView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    gap: 6,
    alignItems: 'flex-start',
  },
  bubble: {
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(0,0,0,0.45)',
    maxWidth: 180,
  },
  bubbleText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
});
