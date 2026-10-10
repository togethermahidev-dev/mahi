import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  type AccessibilityActionEvent,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { BlurTargetView } from 'expo-blur';
import { haptic } from '@/lib/haptics';
import { usePageMorphStyle } from '@/components/MorphTransition';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CAMERA_CONTROLS_TOP } from '@/screens/CameraScreen';
import CameraFeedPage from '@/screens/CameraFeedPage';
import ProfileScreen from '@/screens/ProfileScreen';
import MessagesScreen from '@/screens/MessagesScreen';
import NotificationsScreen from '@/screens/NotificationsScreen';
import UserProfileScreen from '@/screens/UserProfileScreen';
import AppHeader from '@/components/AppHeader';
import GlobalSearchOverlay from '@/components/GlobalSearchOverlay';
import NavRail, { type RailTab } from '@/components/NavRail';
import { useAppTheme } from '@/hooks/useAppTheme';
import { usePushRegistration } from '@/hooks/usePushRegistration';
import { usePushRouting } from '@/hooks/usePushRouting';
import { useSharedPhotos } from '@/hooks/useSharedPhotos';
import { useAppActions } from '@/hooks/useAppActions';
import { useCameraRequestStore, type CameraRequest } from '@/store/cameraRequestStore';
import PostViewer from '@/components/PostViewer';
import CoachMarkHost from '@/components/CoachMark';
import { useCoachBlock, useOpenTagReminder } from '@/hooks/useCoachMarks';
import { useCoachStore } from '@/store/coachStore';
import { useAuthStore, useChromeStore, useNotificationsStore, useProfilePostsStore } from '@/store';
import { useToastStore } from '@/store/toastStore';
import { TabBarRoomContext, usePageSize } from '@/hooks/useChrome';
import { INITIAL_TAB, SWIPE_PAGES, pageTab, tabPage, tabTap } from '@/lib/nativeTabs';
import { pageActions, pageForAction, pageTitle } from '@/lib/pageActions';
import { dockShows, railShows } from '@/lib/railSelector';
import {
  horizontalRelease,
  horizontalSwipe,
  rubberBand,
  SIDE_EDGE,
  type Rect,
} from '@/lib/swipeRules';
import { COLORS, LAYER, LAYOUT, MOTION, SIZE, SPRING } from '@/constants/tokens';

// ─── Pages ────────────────────────────────────────────────────────────────────
// One row, left to right, in the tab bar's order (owner, 2026-10-07): Messages ⇄ Feed ⇄ Camera ⇄
// Profile. Sideways only — no up/down swiping. Camera remains the entry page.
const PAGE_COUNT = SWIPE_PAGES.length;
const CAMERA = tabPage('camera');
const PROFILE = tabPage('profile');
const MESSAGES = tabPage('messages');
const INITIAL_PAGE = tabPage(INITIAL_TAB);

