import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/hooks/useAppTheme';
import NavigationDots from '@/components/NavigationDots';
import AppHeader from '@/components/AppHeader';
import GlobalSearchOverlay from '@/components/GlobalSearchOverlay';
import { CameraIcon, FeedIcon } from '@/components/ScreenIcons';
import CameraScreen from '@/screens/CameraScreen';
import FeedScreen from '@/screens/FeedScreen';
import NotificationsScreen from '@/screens/NotificationsScreen';
import UserProfileScreen from '@/screens/UserProfileScreen';
import { useNotificationsStore } from '@/store';
import { usePushRegistration } from '@/hooks/usePushRegistration';
import { usePushRouting } from '@/hooks/usePushRouting';
import { rubberBand, verticalRelease, verticalSwipe } from '@/lib/swipeRules';
import { COLORS, SIZE } from '@/constants/tokens';

// ─── Screen registry ──────────────────────────────────────────────────────────
// Ordered top → bottom. Index 0 (Camera) is the entry screen.
// Profile is not in the vertical tape — it lives in the horizontal layer.
const SCREENS = [
  { key: 'camera', Component: CameraScreen, Icon: CameraIcon },
  { key: 'feed', Component: FeedScreen, Icon: FeedIcon },
] as const;

const SCREEN_ICONS = SCREENS.map((s) => s.Icon);

// Background colour behind each screen in each theme mode.
const SCREEN_BG_DARK = [COLORS.ink, COLORS.bgDark] as const;
const SCREEN_BG_LIGHT = [COLORS.ink, COLORS.white] as const;

// ─── Props ────────────────────────────────────────────────────────────────────

/** Lets the right-hand rail move this tape. */
export type VerticalControl = { navigateTo: (index: number) => void };

interface VerticalNavigatorProps {
  controlRef?: React.RefObject<VerticalControl | null>;
  /** The glass rail is showing: hide the side dots and the header's Profile/Messages pills. */
  railShown?: boolean;
  onIndexChange?: (index: number) => void;
  onNavigateLeft: () => void; // tap profile pill or swipe right → Profile screen
  onNavigateRight: () => void; // tap messages icon or swipe left → Messages screen
  onOverlayChange?: (active: boolean) => void; // true when a fullscreen overlay is open
}

// ─── VerticalNavigator ────────────────────────────────────────────────────────

