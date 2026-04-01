import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Platform,
  PanResponder,
  StyleSheet,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/hooks/useAppTheme';
import NavigationDots from '@/components/NavigationDots';
import AppHeader from '@/components/AppHeader';
import GlobalSearchOverlay from '@/components/GlobalSearchOverlay';
import {
  CameraIcon,
  FeedIcon,
} from '@/components/ScreenIcons';
import CameraScreen from '@/screens/CameraScreen';
import FeedScreen from '@/screens/FeedScreen';

// ─── Layout constants ──────────────────────────────────────────────────────────
// PEEK_HEIGHT: strip of the next screen visible at the bottom of each screen.
//   → Must match the PEEK_HEIGHT constant in CameraScreen.tsx (shutter positioning).
// SLOT_HEIGHT: the vertical space each screen occupies when active.
const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
export const PEEK_HEIGHT = 110;
const SLOT_HEIGHT = SCREEN_HEIGHT - PEEK_HEIGHT;
const APP_HEADER_H = Platform.OS === 'ios' ? 108 : 80;

// ─── Gesture thresholds ────────────────────────────────────────────────────────
const SWIPE_PX = 60;  // min drag distance to trigger navigation
const SWIPE_VY = 0.4; // min release velocity to trigger navigation

// Pull-down threshold to open search (only when at top/camera screen)
const SEARCH_PULL_PX = 80;
const SEARCH_PULL_VY = 0.3;

// ─── Screen registry ──────────────────────────────────────────────────────────
// Ordered top → bottom. Index 0 (Camera) is the entry screen.
// Profile is not in the vertical tape — it lives in the horizontal layer.
const SCREENS = [
  { key: 'camera', Component: CameraScreen, Icon: CameraIcon },
  { key: 'feed',   Component: FeedScreen,   Icon: FeedIcon },
] as const;

const SCREEN_ICONS = SCREENS.map((s) => s.Icon);

// Background colours per screen in each theme mode. Used for off-screen
// placeholder views so the peek strip colour is always correct.
const SCREEN_BG_DARK  = ['#111111', '#1C1C19'] as const;
const SCREEN_BG_LIGHT = ['#111111', '#FFFFFF'] as const;

// ─── Props ────────────────────────────────────────────────────────────────────

interface VerticalNavigatorProps {
  onNavigateLeft:  () => void; // tap profile pill or swipe right → Profile screen
  onNavigateRight: () => void; // tap messages icon or swipe left → Messages screen
}

// ─── VerticalNavigator ────────────────────────────────────────────────────────