/** The snap to a page. Runs even with Reduce Motion on, as it always has. */
const PAGE_SPRING = { ...SPRING.page, reduceMotion: ReduceMotion.Never };

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
  const showRail = !tabBar;
  const { dark, navRail } = useAppTheme();
  const insets = useSafeAreaInsets();
  // Each page is one page wide: the window, or with the tab bar the space above it.
  const { width, height } = usePageSize();
  const window = useWindowDimensions();

  // With the glass rail on, Feed, Profile and Messages have the same glass bar along the bottom
  // (the dock) for a tap to every page. Like Apple's floating bar, their last post, row and
  // caption keep this room clear of it; the room stays the same while the dock hides, so nothing
  // jumps. null = no dock (the rail is off, or the phone's own tab bar is there).
  const dockRoom = showRail ? insets.bottom + navRail.edgeGap + navRail.width : null;
  // While the post preview is up (the bar hides), toasts go to the top, clear of its Post button.
  const onComposingChange = tabBar?.onComposingChange;
  const handleComposingChange = useCallback(
    (open: boolean) => {
      onComposingChange?.(open);
      useToastStore.getState().setRoom({ top: open });
      useCoachStore.getState().setComposing(open);
    },
    [onComposingChange]
  );
  const unreadNotifications = useNotificationsStore((s) => s.unreadCount);

  const [index, setIndex] = useState(INITIAL_PAGE);
  // On the Camera page, toasts keep clear of its shutter row and lens switch.
  useEffect(() => {
    useToastStore.getState().setRoom({ camera: index === CAMERA ? CAMERA_CONTROLS_TOP : 0 });
    return () => useToastStore.getState().setRoom({ camera: 0 });
  }, [index]);
  const [searchVisible, setSearchVisible] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  // A full-screen view inside the Feed (someone's profile).
  const [feedOverlay, setFeedOverlay] = useState(false);
  // Counts taps on Camera while the camera page is showing; each one closes the feed.
  const [cameraHome, setCameraHome] = useState(0);
  // A post opened from a notification (a comment one with its comments up), and whether the notifications sheet is still on screen
  // (iPhone won't show a new full-screen view while a sheet is sliding away).
  const [viewer, setViewer] = useState<{
    ownerId: string;
    postId: string;
    comments: boolean;
  } | null>(null);
  const [notifShown, setNotifShown] = useState(false);
  useEffect(() => {
    if (notifOpen) setNotifShown(true);
    // Android has no "dismissed" moment: the sheet is gone as soon as it closes.
    else if (Platform.OS !== 'ios') setNotifShown(false);
  }, [notifOpen]);

  // Something is open over the pages: they must not move under it.
  const overlay = searchVisible || notifOpen || !!profileUserId || feedOverlay || !!viewer;
  const tab: RailTab = pageTab(index);
  // A full-screen view the rail would sit on (someone's profile, search) hides it too.
  const covered = useChromeStore((s) => s.covers > 0);
  // A post's photo being pinched holds the pages still.
  const zooming = useChromeStore((s) => s.zooming);
  const railShown = railShows({ on: showRail, tab, overlay, covered });
  const dockShown = dockShows({ on: showRail, tab, overlay, covered });

  // One-time tips follow the page on screen and wait while anything is open over the pages; the
  // tag reminder shows once per app open, away from the camera.
  useEffect(() => {
    useCoachStore.getState().setPage(tab);
  }, [tab]);
  useCoachBlock(overlay || covered);

  // Toasts sit above the phone's tab bar (the room it takes is what the pages leave below them),
  // or above the dock while it shows.
  const tabBarRoom = tabBar
    ? Math.max(0, window.height - height)
    : dockShown && dockRoom !== null
      ? dockRoom
      : 0;
  useEffect(() => {
    useToastStore.getState().setRoom({ tabBar: tabBarRoom });
    return () => useToastStore.getState().setRoom({ tabBar: 0 });
  }, [tabBarRoom]);
  const blurTargetRef = useRef<View | null>(null);


  // What the swipe reads on the UI thread.
  const indexSV = useSharedValue(INITIAL_PAGE);
  const blockedSV = useSharedValue(false);
  useEffect(() => {
    blockedSV.value = overlay || zooming;
  }, [overlay, zooming, blockedSV]);
  // Where the strip sits, in pages (Camera is the entry page); fractional mid-swipe.
  const page = useSharedValue(INITIAL_PAGE);
  // A tap on a tab (or a button that opens a page) grows the page in where it is, Netflix-style,
  // from the shared morph value (owner, 2026-10-08); only a swipe slides the strip.
  const pageMorph = useSharedValue(1);
  const entering = useSharedValue(-1);
  const reduceMotion = useReducedMotion();
  const morphStyles = {
    messages: usePageMorphStyle(pageMorph, entering, MESSAGES),
    camera: usePageMorphStyle(pageMorph, entering, CAMERA),
    profile: usePageMorphStyle(pageMorph, entering, PROFILE),
  };
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const decided = useSharedValue(false);
  const base = useSharedValue(0);
  // Where the rail is on screen. A touch that starts there belongs to the rail.
  const railRectSV = useSharedValue<Rect | null>(null);
  const railOwnsTouches = railShown;
  useEffect(() => {
    if (!railOwnsTouches) railRectSV.value = null;
  }, [railOwnsTouches, railRectSV]);

  // The tab bar follows the pages.
  const onTabChange = tabBar?.onTabChange;
  useEffect(() => {
    onTabChange?.(tab);
  }, [tab, onTabChange]);

  // The strip has been sent to `next`: record it and tick.
  const settle = (next: number) => {
    setIndex(next);
    indexSV.value = next;
    haptic('tick');
  };

  const navigate = (next: number, how: 'slide' | 'morph' = 'slide') => {
    const from = indexSV.value;
    settle(next);
    if (how === 'morph' && !reduceMotion && from !== next) {
      page.value = next;
      entering.value = next;
      pageMorph.value = 0;
      pageMorph.value = withSpring(1, MOTION.morph, (finished) => {
        if (finished) entering.value = -1;
      });
      return;
    }
    page.value = withSpring(next, PAGE_SPRING);
  };

  // A notification about a post opens that post full screen. The post viewer pages through one
  // person's posts from the shared profile-posts list and picks its start post once, so that
  // list is read for the post's owner first; a post that's locked or gone gets a toast instead.
  const myId = useAuthStore((s) => s.user?.id);
  const openPostFromNotification = async (ownerId: string, postId: string, comments: boolean) => {
    const posts = useProfilePostsStore;
    const settled = () =>
      new Promise<void>((resolve) => {
        if (!posts.getState().isSyncing) return resolve();
        const stop = posts.subscribe((s) => {
          if (s.isSyncing) return;
          stop();
          resolve();
        });
      });
    await settled();
    await posts.getState().sync(ownerId, true);
    await settled();
    const find = () => posts.getState().posts.find((p) => p.id === postId);
    // An older post may be a page or two further down.
    for (let page = 0; page < LAYOUT.viewerExtraPages && !find(); page++) {
      const s = posts.getState();
      if (!s.hasMore || s.userId !== ownerId) break;
      await s.loadMore(ownerId);
    }
    const toast = useToastStore.getState().show;
    const s = posts.getState();
    if (s.userId !== ownerId || s.lastSyncedAt === null) {
      toast('Couldn’t open that post. Try again.');
      return;
    }
    const post = find();
    if (!post) toast('That post isn’t available any more.');
    else if (!post.image_url) toast('Opens when you answer a friend’s tag.');
    else setViewer({ ownerId, postId, comments });
  };
  const closeViewer = () => {
    // Put your own posts back in the shared list for the Profile page.
    if (viewer && myId && viewer.ownerId !== myId) {
      void useProfilePostsStore.getState().sync(myId, true);
    }
    setViewer(null);
  };

  usePushRegistration();
  // The tag reminder's Answer goes to the camera, as a tag's push does.
  useOpenTagReminder(() => {
    setNotifOpen(false);
    setProfileUserId(null);
    navigate(CAMERA);
  });
  usePushRouting({
    openProfile: (uid) => {
      setNotifOpen(false);
      setProfileUserId(uid);
    },
    openNotifications: () => setNotifOpen(true),
    openCamera: () => {
      setNotifOpen(false);
      setProfileUserId(null);
      navigate(CAMERA);
    },
    openMessages: () => {
      setNotifOpen(false);
      setProfileUserId(null);
      navigate(MESSAGES);
    },
  });
  // Photos shared from Photos land on the Camera page as the shots (switch `share-to-mahi`).
  useSharedPhotos(() => {
    setNotifOpen(false);
    setProfileUserId(null);
    navigate(CAMERA);
  });
  // The iPhone extras (Control Centre button, Spotlight): each opens its page if its switch is
  // on. Your invites and Find friends in your contacts open over the Camera page, where they live.
  const toCamera = (request?: CameraRequest) => {
    setNotifOpen(false);
    setProfileUserId(null);
    navigate(CAMERA);
    if (request) useCameraRequestStore.getState().ask(request);
  };
  useAppActions({
    camera: () => toCamera(),
    invites: () => toCamera({ kind: 'invites' }),
    'find-mates': () => toCamera({ kind: 'find-mates' }),
  });

  // The lists' scrolling as gestures, so a sideways swipe on them still moves the pages: a
  // vertical list starts tracking after ~10pt of movement, before this swipe decides at 20pt.
  const feedList = useMemo(() => Gesture.Native(), []);
  const profileList = useMemo(() => Gesture.Native(), []);
  const messagesList = useMemo(() => Gesture.Native(), []);

  const safeInsets = { top: insets.top, bottom: insets.bottom };
  // With the phone's tab bar the pages end above it: their bottom is a post's name and caption.
  const aboveTabBar = !!tabBar;
  // Android keeps its side edges for the phone's back gesture; an iPhone's edges are screen.
  const sideEdge = Platform.OS === 'android' ? SIDE_EDGE : 0;

  // Take clear sideways swipes (see swipeRules); up/down ones are left to the lists. Runs on the
  // UI thread.
  const swipe = Gesture.Pan()
    .manualActivation(true)
    .simultaneousWithExternalGesture(feedList, profileList, messagesList)
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
        aboveTabBar,
        edge: sideEdge,
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
      // A second finger (a pinch) is never a page swipe.
      if (e.numberOfTouches > 1) {
        decided.value = true;
        manager.fail();
        return;
      }
      const decision = horizontalSwipe({
        startX: startX.value,
        startY: startY.value,
        dx: t.absoluteX - startX.value,
        dy: t.absoluteY - startY.value,
        width,
        height,
        insets: safeInsets,
        aboveTabBar,
        edge: sideEdge,
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
      // Follows the finger; rubber-band resistance past the first and last pages.
      page.value = rubberBand(base.value - (e.absoluteX - startX.value) / width, 0, PAGE_COUNT - 1);
    })
    .onEnd((e, success) => {
      'worklet';
      // Cut short (the phone took the touch): snap back to the page it started on.
      const next = success
        ? horizontalRelease(
            indexSV.value,
            PAGE_COUNT,
            e.absoluteX - startX.value,
            e.velocityX / 1000
          )
        : indexSV.value;
      indexSV.value = next;
      page.value = withSpring(next, PAGE_SPRING);
      scheduleOnRN(settle, next);
    });

  const stripStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -page.value * width }] }));

  // A tab (the phone's bar or the rail) moves the pages to its page.
  const selectTab = (next: RailTab) => {
    // indexSV, not index: a drag along the rail can switch twice before the next render.
    const action = tabTap({ tapped: next, showing: pageTab(indexSV.value) });
    if (action === 'move') navigate(tabPage(next), 'morph');
    // Camera tapped while on the camera page: the camera comes back from the feed.
    else if (action === 'home') setCameraHome((n) => n + 1);
  };
  if (tabBar) tabBar.selectRef.current = selectTab;

  // Without the phone's tab bar, pages are left by a sideways swipe, which VoiceOver and Switch
  // Control can't make: each page offers "Go to Profile / Feed / Camera / Messages" as actions.
  // Nothing changes on screen. With the tab bar, its tabs already do this.
  const onPageAction = (e: AccessibilityActionEvent) => {
    const next = pageForAction(e.nativeEvent.actionName);
    if (!next) return;
    selectTab(next);
    AccessibilityInfo.announceForAccessibility(pageTitle(next));
  };
  const offerPageActions = !tabBar;
  const pageA11y = (on: RailTab) => (offerPageActions ? pageActions(on) : undefined);

  // Android blurs a BlurTargetView's content; iOS blurs whatever is behind natively.
  const Strip = Platform.OS === 'android' ? BlurTargetView : View;
  const pageStyle = { width, height };
  // The Profile / Messages pills, unless the rail or the phone's tab bar carries them.
  const showNavPills = !showRail && !tabBar;

  const header = (onCamera: boolean, feed?: { dark: boolean; bellTip: boolean }) => (
    <AppHeader
      isDark={onCamera || Boolean(feed?.dark)}
      bellTipHere={feed ? feed.bellTip : !onCamera}
      onProfilePress={() => selectTab('profile')}
      onMessagesPress={() => selectTab('messages')}
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
            {/* Messages — the first page; its back button goes to Camera, the landing page. */}
            <DockRoom room={dockRoom}>
              <Animated.View
                style={[styles.page, morphStyles.messages, pageStyle]}
                accessibilityActions={pageA11y('messages')}
                onAccessibilityAction={onPageAction}
              >
                <MessagesScreen listGesture={messagesList} />
              </Animated.View>
            </DockRoom>
            {/* Camera — the entry page, always dark — with the feed behind it (one screen). */}
            <Animated.View
              style={[styles.page, morphStyles.camera, pageStyle, { backgroundColor: COLORS.ink }]}
              accessibilityActions={pageA11y('camera')}
              onAccessibilityAction={onPageAction}
            >
              <CameraFeedPage
                active={index === CAMERA}
                header={header}
                feedList={feedList}
                homeSignal={cameraHome}
                onFindFriends={() => setSearchVisible(true)}
                onOpenProfile={setProfileUserId}
                onComposingChange={handleComposingChange}
                onOverlayChange={setFeedOverlay}
              />
            </Animated.View>

            {/* Profile — the last page, always mounted; `isActive` re-syncs its posts when it comes into view. */}
            <DockRoom room={dockRoom}>
              <Animated.View
                style={[styles.page, morphStyles.profile, pageStyle]}
                accessibilityActions={pageA11y('profile')}
                onAccessibilityAction={onPageAction}
              >
                <ProfileScreen
                  isActive={index === PROFILE}
                  listGesture={profileList}
                  onSearch={() => setSearchVisible(true)}
                  onOpenCamera={() => navigate(CAMERA, 'morph')}
                />
              </Animated.View>
            </DockRoom>
          </Animated.View>
        </Strip>

        {railShown ? (
          <NavRail
            active={tab}
            onSelect={selectTab}
            onDark
            blurTarget={Platform.OS === 'android' ? blurTargetRef : undefined}
            morph
            onRect={(rect) => {
              railRectSV.value = rect;
            }}
          />
        ) : null}
        {dockShown ? <NavRail dock active={tab} onSelect={selectTab} onDark={dark} /> : null}

        {/* One-time tips over the pages (never over the sheets and views below). */}
        <CoachMarkHost />

        <NotificationsScreen
          visible={notifOpen}
          onClose={() => setNotifOpen(false)}
          onOpenPost={(ownerId, postId, comments) => {
            setNotifOpen(false);
            void openPostFromNotification(ownerId, postId, comments);
          }}
          onOpenProfile={(uid) => {
            setNotifOpen(false);
            setProfileUserId(uid);
          }}
          onOpenCamera={() => {
            setNotifOpen(false);
            setProfileUserId(null);
            navigate(CAMERA);
          }}
          onDismissed={() => setNotifShown(false)}
        />

        {/* A post a notification is about, full screen — once the sheet has gone. */}
        <PostViewer
          userId={viewer?.ownerId ?? ''}
          postId={viewer && !notifShown ? viewer.postId : null}
          onClose={closeViewer}
          openComments={viewer?.comments}
          onOpenProfile={(uid) => {
            setViewer(null);
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
          onOpenOwnProfile={() => {
            setSearchVisible(false);
            setProfileUserId(null);
            selectTab('profile');
          }}
          dark={dark}
        />
      </View>
    </GestureDetector>
  );
}

/** Feed, Profile and Messages keep the dock's room at the bottom (see `dockRoom`). */
function DockRoom({ room, children }: { room: number | null; children: React.ReactNode }) {
  if (room === null) return <>{children}</>;
  return <TabBarRoomContext.Provider value={room}>{children}</TabBarRoomContext.Provider>;
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
});
