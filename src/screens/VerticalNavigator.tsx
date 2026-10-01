import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, type NativeGesture } from 'react-native-gesture-handler';
import Reanimated, {
  Extrapolation,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
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
import { atListTop, rubberBand, verticalRelease, verticalSwipe } from '@/lib/swipeRules';
import { COLORS, RADIUS, SIZE } from '@/constants/tokens';

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

/** The snap to a screen. Runs even with Reduce Motion on, as it always has. */
const SPRING = { damping: 22, stiffness: 160, mass: 0.9, reduceMotion: ReduceMotion.Never };

// ─── Slot ─────────────────────────────────────────────────────────────────────

/**
 * One screen on the tape, one window tall. A screen below Camera slides up with rounded top
 * corners that flatten as it arrives: radius 40 while it sits just below the screen above,
 * 0 once it is the active screen ("morphing into the screen").
 */
function Slot({
  index,
  page,
  width,
  height,
  backgroundColor,
  children,
}: {
  index: number;
  /** Where the tape sits, in screens (0 = Camera). */
  page: SharedValue<number>;
  width: number;
  height: number;
  backgroundColor: string;
  children: React.ReactNode;
}) {
  const corners = useAnimatedStyle(() => {
    // Camera is always at the top: no rounded entry.
    const radius =
      index === 0
        ? 0
        : interpolate(page.value, [index - 1, index], [RADIUS.r40, 0], Extrapolation.CLAMP);
    return { borderTopLeftRadius: radius, borderTopRightRadius: radius };
  });
  return (
    <Reanimated.View
      style={[styles.slot, { width, height, top: index * height, backgroundColor }, corners]}
    >
      {children}
    </Reanimated.View>
  );
}

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
  /** The Feed list's scrolling as a gesture, made by HorizontalNavigator so its sideways
   *  swipe can run alongside the list too. */
  feedList: NativeGesture;
}

// ─── VerticalNavigator ────────────────────────────────────────────────────────

export default function VerticalNavigator({
  controlRef,
  railShown = false,
  onIndexChange,
  onNavigateLeft,
  onNavigateRight,
  onOverlayChange,
  feedList,
}: VerticalNavigatorProps): React.JSX.Element {
  const { dark } = useAppTheme();
  const insets = useSafeAreaInsets();
  // Each screen is one window tall.
  const { width, height } = useWindowDimensions();
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
  // What the swipe reads on the UI thread.
  const indexSV = useSharedValue(0);
  const blockedSV = useSharedValue(false);
  useEffect(() => {
    blockedSV.value = overlayActive;
    onOverlayChange?.(overlayActive);
  }, [overlayActive]);
  const headerAnim = useRef(new Animated.Value(0)).current;

  // Where the tape sits, in screens (0 = Camera); fractional mid-swipe.
  const page = useSharedValue(0);
  // Where the finger went down, and where it was when the swipe took the drag: the tape follows
  // the finger from that point, and the release distance is measured from it.
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const grabY = useSharedValue(0);
  const decided = useSharedValue(false);
  const base = useSharedValue(0);
  // The Feed list (`feedList`, its scrolling as a gesture — this swipe runs alongside it), how
  // far it is scrolled, and how far it was when the finger went down.
  const feedOffset = useSharedValue(0);
  const feedOffsetAtDown = useSharedValue(0);

  // The tape has been sent to `index`: record it, tick, and bring the header back off Feed.
  const settle = (index: number, openSearch = false) => {
    setActiveIndex(index);
    indexSV.value = index;
    onIndexChange?.(index);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (index !== 1) {
      headerAnim.setValue(0);
    }
    // Pull down on Camera opens search; the tape snaps back to Camera first.
    if (openSearch) setSearchVisible(true);
  };

  // Snap the tape to a target screen with a spring animation and haptic.
  const navigateTo = (index: number) => {
    settle(index);
    page.value = withSpring(index, SPRING);
  };

  if (controlRef) controlRef.current = { navigateTo };

  const safeInsets = { top: insets.top, bottom: insets.bottom };

  // Take clear up/down swipes (see swipeRules); sideways ones are left to HorizontalNavigator.
  // On Feed only a pull down from the top of the list goes back to Camera. The swipe runs
  // alongside the list's own scrolling, so the list can start moving first; once it has moved
  // under the finger the drag stays with the list. Runs on the UI thread.
  const swipe = Gesture.Pan()
    .manualActivation(true)
    .simultaneousWithExternalGesture(feedList)
    .onTouchesDown((e) => {
      'worklet';
      const t = e.changedTouches[0];
      if (e.numberOfTouches !== 1 || !t) return;
      startX.value = t.absoluteX;
      startY.value = t.absoluteY;
      decided.value = false;
      feedOffsetAtDown.value = feedOffset.value;
    })
    .onTouchesMove((e, manager) => {
      'worklet';
      const t = e.allTouches[0];
      if (decided.value || !t) return;
      const onFeed = indexSV.value === 1;
      const listMoved = feedOffset.value !== feedOffsetAtDown.value;
      const decision = verticalSwipe({
        startX: startX.value,
        startY: startY.value,
        dx: t.absoluteX - startX.value,
        dy: t.absoluteY - startY.value,
        width,
        height,
        insets: safeInsets,
        blocked: blockedSV.value,
        onFeed,
        feedAtTop: atListTop(feedOffset.value),
        listMoved,
      });
      if (decision === 'activate') {
        decided.value = true;
        grabY.value = t.absoluteY;
        manager.activate();
      } else if (onFeed && listMoved) {
        decided.value = true;
        manager.fail();
      }
      // Otherwise it is asked again on the next move: a drag can still turn into a swipe.
    })
    .onStart(() => {
      'worklet';
      cancelAnimation(page);
      base.value = indexSV.value;
    })
    .onUpdate((e) => {
      'worklet';
      // Follows the finger; rubber-band resistance past Camera and Feed.
      page.value = rubberBand(
        base.value - (e.absoluteY - grabY.value) / height,
        0,
        SCREENS.length - 1
      );
    })
    .onEnd((e, success) => {
      'worklet';
      // Cut short (the phone took the touch): snap back to the screen it started on.
      const { index, openSearch } = success
        ? verticalRelease(
            indexSV.value,
            SCREENS.length,
            e.absoluteY - grabY.value,
            e.velocityY / 1000
          )
        : { index: indexSV.value, openSearch: false };
      indexSV.value = index;
      page.value = withSpring(index, SPRING);
      scheduleOnRN(settle, index, openSearch);
    });

  const tapeStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -page.value * height }] }));

  const bgPalette = dark ? SCREEN_BG_DARK : SCREEN_BG_LIGHT;

  return (
    <GestureDetector gesture={swipe}>
      <View style={styles.root}>
        {/* Tape — all screens stacked vertically, moved by `page` */}
        <Reanimated.View style={[{ height: SCREENS.length * height, width }, tapeStyle]}>
          {SCREENS.map(({ key, Component }, i) => (
            <Slot
              key={key}
              index={i}
              page={page}
              width={width}
              height={height}
              backgroundColor={bgPalette[i]}
            >
              {key === 'feed' ? (
                <FeedScreen
                  onGoToCamera={() => navigateTo(0)}
                  headerAnim={headerAnim}
                  onOverlayChange={setFeedOverlay}
                  listGesture={feedList}
                  listOffset={feedOffset}
                />
              ) : (
                <Component />
              )}
            </Slot>
          ))}
        </Reanimated.View>

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
    </GestureDetector>
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
    overflow: 'hidden',
  },
});