export default function VerticalNavigator({
  controlRef,
  railShown = false,
  onIndexChange,
  onNavigateLeft,
  onNavigateRight,
  onOverlayChange,
}: VerticalNavigatorProps): React.JSX.Element {
  const { dark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const insetsRef = useRef(insets);
  insetsRef.current = insets;
  // Each screen is one window tall. The pan handlers are made once, so they read it from a ref.
  const { width, height } = useWindowDimensions();
  const windowRef = useRef({ width, height });
  windowRef.current = { width, height };
  // AppHeader height = top inset + 36 pill + 12 padding. Used to slide it away on scroll.
  const appHeaderH = insets.top + SIZE.z48;
  const unreadNotifications = useNotificationsStore((s) => s.unreadCount);

  const [activeIndex, setActiveIndex] = useState(0);
  const [searchVisible, setSearchVisible] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  usePushRegistration();
  usePushRouting({
    openProfile: (uid) => {
      setNotifOpen(false);
      setProfileUserId(uid);
    },
    openNotifications: () => setNotifOpen(true),
    openCamera: () => {
      setNotifOpen(false);
      setProfileUserId(null);
      navigateTo(0);
    },
  });

  // Child overlay state (e.g. FeedScreen profile overlay) — state, so it always re-renders.
  const [feedOverlay, setFeedOverlay] = useState(false);

  // Tell the parent whenever a fullscreen overlay opens or closes; swipes stay off while one is.
  const overlayActive = searchVisible || notifOpen || !!profileUserId || feedOverlay;
  const overlayRef = useRef(false);
  overlayRef.current = overlayActive;
  useEffect(() => {
    onOverlayChange?.(overlayActive);
  }, [overlayActive]);
  const activeIndexRef = useRef(0);
  const baseOffsetRef = useRef(0);
  const feedScrollAtTop = useRef(true);
  const tapeAnim = useRef(new Animated.Value(0)).current;
  const headerAnim = useRef(new Animated.Value(0)).current;

  // Snap the tape to a target screen with a spring animation and haptic.
  const navigateTo = (index: number) => {
    setActiveIndex(index);
    activeIndexRef.current = index;
    onIndexChange?.(index);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(tapeAnim, {
      toValue: -(index * windowRef.current.height),
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

  if (controlRef) controlRef.current = { navigateTo };

  const panResponder = useRef(
    PanResponder.create({
      // Claim clear vertical swipes (see swipeRules); horizontal ones pass to HorizontalNavigator.
      // On Feed only a pull down from the top of the list goes back to Camera.
      // x0/y0 aren't set until the grant, so the start point is where the finger is minus how far it moved.
      onMoveShouldSetPanResponder: (_e, { moveX, moveY, dx, dy }) =>
        verticalSwipe({
          startX: moveX - dx,
          startY: moveY - dy,
          dx,
          dy,
          width: windowRef.current.width,
          height: windowRef.current.height,
          insets: insetsRef.current,
          blocked: overlayRef.current,
          onFeed: activeIndexRef.current === 1,
          feedAtTop: feedScrollAtTop.current,
        }) === 'activate',

      onPanResponderGrant: () => {
        tapeAnim.stopAnimation();
        baseOffsetRef.current = -(activeIndexRef.current * windowRef.current.height);
      },

      onPanResponderMove: (_e, { dy }) => {
        const min = -((SCREENS.length - 1) * windowRef.current.height);
        // Rubber-band resistance at the first and last screens
        tapeAnim.setValue(rubberBand(baseOffsetRef.current + dy, min, 0));
      },

      onPanResponderRelease: (_e, { dy, vy }) => {
        const { index, openSearch } = verticalRelease(
          activeIndexRef.current,
          SCREENS.length,
          dy,
          vy
        );
        navigateTo(index);
        // Pull down on Camera opens search; the tape snaps back to Camera first.
        if (openSearch) setSearchVisible(true);
      },

      // Snap back if the system takes the touch mid-swipe.
      onPanResponderTerminate: () => navigateTo(activeIndexRef.current),
    })
  ).current;

  // ─── Rounded top corners on the way in ─────────────────────────────────────
  // Each screen slot (index > 0) slides up from the bottom with rounded top
  // corners; as it becomes the active screen the corners collapse to 0, giving
  // a "morphing into the screen" feel.
  //
  // Derivation per slot i (i > 0):
  //   • tapeAnim = -(i-1)*height  → slot i is just below the screen → radius 40
  //   • tapeAnim =  -i   *height  → slot i is fully active          → radius 0
  //
  // tapeAnim is used with useNativeDriver:true for translateY, and with
  // useNativeDriver:false here for borderRadius — both are supported in RN.
  const borderRadii = useMemo(
    () =>
      SCREENS.map((_, i) =>
        i === 0
          ? null // Camera is always at the top — no rounded entry needed
          : tapeAnim.interpolate({
              inputRange: [-i * height, -(i - 1) * height],
              outputRange: [0, 40],
              extrapolate: 'clamp',
            })
      ),
    [height]
  );

  const bgPalette = dark ? SCREEN_BG_DARK : SCREEN_BG_LIGHT;

  return (
    <View style={styles.root} {...panResponder.panHandlers}>
      {/* Tape — all screens stacked vertically, translated by tapeAnim */}
      <Animated.View
        style={{ height: SCREENS.length * height, width, transform: [{ translateY: tapeAnim }] }}
      >
        {SCREENS.map(({ key, Component }, i) => {
          const radius = borderRadii[i];

          return (
            <Animated.View
              key={key}
              style={[
                styles.slot,
                {
                  width,
                  height,
                  top: i * height,
                  backgroundColor: bgPalette[i],
                  borderTopLeftRadius: radius ?? 0,
                  borderTopRightRadius: radius ?? 0,
                  overflow: 'hidden',
                },
              ]}
            >
              {key === 'feed' ? (
                <FeedScreen
                  onGoToCamera={() => navigateTo(0)}
                  onScrollTopChange={(atTop) => {
                    feedScrollAtTop.current = atTop;
                  }}
                  headerAnim={headerAnim}
                  onOverlayChange={setFeedOverlay}
                />
              ) : (
                <Component />
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
          transform: [
            {
              translateY: headerAnim.interpolate({
                inputRange: [0, appHeaderH],
                outputRange: [0, -appHeaderH],
                extrapolate: 'clamp',
              }),
            },
          ],
        }}
        pointerEvents="box-none"
      >
        <AppHeader
          isDark={activeIndex === 0}
          onProfilePress={onNavigateLeft}
          onMessagesPress={onNavigateRight}
          showNavPills={!railShown}
          unreadNotifications={unreadNotifications}
          onNotificationsPress={() => setNotifOpen(true)}
        />
      </Animated.View>

      {/* Notifications overlay — sibling of the header Animated.View so it is
          NOT affected by the hide-on-scroll transform. */}
      <NotificationsScreen
        visible={notifOpen}
        onClose={() => setNotifOpen(false)}
        onOpenPost={(_postId) => {
          setNotifOpen(false);
          // v1 no-op: FeedScreen scroll-to-post is a follow-up
        }}
        onOpenProfile={(uid) => {
          setNotifOpen(false);
          setProfileUserId(uid);
        }}
      />

      {/* Full-screen profile — opened from notifications */}
      {profileUserId ? (
        <UserProfileScreen
          key={profileUserId}
          userId={profileUserId}
          onBack={() => setProfileUserId(null)}
          dark={dark}
        />
      ) : null}

      {/* Navigation dots — vertical pill dots on the right edge.
          Camera screen always has a dark background, so always use white dots
          there. Other screens follow the current theme. */}
      {railShown ? null : (
        <NavigationDots
          count={SCREENS.length}
          activeIndex={activeIndex}
          dark={activeIndex === 0 ? true : dark}
          icons={SCREEN_ICONS}
          onDotPress={navigateTo}
        />
      )}

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
    backgroundColor: COLORS.ink,
  },
  slot: {
    position: 'absolute',
  },
});