export default function VerticalNavigator({
  onNavigateLeft,
  onNavigateRight,
}: VerticalNavigatorProps): React.JSX.Element {
  const { dark } = useAppTheme();

  const [activeIndex, setActiveIndex] = useState(0);
  const [searchVisible, setSearchVisible] = useState(false);
  const activeIndexRef    = useRef(0);
  const baseOffsetRef     = useRef(0);
  const feedScrollAtTop   = useRef(true);
  const tapeAnim          = useRef(new Animated.Value(0)).current;
  const headerAnim        = useRef(new Animated.Value(0)).current;

  // Snap the tape to a target screen with a spring animation and haptic.
  const navigateTo = (index: number) => {
    setActiveIndex(index);
    activeIndexRef.current = index;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(tapeAnim, {
      toValue: -(index * SLOT_HEIGHT),
      damping: 22,
      stiffness: 160,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
    // Always restore header when switching screens
    if (index !== 1) {
      headerAnim.setValue(0);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      // Claim vertical swipes; let horizontal gestures pass to HorizontalNavigator.
      // On the feed screen (index 1), only claim a downward swipe (back to camera)
      // when the feed scroll is at the top — otherwise let the FlashList scroll.
      onMoveShouldSetPanResponder: (_e, { dx, dy }) => {
        if (Math.abs(dy) <= Math.abs(dx) || Math.abs(dy) <= 10) return false;
        if (activeIndexRef.current === 1 && dy > 0 && !feedScrollAtTop.current) return false;
        return true;
      },

      onPanResponderGrant: (evt) => {
        tapeAnim.stopAnimation();
        baseOffsetRef.current = -(activeIndexRef.current * SLOT_HEIGHT);

        // Stronger haptic when touch starts inside the peek strip zone and
        // there is a next screen to navigate to.
        const touchY = evt.nativeEvent.pageY;
        if (
          touchY > SCREEN_HEIGHT - PEEK_HEIGHT &&
          activeIndexRef.current < SCREENS.length - 1
        ) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      },

      onPanResponderMove: (_e, { dy }) => {
        const max = 0;
        const min = -((SCREENS.length - 1) * SLOT_HEIGHT);
        const raw = baseOffsetRef.current + dy;
        // Rubber-band resistance at the first and last screens
        let clamped: number;
        if (raw > max)      clamped = max + (raw - max) / 3;
        else if (raw < min) clamped = min + (raw - min) / 3;
        else                clamped = raw;
        tapeAnim.setValue(clamped);
      },

      onPanResponderRelease: (_e, { dy, vy }) => {
        const i = activeIndexRef.current;
        let next = i;
        if ((dy < -SWIPE_PX || vy < -SWIPE_VY) && i < SCREENS.length - 1) next = i + 1;
        if ((dy >  SWIPE_PX || vy >  SWIPE_VY) && i > 0)                   next = i - 1;

        // Pull down while on top (camera) screen → open search overlay
        if (i === 0 && (dy > SEARCH_PULL_PX || vy > SEARCH_PULL_VY)) {
          // Snap back to camera position first
          navigateTo(0);
          setSearchVisible(true);
          return;
        }

        navigateTo(next);
      },
    }),
  ).current;

  // ─── Peek strip border radius ──────────────────────────────────────────────
  // Each screen slot (index > 0) slides in from the bottom with rounded top
  // corners while it is peeking. As it becomes the active screen the corners
  // collapse to 0, giving a "morphing into the screen" feel.
  //
  // Derivation per slot i (i > 0):
  //   • tapeAnim = -(i-1)*SLOT_HEIGHT  → slot i is in peek position  → radius 40
  //   • tapeAnim =  -i   *SLOT_HEIGHT  → slot i is fully active      → radius 0
  //
  // tapeAnim is used with useNativeDriver:true for translateY, and with
  // useNativeDriver:false here for borderRadius — both are supported in RN.
  const borderRadii = useMemo(
    () =>
      SCREENS.map((_, i) =>
        i === 0
          ? null // Camera is always at the top — no rounded entry needed
          : tapeAnim.interpolate({
              inputRange: [-i * SLOT_HEIGHT, -(i - 1) * SLOT_HEIGHT],
              outputRange: [0, 40],
              extrapolate: 'clamp',
            }),
      ),
    [],
  );

  const bgPalette = dark ? SCREEN_BG_DARK : SCREEN_BG_LIGHT;

  return (
    <View style={styles.root} {...panResponder.panHandlers}>
      {/* Tape — all screens stacked vertically, translated by tapeAnim */}
      <Animated.View
        style={[styles.tape, { transform: [{ translateY: tapeAnim }] }]}
      >
        {SCREENS.map(({ key, Component }, i) => {
          const radius = borderRadii[i];

          // Only fully mount screens within one index of the active screen.
          // Distant slots render as a plain coloured placeholder so the
          // peek strip colour is always correct without heavy mounts.
          const isNearby = Math.abs(i - activeIndex) <= 1;

          return (
            <Animated.View
              key={key}
              style={[
                styles.slot,
                {
                  top: i * SLOT_HEIGHT,
                  backgroundColor: bgPalette[i],
                  borderTopLeftRadius:  radius ?? 0,
                  borderTopRightRadius: radius ?? 0,
                  overflow: 'hidden',
                },
              ]}
            >
              {isNearby ? (
                key === 'feed' ? (
                  <FeedScreen
                    onScrollTopChange={(atTop) => { feedScrollAtTop.current = atTop; }}
                    headerAnim={headerAnim}
                  />
                ) : (
                  <Component />
                )
              ) : (
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: bgPalette[i] },
                  ]}
                />
              )}
            </Animated.View>
          );
        })}
      </Animated.View>

      {/* Shared header overlay — profile pill (left) + MAHI (center) + messages (right).
          isDark=true forces white on Camera (always dark bg); other screens follow theme.
          headerAnim drives translateY so it slides off-screen when the feed scrolls down. */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          transform: [{
            translateY: headerAnim.interpolate({
              inputRange:  [0, APP_HEADER_H],
              outputRange: [0, -APP_HEADER_H],
              extrapolate: 'clamp',
            }),
          }],
        }}
        pointerEvents="box-none"
      >
        <AppHeader
          isDark={activeIndex === 0}
          onProfilePress={onNavigateLeft}
          onMessagesPress={onNavigateRight}
        />
      </Animated.View>

      {/* Navigation dots — vertical pill dots on the right edge.
          Camera screen always has a dark background, so always use white dots
          there. Other screens follow the current theme. */}
      <NavigationDots
        count={SCREENS.length}
        activeIndex={activeIndex}
        dark={activeIndex === 0 ? true : dark}
        icons={SCREEN_ICONS}
        onDotPress={navigateTo}
      />

      {/* Global search overlay — triggered by pull-down from Camera screen */}
      <GlobalSearchOverlay
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        dark={dark}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#111111',
  },
  tape: {
    // Total tape height: N screens each at SLOT_HEIGHT, plus one PEEK_HEIGHT
    // so the last screen can fill fully without clipping.
    height: SCREENS.length * SLOT_HEIGHT + PEEK_HEIGHT,
    width: SCREEN_WIDTH,
  },
  slot: {
    position: 'absolute',
    width: SCREEN_WIDTH,
    // Each slot is SCREEN_HEIGHT tall (SLOT_HEIGHT + PEEK_HEIGHT) so its
    // content fills its visible area and the peek area below it.
    height: SCREEN_HEIGHT,
  },
});
