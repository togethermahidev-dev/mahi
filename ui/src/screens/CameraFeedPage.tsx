/**
 * The camera and the feed on one screen (owner, 2026-10-08). The camera is full screen; swipe it
 * up (or tap FEED over the shutter, src/components/FeedCue.tsx) and it shrinks into a small card
 * at the top-left while the feed's rows take the screen under it. Tap the card, the Camera pill,
 * or swipe the card down and the camera grows back. A post swipes the camera down into the feed by
 * itself. Geometry and release rules: src/lib/cameraFeed.ts. The round button beside the bell says
 * where you are, its icons scrolling in and out of the circle: src/lib/bellPill.ts.
 *
 * Worklet rule (13.08 / 13.19 crashed on launch): the animated styles below read only numbers and
 * shared values held in local consts — never an object that also holds a gesture or a function.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated as RNAnimated, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, type NativeGesture } from 'react-native-gesture-handler';
import Reanimated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CameraScreen from '@/screens/CameraScreen';
import FeedScreen from '@/screens/FeedScreen';
import { PressScale } from '@/components/Motion';
import { CameraIcon, FeedIcon, LockIcon } from '@/components/ScreenIcons';
import { usePageSize } from '@/hooks/useChrome';
import { useAppTheme } from '@/hooks/useAppTheme';
import { cameraStrip, feedSwipe, feedTop, lockedGap } from '@/lib/cameraFeed';
import { bellIcons, bellPillOpacity, bellScroll, feedSideIcon } from '@/lib/bellPill';
import { detentProgress, releaseDetent, type Detent } from '@/lib/detent';
import { lockedGapContent, lockPill } from '@/lib/feedLock';
import { useFeedStore, useTagStore, useUserStore } from '@/store';
import { useOpenTags } from '@/hooks/useOpenTags';
import { useSecondTick } from '@/hooks/useSecondTick';
import { appHeaderHeight } from '@/lib/pip';
import { haptic } from '@/lib/haptics';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  FONT_SIZE,
  ICON_SIZE,
  RADIUS,
  SIZE,
  SPACE,
  SPRING,
  MOTION,
} from '@/constants/tokens';

export default function CameraFeedPage({
  active,
  header,
  headerAnim,
  feedList,
  onFindFriends,
  onOpenProfile,
  onComposingChange,
  onOverlayChange,
}: {
  /** This page is the one showing. */
  active: boolean;
  /** The app header: dark on the camera, light on the feed. */
  header: (onCamera: boolean) => React.ReactNode;
  /** The feed's header slides away as its rows scroll. */
  headerAnim: RNAnimated.Value;
  /** The feed list's scrolling as a gesture, so the sideways page swipe can run alongside it. */
  feedList: NativeGesture;
  onFindFriends: () => void;
  onOpenProfile: (userId: string) => void;
  onComposingChange: (composing: boolean) => void;
  onOverlayChange: (active: boolean) => void;
}): React.JSX.Element {
  const { dark } = useAppTheme();
  const page = usePageSize();
  const insets = useSafeAreaInsets();
  const headerH = appHeaderHeight(insets.top);
  // The camera is the front sheet: swipe up and it slides up, leaving a strip under the header,
  // with the feed behind it — the mirror of the pull down (owner, 2026-10-08).
  const strip = useMemo(() => cameraStrip(page, headerH), [page, headerH]);
  const rowsTop = feedTop(strip);
  // A locked feed doesn't open: the camera lifts a little (lockedGap) and the gap underneath says
  // why and what to do (owner, 2026-10-08). No feed rows show.
  const feedLocked = useFeedStore((s) => s.loaded && s.locked);
  // Until the feed itself has loaded there is nothing to open onto, so the swipe up lifts the
  // camera the same small way and the gap says loading / Try again (owner, 2026-10-09: an empty
  // grey feed). `locked` below means "the gap, not the feed".
  const feedState = useFeedStore((s) => (s.loaded ? 'loaded' : s.error ? 'error' : 'loading'));
  const locked = feedLocked || feedState !== 'loaded';
  const gap = lockedGap(page.height);

  // 0 = camera full screen, 1 = feed fully showing; the first swipe stops at the peek (owner,
  // 2026-10-08: nudge first, then a tap or a second swipe goes the rest). A locked feed has one
  // stage: its quarter lift is the whole way.
  const progress = useSharedValue(0);
  const startProgress = useSharedValue(0);
  const [detent, setDetent] = useState<Detent>('closed');
  const feedShown = detent !== 'closed';
  const feedOpen = detent === 'open';
  const twoStage = !locked;
  const peek = MOTION.cameraFeed.peekShare;
  // A third of the screen moves it all the way: quick to follow the finger (owner, 2026-10-08).
  const travel = page.height / 3;

  const settle = useCallback(
    (target: Detent) => {
      setDetent(target);
      progress.value = withSpring(detentProgress(target, peek), SPRING.pullBack);
      haptic('tick');
    },
    [progress, peek]
  );
  const openFeed = useCallback(() => settle('open'), [settle]);
  const closeFeed = useCallback(() => settle('closed'), [settle]);
  // Leaving the page with the feed up: the camera is back when you return.
  useEffect(() => {
    if (!active && feedShown) closeFeed();
  }, [active, feedShown, closeFeed]);

  // Numbers only for the worklets (see the rule above).
  const lift = locked ? gap : strip.lift;
  const cardRadius = RADIUS.r24;

  // Swipe the full camera up, or (once it has moved) the camera either way. Decided by direction
  // and handed off explicitly, like the camera's own pull, so a sideways drag is always the page
  // swipe to Messages / Profile (feedSwipe, cameraFeed.ts). Where it settles: releaseDetent.
  const touchX = useSharedValue(0);
  const touchY = useSharedValue(0);
  const decided = useSharedValue(false);
  const insetTop = insets.top;
  const makeSwipe = useCallback(
    (onCamera: boolean) => {
      // Plain values for the worklets: where it starts, and which ways it may go.
      const start: Detent = detent;
      const open = start === 'open';
      const either = start === 'peek';
      return Gesture.Pan()
        .enabled(onCamera ? start === 'closed' : start !== 'closed')
        .manualActivation(true)
        .onTouchesDown((e, manager) => {
          'worklet';
          const t = e.changedTouches[0];
          if (e.numberOfTouches !== 1 || !t) return;
          touchX.value = t.absoluteX;
          touchY.value = t.absoluteY;
          decided.value = false;
          if (t.absoluteY < insetTop) {
            decided.value = true;
            manager.fail();
          }
        })
        .onTouchesMove((e, manager) => {
          'worklet';
          const t = e.allTouches[0];
          if (decided.value || !t) return;
          if (e.numberOfTouches > 1) {
            decided.value = true;
            manager.fail();
            return;
          }
          const decision = feedSwipe({
            startY: touchY.value,
            insetTop,
            open,
            either,
            dx: t.absoluteX - touchX.value,
            dy: t.absoluteY - touchY.value,
          });
          if (decision === 'wait') return;
          decided.value = true;
          if (decision === 'activate') manager.activate();
          else manager.fail();
        })
        .onStart(() => {
          'worklet';
          startProgress.value = progress.value;
        })
        .onUpdate((e) => {
          'worklet';
          progress.value = Math.min(1, Math.max(0, startProgress.value - e.translationY / travel));
        })
        .onEnd((e) => {
          'worklet';
          const target = releaseDetent({
            start,
            progress: progress.value,
            // Towards open is up: a negative vertical velocity.
            velocity: -e.velocityY / 1000,
            peek,
            twoStage,
          });
          scheduleOnRN(settle, target);
        });
    },
    [
      detent,
      insetTop,
      touchX,
      touchY,
      decided,
      progress,
      startProgress,
      travel,
      peek,
      twoStage,
      settle,
    ]
  );
  const upSwipe = useMemo(() => makeSwipe(true), [makeSwipe]);
  // The camera's own gesture (the one the pull down uses) also takes an upward drag and moves the
  // feed with it, so the swipe up is as reliable as the pull down (owner, 2026-10-08).
  const feedDrag = useMemo(
    () => ({
      progress,
      travel,
      onRelease: (p: number, velocity: number) =>
        settle(releaseDetent({ start: 'closed', progress: p, velocity, peek, twoStage })),
    }),
    [progress, travel, settle, peek, twoStage]
  );
  const cardSwipe = useMemo(() => makeSwipe(false), [makeSwipe]);

  // One move for both: the camera slides up by `lift` (a quarter when locked, to the strip when
  // open), rounding its corners as it goes.
  const cameraStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return { borderRadius: p * cardRadius, transform: [{ translateY: -p * lift }] };
  });
  const feedStyle = useAnimatedStyle(() => ({
    opacity: locked ? 0 : interpolate(progress.value, [0, 0.35], [0, 1], 'clamp'),
  }));
  const gapStyle = useAnimatedStyle(() => ({
    opacity: locked ? interpolate(progress.value, [0, 0.5], [0, 1], 'clamp') : 0,
  }));
  const cameraHeaderStyle = useAnimatedStyle(() => ({
    opacity: locked ? 1 : interpolate(progress.value, [0, 0.5], [1, 0], 'clamp'),
  }));
  const feedHeaderStyle = useAnimatedStyle(() => ({
    opacity: locked ? 0 : interpolate(progress.value, [0.5, 1], [0, 1], 'clamp'),
  }));

  // The circle beside the bell says where you are (owner, 2026-10-09): a camera on the camera, the
  // feed on the feed, a padlock when it's locked; the icons scroll in and out of the circle with
  // the swipe. On the camera the camera's own circle (the roadmap button, CameraPull's PullHandle)
  // is the one; this one takes over as the camera starts to lift. Tap: the camera comes back.
  const [pullHandle, setPullHandle] = useState(false);
  const reduceMotion = useReducedMotion();
  const iconTravel = SIZE.z36;
  const feedIcon = feedSideIcon(feedLocked);
  const bellStyle = useAnimatedStyle(() => ({
    opacity: bellPillOpacity({ progress: progress.value, peek, feedShown, handle: pullHandle }),
  }));
  const bellCameraStyle = useAnimatedStyle(() => {
    const at = bellIcons(bellScroll(progress.value, peek), iconTravel, reduceMotion);
    return { opacity: at.cameraOpacity, transform: [{ translateY: at.cameraY }] };
  });
  const bellFeedStyle = useAnimatedStyle(() => {
    const at = bellIcons(bellScroll(progress.value, peek), iconTravel, reduceMotion);
    return { opacity: at.feedOpacity, transform: [{ translateY: at.feedY }] };
  });

  return (
    <View style={styles.root}>
      {/* The feed, behind: its rows start under the camera strip. */}
      <Reanimated.View
        style={[styles.layer, { backgroundColor: dark ? COLORS.bgDark : COLORS.white }, feedStyle]}
        pointerEvents={feedOpen && !locked ? 'auto' : 'none'}
        accessibilityElementsHidden={!feedOpen || locked}
        importantForAccessibility={feedOpen && !locked ? 'auto' : 'no-hide-descendants'}
      >
        <FeedScreen
          onGoToCamera={closeFeed}
          onFindFriends={onFindFriends}
          headerAnim={headerAnim}
          onOverlayChange={onOverlayChange}
          listGesture={feedList}
          isActive={active && feedOpen && !locked}
          topInset={rowsTop - headerH}
        />
      </Reanimated.View>

      {/* Locked: the quarter under the lifted camera says why and what to do. */}
      {locked ? (
        <Reanimated.View
          style={[
            styles.gap,
            { height: gap, backgroundColor: dark ? COLORS.bgDark : COLORS.white },
            gapStyle,
          ]}
          pointerEvents={feedShown ? 'box-none' : 'none'}
          accessibilityElementsHidden={!feedShown}
          importantForAccessibility={feedShown ? 'auto' : 'no-hide-descendants'}
        >
          <LockedGap onPost={closeFeed} onFindFriends={onFindFriends} feed={feedState} />
        </Reanimated.View>
      ) : null}

      {/* The camera, in front: full screen, or slid up to a strip under the header. */}
      <GestureDetector gesture={upSwipe}>
        <Reanimated.View
          style={[styles.layer, styles.camera, cameraStyle]}
          pointerEvents={feedShown ? 'none' : 'auto'}
          accessibilityElementsHidden={feedShown}
          importantForAccessibility={feedShown ? 'no-hide-descendants' : 'auto'}
        >
          <CameraScreen
            onComposingChange={onComposingChange}
            onSeeFeed={openFeed}
            onPosted={openFeed}
            feedShown={feedShown}
            onPullHandle={setPullHandle}
            feedDrag={feedDrag}
            onFindFriends={onFindFriends}
            onOpenProfile={onOpenProfile}
          />
        </Reanimated.View>
      </GestureDetector>

      {/* The camera's header stays put over the camera (locked: while it lifts too). */}
      <Reanimated.View pointerEvents="box-none" style={[styles.header, cameraHeaderStyle]}>
        {header(true)}
      </Reanimated.View>

      {/* The feed's header sits over the camera strip once the feed is up. */}
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
        <Reanimated.View style={feedHeaderStyle} pointerEvents={feedShown ? 'box-none' : 'none'}>
          {header(false)}
        </Reanimated.View>
      </RNAnimated.View>

      {/* The camera strip (or, locked, the lifted camera) takes taps and a swipe down. */}
      {feedShown ? (
        <GestureDetector gesture={cardSwipe}>
          <PressScale
            style={[
              styles.cardTouch,
              locked
                ? { left: 0, top: 0, width: page.width, height: page.height - gap }
                : {
                    left: 0,
                    top: headerH,
                    width: page.width,
                    // At the peek the camera still fills most of the screen; open, it's the strip.
                    height: feedOpen ? strip.bottom - headerH : page.height - peek * lift - headerH,
                  },
            ]}
            // At the peek, a tap goes the rest of the way; fully open, it brings the camera back.
            onPress={detent === 'peek' ? openFeed : closeFeed}
            accessibilityRole="button"
            accessibilityLabel={detent === 'peek' ? 'Show your feed' : 'Back to the camera'}
            accessibilityHint="Or swipe it"
          >
            <View />
          </PressScale>
        </GestureDetector>
      ) : null}

      {/* Beside the bell: the circle whose icon says where you are; it brings the camera back. */}
      <Reanimated.View
        style={[styles.cameraPillSpot, { top: insets.top - (SIZE.z44 - SIZE.z36) / 2 }, bellStyle]}
        pointerEvents={feedShown ? 'auto' : 'none'}
        accessibilityElementsHidden={!feedShown}
        importantForAccessibility={feedShown ? 'auto' : 'no-hide-descendants'}
      >
        <PressScale
          style={styles.cameraPill}
          onPress={closeFeed}
          accessibilityRole="button"
          accessibilityLabel="Camera"
          accessibilityHint="Brings the camera back"
        >
          <Reanimated.View style={[styles.bellIcon, bellCameraStyle]}>
            <CameraIcon size={ICON_SIZE.i20} color={COLORS.offBlack} />
          </Reanimated.View>
          <Reanimated.View style={[styles.bellIcon, bellFeedStyle]}>
            {feedIcon === 'lock' ? (
              <LockIcon size={ICON_SIZE.i20} color={COLORS.offBlack} />
            ) : (
              <FeedIcon size={ICON_SIZE.i20} color={COLORS.offBlack} />
            )}
          </Reanimated.View>
        </PressScale>
      </Reanimated.View>
    </View>
  );
}

