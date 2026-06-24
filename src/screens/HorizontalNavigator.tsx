import React, { useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import VerticalNavigator from '@/screens/VerticalNavigator';
import ProfileScreen from '@/screens/ProfileScreen';
import MessagesScreen from '@/screens/MessagesScreen';

// ─── Layout constants ──────────────────────────────────────────────────────────
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Gesture thresholds ────────────────────────────────────────────────────────
const H_SWIPE_PX = 60; // min drag distance to trigger navigation
const H_SWIPE_VX = 0.4; // min release velocity to trigger navigation

// ─── Panel registry ───────────────────────────────────────────────────────────
// Left to right: Profile (0) ← VerticalNavigator (1, default) → Messages (2)
const PANEL_COUNT = 3;
const DEFAULT_INDEX = 1; // VerticalNavigator is the entry panel

// ─── HorizontalNavigator ──────────────────────────────────────────────────────

export default function HorizontalNavigator(): React.JSX.Element {
  const [hIndex, setHIndex] = useState(DEFAULT_INDEX);
  const hIndexRef = useRef(DEFAULT_INDEX);
  const hBaseRef = useRef(0);
  const overlayRef = useRef(false);
  const hTapeAnim = useRef(new Animated.Value(-(DEFAULT_INDEX * SCREEN_WIDTH))).current;

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
      // When a fullscreen overlay (profile, search, notifs) is open, don't claim.
      onMoveShouldSetPanResponder: (_e, { dx, dy }) =>
        !overlayRef.current && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 20,

      onPanResponderGrant: () => {
        hTapeAnim.stopAnimation();
        hBaseRef.current = -(hIndexRef.current * SCREEN_WIDTH);
      },

      onPanResponderMove: (_e, { dx }) => {
        const max = 0; // leftmost edge (Profile)
        const min = -((PANEL_COUNT - 1) * SCREEN_WIDTH); // rightmost edge (Messages)
        const raw = hBaseRef.current + dx;
        // Rubber-band resistance at both ends
        let clamped: number;
        if (raw > max) clamped = max + (raw - max) / 3;
        else if (raw < min) clamped = min + (raw - min) / 3;
        else clamped = raw;
        hTapeAnim.setValue(clamped);
      },

      onPanResponderRelease: (_e, { dx, vx }) => {
        const i = hIndexRef.current;
        let next = i;
        // Swipe right (dx > 0) → go to left panel (Profile)
        if ((dx > H_SWIPE_PX || vx > H_SWIPE_VX) && i > 0) next = i - 1;
        // Swipe left (dx < 0) → go to right panel (Messages)
        if ((dx < -H_SWIPE_PX || vx < -H_SWIPE_VX) && i < PANEL_COUNT - 1) next = i + 1;
        navigateHorizontal(next);
      },
    })
  ).current;

  return (
    <View style={styles.root} {...panResponder.panHandlers}>
      <Animated.View style={[styles.tape, { transform: [{ translateX: hTapeAnim }] }]}>
        {/* Panel 0: Profile — always mounted; `isActive` flips true when the
            tape settles on index 0 so ProfileScreen can recover a raced/empty
            first posts-sync (hand-rolled nav focus, not react-navigation). */}
        <View style={styles.panel}>
          <ProfileScreen isActive={hIndex === 0} />
        </View>

        {/* Panel 1: VerticalNavigator (main content) — default visible panel */}
        <View style={styles.panel}>
          <VerticalNavigator
            onNavigateLeft={() => navigateHorizontal(0)}
            onNavigateRight={() => navigateHorizontal(2)}
            onOverlayChange={(active) => {
              overlayRef.current = active;
            }}
          />
        </View>

        {/* Panel 2: Messages */}
        <View style={styles.panel}>
          <MessagesScreen onBack={() => navigateHorizontal(1)} />
        </View>
      </Animated.View>
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
    overflow: 'hidden',
  },
});
