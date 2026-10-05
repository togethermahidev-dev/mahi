import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated as RNAnimated, Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { BlurTargetView } from 'expo-blur';
import { haptic } from '@/lib/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CameraScreen from '@/screens/CameraScreen';
import FeedScreen from '@/screens/FeedScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import MessagesScreen from '@/screens/MessagesScreen';
import NotificationsScreen from '@/screens/NotificationsScreen';
import UserProfileScreen from '@/screens/UserProfileScreen';
import AppHeader from '@/components/AppHeader';
import GlobalSearchOverlay from '@/components/GlobalSearchOverlay';
import NavRail, { type RailTab } from '@/components/NavRail';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useAppTheme } from '@/hooks/useAppTheme';
import { usePushRegistration } from '@/hooks/usePushRegistration';
import { usePushRouting } from '@/hooks/usePushRouting';
import { useChromeStore, useNotificationsStore } from '@/store';
import { usePageSize } from '@/hooks/useChrome';
import { SWIPE_PAGES, pageTab, tabPage } from '@/lib/nativeTabs';
import { railShows } from '@/lib/railSelector';
import { horizontalRelease, horizontalSwipe, rubberBand, type Rect } from '@/lib/swipeRules';
import { COLORS, SIZE, LAYER } from '@/constants/tokens';

// ─── Pages ────────────────────────────────────────────────────────────────────
// One row, left to right (founder, 2026-10-05): Camera ⇄ Feed ⇄ Profile. Sideways only — no
// up/down swiping. Messages is not a swipe page: its tab, the rail or the header button opens it
// over the pages.
const PAGE_COUNT = SWIPE_PAGES.length;
const CAMERA = 0;
const FEED = 1;
const PROFILE = 2;

/** The snap to a page. Runs even with Reduce Motion on, as it always has. */
const SPRING = { damping: 22, stiffness: 160, mass: 0.9, reduceMotion: ReduceMotion.Never };

// ─── HorizontalNavigator ──────────────────────────────────────────────────────

/**
 * With the phone's tab bar (build 12+, TabsNavigator): the bar replaces the glass rail and the
 * header's Profile / Messages pills; the swipes stay exactly as they are.
 */
export type TabBarLink = {
  /** The page showing changed (a swipe, or a tap that moved the pages). */
  onTabChange: (tab: RailTab) => void;
  /** Filled with the way to move the pages to a tab, for the bar's taps. */
  selectRef: React.MutableRefObject<((tab: RailTab) => void) | null>;
  /** The Camera's post preview opened or closed (the bar hides under it). */
  onComposingChange: (open: boolean) => void;
};