/** Why the feed is locked and the one thing to do, under the lifted camera. */
function LockedGap({
  onPost,
  onFindFriends,
  feed,
}: {
  onPost: () => void;
  onFindFriends: () => void;
  /** The feed read itself: until it's in, the gap says loading / Try again. */
  feed: 'loading' | 'error' | 'loaded';
}): React.JSX.Element {
  const { colors } = useAppTheme();
  const { openTags, loaded } = useOpenTags();
  const unlockedUntil = useFeedStore((s) => s.unlockedUntil);
  const serverOffsetMs = useFeedStore((s) => s.serverOffsetMs);
  // The tag clock ticks every second, like every tag countdown.
  const deviceNow = useSecondTick(openTags.length > 0);
  // The server's mark: someone who has posted is never asked for a first workout.
  const postedBefore = useUserStore((st) => st.profile?.has_posted_before ?? false);
  const tagsError = useTagStore((st) => st.openTagsError);
  const pill = loaded
    ? lockPill({ locked: true, unlockedUntil, openTags, serverOffsetMs, deviceNow, postedBefore })
    : null;
  // Never blank (owner, 2026-10-09): checking while the tags load, Try again if they couldn't.
  const gap = lockedGapContent({ pill, loaded, error: tagsError, feed });
  const onPress =
    gap.action === 'friends'
      ? onFindFriends
      : gap.action === 'retry'
        ? () => void useTagStore.getState().syncOpenTags()
        : gap.action === 'retryFeed'
          ? () => void useFeedStore.getState().sync(true)
          : onPost;
  const hint =
    gap.action === 'friends'
      ? 'Opens search'
      : gap.action === 'retry'
        ? 'Checks your tags again'
        : gap.action === 'retryFeed'
          ? 'Loads your feed again'
          : 'Back to the camera';
  return (
    // The reason on top; the padlock and the button side by side under it (owner, 2026-10-08).
    <View style={styles.gapInner}>
      <Text style={[styles.gapLine, { color: colors.text }]} numberOfLines={2}>
        {gap.line}
      </Text>
      <View style={styles.gapRow}>
        {gap.padlock ? (
          <View
            style={[styles.gapLock, { backgroundColor: colors.text }]}
            accessible
            accessibilityLabel="Locked"
          >
            <LockIcon size={ICON_SIZE.i20} color={colors.bg} />
          </View>
        ) : null}
        {gap.button ? (
          <PressScale
            style={[styles.gapButton, { backgroundColor: colors.text }]}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={gap.button}
            accessibilityHint={hint}
          >
            <Text style={[styles.gapButtonText, { color: colors.bg }]}>{gap.button}</Text>
          </PressScale>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  layer: {
    ...StyleSheet.absoluteFill,
  },
  camera: {
    backgroundColor: COLORS.ink,
    overflow: 'hidden',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  cardTouch: {
    position: 'absolute',
    borderRadius: RADIUS.r24,
  },
  // Same spot as the camera's own circle (CameraPull's handleSpot): 8 left of the bell.
  cameraPillSpot: {
    position: 'absolute',
    right: SPACE.s24 + SIZE.z36 + SPACE.s8,
    width: SIZE.z44,
    height: SIZE.z44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraPill: {
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    alignItems: 'center',
    justifyContent: 'center',
    // The icons scroll in and out of the circle: it clips them.
    overflow: 'hidden',
    backgroundColor: COLORS.offWhite,
  },
  bellIcon: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The quarter of the page under a lifted camera when the feed is locked.
  gap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  gapInner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACE.s24,
    gap: SPACE.s10,
  },
  gapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s10,
  },
  gapLock: {
    width: SIZE.z40,
    height: SIZE.z40,
    borderRadius: RADIUS.r20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gapLine: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.semiBold,
  },
  gapButton: {
    minHeight: SIZE.z40,
    justifyContent: 'center',
    borderRadius: RADIUS.pill,
    paddingVertical: SPACE.s8,
    paddingHorizontal: SPACE.s16,
  },
  gapButtonText: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.bold,
  },
});
