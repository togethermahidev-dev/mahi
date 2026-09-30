import React, { useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, Platform, StyleSheet, View } from 'react-native';
import { BlurTargetView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VerticalNavigator, { type VerticalControl } from '@/screens/VerticalNavigator';
import ProfileScreen from '@/screens/ProfileScreen';
import MessagesScreen from '@/screens/MessagesScreen';
import NavRail, { type RailTab } from '@/components/NavRail';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useAppTheme } from '@/hooks/useAppTheme';
import { horizontalSwipe } from '@/lib/swipeRules';

// ─── Layout constants ──────────────────────────────────────────────────────────
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Gesture thresholds ────────────────────────────────────────────────────────
const H_SWIPE_PX = 60; // min drag distance to trigger navigation
const H_SWIPE_VX = 0.4; // min release velocity to trigger navigation

// ─── Panel registry ───────────────────────────────────────────────────────────
// Panels, left to right — Profile (0) ← VerticalNavigator (1, default) → Messages (2)
const PANEL_COUNT = 3;
const DEFAULT_INDEX = 1; // VerticalNavigator is the entry panel

// ─── HorizontalNavigator ──────────────────────────────────────────────────────

export default function HorizontalNavigator(): React.JSX.Element {
  const showRail = useFeatureFlag('nav-glass-rail');
  const { dark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const insetsRef = useRef(insets);
  insetsRef.current = insets;

  const [hIndex, setHIndex] = useState(DEFAULT_INDEX);
  const [vIndex, setVIndex] = useState(0);
  const [overlay, setOverlay] = useState(false);
  const hIndexRef = useRef(DEFAULT_INDEX);
  const hBaseRef = useRef(0);
  const overlayRef = useRef(false);
  const verticalRef = useRef<VerticalControl | null>(null);
  const blurTargetRef = useRef<View | null>(null);
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
      // Claim clear horizontal swipes (see swipeRules); vertical ones pass to VerticalNavigator.
      // x0/y0 aren't set until the grant, so the start point is where the finger is minus how far it moved.
      onMoveShouldSetPanResponder: (_e, { moveX, moveY, dx, dy }) =>
        horizontalSwipe({
          startX: moveX - dx,
          startY: moveY - dy,
          dx,
          dy,
          width: SCREEN_WIDTH,
          height: SCREEN_HEIGHT,
          insets: insetsRef.current,
          blocked: overlayRef.current,
        }) === 'activate',

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

      // Snap back if the system takes the touch mid-swipe.
      onPanResponderTerminate: () => navigateHorizontal(hIndexRef.current),
    })
  ).current;

  const railTab: RailTab =
    hIndex === 0 ? 'profile' : hIndex === 2 ? 'messages' : vIndex === 0 ? 'camera' : 'feed';

  const selectTab = (tab: RailTab) => {
    if (tab === 'profile') return navigateHorizontal(0);
    if (tab === 'messages') return navigateHorizontal(2);
    if (hIndexRef.current !== 1) navigateHorizontal(1);
    verticalRef.current?.navigateTo(tab === 'camera' ? 0 : 1);
  };

  // Android blurs a BlurTargetView's content; iOS blurs whatever is behind natively.
  const Tape = Platform.OS === 'android' ? BlurTargetView : View;

  return (
    <View style={styles.root} {...panResponder.panHandlers}>
      <Tape ref={blurTargetRef} style={styles.root}>
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
              controlRef={verticalRef}
              railShown={showRail}
              onIndexChange={setVIndex}
              onNavigateLeft={() => navigateHorizontal(0)}
              onNavigateRight={() => navigateHorizontal(2)}
              onOverlayChange={(active) => {
                overlayRef.current = active;
                setOverlay(active);
              }}
            />
          </View>

          {/* Panel 2: Messages */}
          <View style={styles.panel}>
            <MessagesScreen onBack={() => navigateHorizontal(1)} />
          </View>
        </Animated.View>
      </Tape>

      {showRail && !overlay ? (
        <NavRail
          active={railTab}
          onSelect={selectTab}
          onDark={railTab === 'camera' || dark}
          blurTarget={Platform.OS === 'android' ? blurTargetRef : undefined}
        />
      ) : null}
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
