import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import VerticalNavigator from '@/screens/VerticalNavigator';
import ProfileScreen from '@/screens/ProfileScreen';
import MessagesScreen from '@/screens/MessagesScreen';
import FeedModal from '@/components/FeedModal';
import { useAppTheme } from '@/hooks/useAppTheme';

// ─── Layout constants ──────────────────────────────────────────────────────────
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Gesture thresholds ────────────────────────────────────────────────────────
const H_SWIPE_PX = 60;  // min drag distance to trigger navigation
const H_SWIPE_VX = 0.4; // min release velocity to trigger navigation

// ─── Panel registry ───────────────────────────────────────────────────────────
// Left to right: Profile (0) ← VerticalNavigator (1, default) → Messages (2)
const PANEL_COUNT = 3;
const DEFAULT_INDEX = 1; // VerticalNavigator is the entry panel

// ─── HorizontalNavigator ──────────────────────────────────────────────────────

export default function HorizontalNavigator(): React.JSX.Element {
  const [hIndex, setHIndex]     = useState(DEFAULT_INDEX);
  const [feedOpen, setFeedOpen] = useState(false);
  const { dark } = useAppTheme();
  const pillBg   = dark ? '#1A1A17' : '#E8E8E3';
  const pillText = dark ? '#E8E8E3' : '#1A1A17';
  const hIndexRef    = useRef(DEFAULT_INDEX);
  const hBaseRef     = useRef(0);
  const hTapeAnim    = useRef(
    new Animated.Value(-(DEFAULT_INDEX * SCREEN_WIDTH)),
  ).current;

  // Snap the horizontal tape to a target panel with a spring animation.
  const navigateHorizontal = (index: number) => {
    setHIndex(index);
    hIndexRef.current = index;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(hTapeAnim, {
      toValue: -(index * SCREEN_WIDTH),
      damping: 22,
      stiffness: 160,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      // Claim horizontal swipes; vertical swipes pass to VerticalNavigator inside.
      onMoveShouldSetPanResponder: (_e, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10,

      onPanResponderGrant: () => {
        hTapeAnim.stopAnimation();
        hBaseRef.current = -(hIndexRef.current * SCREEN_WIDTH);
      },

      onPanResponderMove: (_e, { dx }) => {
        const max = 0;                              // leftmost edge (Profile)
        const min = -((PANEL_COUNT - 1) * SCREEN_WIDTH); // rightmost edge (Messages)
        const raw = hBaseRef.current + dx;
        // Rubber-band resistance at both ends
        let clamped: number;
        if (raw > max)      clamped = max + (raw - max) / 3;
        else if (raw < min) clamped = min + (raw - min) / 3;
        else                clamped = raw;
        hTapeAnim.setValue(clamped);
      },

      onPanResponderRelease: (_e, { dx, vx }) => {
        const i = hIndexRef.current;
        let next = i;
        // Swipe right (dx > 0) → go to left panel (Profile)
        if ((dx >  H_SWIPE_PX || vx >  H_SWIPE_VX) && i > 0)              next = i - 1;
        // Swipe left (dx < 0) → go to right panel (Messages)
        if ((dx < -H_SWIPE_PX || vx < -H_SWIPE_VX) && i < PANEL_COUNT - 1) next = i + 1;
        navigateHorizontal(next);
      },
    }),
  ).current;

  return (
    <View style={styles.root} {...panResponder.panHandlers}>
      <Animated.View
        style={[styles.tape, { transform: [{ translateX: hTapeAnim }] }]}
      >
        {/* Panel 0: Profile */}
        <View style={styles.panel}>
          <ProfileScreen />
        </View>

        {/* Panel 1: VerticalNavigator (main content) — default visible panel */}
        <View style={styles.panel}>
          <VerticalNavigator
            onNavigateLeft={() => navigateHorizontal(0)}
            onNavigateRight={() => navigateHorizontal(2)}
          />
        </View>

        {/* Panel 2: Messages */}
        <View style={styles.panel}>
          <MessagesScreen />
        </View>
      </Animated.View>

      {/* Floating MY FEED pill — sits above all panels, passes touches through wrapper */}
      <View style={styles.pillWrapper} pointerEvents="box-none">
        <TouchableOpacity
          style={[styles.pill, { backgroundColor: pillBg }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setFeedOpen(true);
          }}
          activeOpacity={0.85}
        >
          <Text style={[styles.pillText, { color: pillText }]}>↑  SOCIAL FEED</Text>
        </TouchableOpacity>
      </View>

      {/* Feed modal — slides up from bottom, isolated from PanResponder tree */}
      <FeedModal visible={feedOpen} onClose={() => setFeedOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  tape: {
    flexDirection: 'row',
    flex: 1,
    width: SCREEN_WIDTH * PANEL_COUNT,
  },
  panel: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  pillWrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 52 : 32,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 250,
  },
  pill: {
    borderRadius: 50,
    paddingVertical: 13,
    paddingHorizontal: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  pillText: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 13,
    letterSpacing: 3,
  },
});