export default function HorizontalNavigator({
  tabBar,
}: { tabBar?: TabBarLink } = {}): React.JSX.Element {
  const showRail = useFeatureFlag('nav-glass-rail') && !tabBar;
  const railMorph = useFeatureFlag('nav-rail-morph');
  const { dark } = useAppTheme();
  const insets = useSafeAreaInsets();
  // Each page is one page wide: the window, or with the tab bar the space above it.
  const { width, height } = usePageSize();
  const unreadNotifications = useNotificationsStore((s) => s.unreadCount);

  const [index, setIndex] = useState(CAMERA);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  // A full-screen view inside the Feed (someone's profile).
  const [feedOverlay, setFeedOverlay] = useState(false);

  // Something is open over the pages: they must not move under it.
  const overlay = searchVisible || notifOpen || !!profileUserId || feedOverlay || messagesOpen;
  const tab: RailTab = pageTab(index, messagesOpen);
  // A full-screen view the rail would sit on (someone's profile, search) hides it too.
  const covered = useChromeStore((s) => s.covers > 0);
  const railShown = railShows({ on: showRail, tab, overlay, covered });
  const blurTargetRef = useRef<View | null>(null);

  // The Feed header slides away as the list scrolls down.
  const headerAnim = useRef(new RNAnimated.Value(0)).current;
  const headerH = insets.top + SIZE.z48;

  // What the swipe reads on the UI thread.
  const indexSV = useSharedValue(CAMERA);
  const blockedSV = useSharedValue(false);
  useEffect(() => {
    blockedSV.value = overlay;
  }, [overlay, blockedSV]);
  // Where the strip sits, in pages (0 = Camera); fractional mid-swipe.
  const page = useSharedValue(CAMERA);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const decided = useSharedValue(false);
  const base = useSharedValue(0);
  // nav-rail-morph: where the rail is on screen. A touch that starts there belongs to the rail.
  const railRectSV = useSharedValue<Rect | null>(null);
  const railOwnsTouches = railShown && railMorph;
  useEffect(() => {
    if (!railOwnsTouches) railRectSV.value = null;
  }, [railOwnsTouches, railRectSV]);

  // Messages slides in over the pages from the right (0 = showing, 1 = off to the right).
  const messagesX = useSharedValue(1);

  // The tab bar follows the pages.
  const onTabChange = tabBar?.onTabChange;
  useEffect(() => {
    onTabChange?.(tab);
  }, [tab, onTabChange]);

  // The strip has been sent to `next`: record it, tick, and bring the header back off Feed.
  const settle = (next: number) => {
    setIndex(next);
    indexSV.value = next;
    haptic('tick');
    if (next !== FEED) headerAnim.setValue(0);
  };

  const navigate = (next: number) => {
    settle(next);
    page.value = withSpring(next, SPRING);
  };

  const openMessages = () => {
    if (messagesOpen) return;
    setMessagesOpen(true);
    haptic('tick');
    messagesX.value = withSpring(0, SPRING);
  };
  const closeMessages = () => {
    if (!messagesOpen) return;
    setMessagesOpen(false);
    messagesX.value = withSpring(1, SPRING);
  };

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
      closeMessages();
      navigate(CAMERA);
    },
    openMessages: () => {
      setNotifOpen(false);
      setProfileUserId(null);
      openMessages();
    },
  });

  // The lists' scrolling as gestures, so a sideways swipe on them still moves the pages: a
  // vertical list starts tracking after ~10pt of movement, before this swipe decides at 20pt.
  const feedList = useMemo(() => Gesture.Native(), []);
  const profileList = useMemo(() => Gesture.Native(), []);

  const safeInsets = { top: insets.top, bottom: insets.bottom };

  // Take clear sideways swipes (see swipeRules); up/down ones are left to the lists. Runs on the
  // UI thread.
  const swipe = Gesture.Pan()
    .manualActivation(true)
    .simultaneousWithExternalGesture(feedList, profileList)
    .onTouchesDown((e, manager) => {
      'worklet';
      const t = e.changedTouches[0];
      if (e.numberOfTouches !== 1 || !t) return;
      startX.value = t.absoluteX;
      startY.value = t.absoluteY;
      decided.value = false;
      // A touch in a system strip, or with something open over the pages, is let go at once.
      const first = horizontalSwipe({
        startX: t.absoluteX,
        startY: t.absoluteY,
        dx: 0,
        dy: 0,
        width,
        height,
        insets: safeInsets,
        blocked: blockedSV.value,
        exclude: railRectSV.value,
      });
      if (first === 'fail') {
        decided.value = true;
        manager.fail();
      }
    })
    .onTouchesMove((e, manager) => {
      'worklet';
      const t = e.allTouches[0];
      if (decided.value || !t) return;
      const decision = horizontalSwipe({
        startX: startX.value,
        startY: startY.value,
        dx: t.absoluteX - startX.value,
        dy: t.absoluteY - startY.value,
        width,
        height,
        insets: safeInsets,
        blocked: blockedSV.value,
      });
      if (decision === 'wait') return;
      decided.value = true;
      if (decision === 'activate') manager.activate();
      else manager.fail();
    })
    .onStart(() => {
      'worklet';
      cancelAnimation(page);
      base.value = indexSV.value;
    })
    .onUpdate((e) => {
      'worklet';
      // Follows the finger; rubber-band resistance past Camera and Profile.
      page.value = rubberBand(base.value - (e.absoluteX - startX.value) / width, 0, PAGE_COUNT - 1);
    })
    .onEnd((e, success) => {
      'worklet';
      // Cut short (the phone took the touch): snap back to the page it started on.
      const next = success
        ? horizontalRelease(indexSV.value, PAGE_COUNT, e.absoluteX - startX.value, e.velocityX / 1000)
        : indexSV.value;
      indexSV.value = next;
      page.value = withSpring(next, SPRING);
      scheduleOnRN(settle, next);
    });

  const stripStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -page.value * width }] }));
  const messagesStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: messagesX.value * width }],
  }));

  // A tab (the phone's bar or the rail): Messages opens over the pages, the rest move them.
  const selectTab = (next: RailTab) => {
    const target = tabPage(next);
    if (target === null) return openMessages();
    closeMessages();
    // indexSV, not index: a drag along the rail can switch twice before the next render.
    if (indexSV.value !== target) navigate(target);
  };
  if (tabBar) tabBar.selectRef.current = selectTab;

  // Android blurs a BlurTargetView's content; iOS blurs whatever is behind natively.
  const Strip = Platform.OS === 'android' ? BlurTargetView : View;
  const pageStyle = { width, height };
  // The Profile / Messages pills, unless the rail or the phone's tab bar carries them.
  const showNavPills = !showRail && !tabBar;

  const header = (onCamera: boolean) => (
    <AppHeader
      isDark={onCamera}
      onProfilePress={() => selectTab('profile')}
      onMessagesPress={openMessages}
      showNavPills={showNavPills}
      unreadNotifications={unreadNotifications}
      onNotificationsPress={() => setNotifOpen(true)}
    />
  );

  return (
    <GestureDetector gesture={swipe}>
      <View style={styles.root}>
        <Strip ref={blurTargetRef} style={styles.root}>
          <Animated.View style={[styles.strip, { width: width * PAGE_COUNT }, stripStyle]}>
            {/* Camera — the entry page, always dark. */}
            <View style={[styles.page, pageStyle, { backgroundColor: COLORS.ink }]}>
              <CameraScreen onComposingChange={tabBar?.onComposingChange} />
              <View pointerEvents="box-none" style={styles.header}>
                {header(true)}
              </View>
            </View>

            {/* Feed — its header slides away as the list scrolls down. */}
            <View
              style={[
                styles.page,
                pageStyle,
                { backgroundColor: dark ? COLORS.bgDark : COLORS.white },
              ]}
            >
              <FeedScreen
                onGoToCamera={() => navigate(CAMERA)}
                onFindFriends={() => setSearchVisible(true)}
                headerAnim={headerAnim}
                onOverlayChange={setFeedOverlay}
                listGesture={feedList}
                isActive={index === FEED && !messagesOpen}
              />
              <RNAnimated.View
                pointerEvents="box-none"
                style={[
                  styles.header,
                  {
                    transform: [
                      {
                        translateY: headerAnim.interpolate({
                          inputRange: [0, headerH],
                          outputRange: [0, -headerH],
                          extrapolate: 'clamp',
                        }),
                      },
                    ],
                  },
                ]}
              >
                {header(false)}
              </RNAnimated.View>
            </View>

            {/* Profile — always mounted; `isActive` re-syncs its posts when it comes into view. */}
            <View style={[styles.page, pageStyle]}>
              <ProfileScreen
                isActive={index === PROFILE && !messagesOpen}
                listGesture={profileList}
              />
            </View>
          </Animated.View>
        </Strip>

        {/* Messages, over the pages. Always mounted, so it keeps its place and stays live. */}
        <Animated.View
          pointerEvents={messagesOpen ? 'auto' : 'none'}
          style={[styles.messages, messagesStyle]}
        >
          <MessagesScreen onBack={closeMessages} />
        </Animated.View>

        {railShown ? (
          <NavRail
            active={tab}
            onSelect={selectTab}
            onDark
            blurTarget={Platform.OS === 'android' ? blurTargetRef : undefined}
            morph={railMorph}
            onRect={
              railMorph
                ? (rect) => {
                    railRectSV.value = rect;
                  }
                : undefined
            }
          />
        ) : null}

        <NotificationsScreen
          visible={notifOpen}
          onClose={() => setNotifOpen(false)}
          onOpenPost={() => setNotifOpen(false)}
          onOpenProfile={(uid) => {
            setNotifOpen(false);
            setProfileUserId(uid);
          }}
        />

        {/* Someone's profile, from a notification or a push. */}
        {profileUserId ? (
          <UserProfileScreen
            key={profileUserId}
            userId={profileUserId}
            onBack={() => setProfileUserId(null)}
            dark={dark}
          />
        ) : null}

        {/* People search — "Find friends" on an empty feed. */}
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
  },
  strip: {
    flexDirection: 'row',
    flex: 1,
  },
  page: {
    overflow: 'hidden',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: LAYER.header,
  },
  messages: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: LAYER.raised,
  },
});
