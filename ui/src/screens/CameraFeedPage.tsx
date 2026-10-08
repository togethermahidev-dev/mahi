/**
 * The camera and the feed on one screen (owner, 2026-10-08). The camera is full screen; swipe it
 * up (or tap the Feed pill) and it shrinks into a small card at the top-left while the feed's rows
 * take the screen under it. Tap the card, the Camera pill, or swipe the card down and the camera
 * grows back. A post swipes the camera down into the feed by itself. Geometry and release rules:
 * src/lib/cameraFeed.ts.
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
import { cameraCard, feedOpensOnRelease, feedSwipe, feedTop, lockedGap } from '@/lib/cameraFeed';
import { lockPill } from '@/lib/feedLock';
import { useFeedStore } from '@/store';
import { useOpenTags } from '@/hooks/useOpenTags';
import { useSecondTick } from '@/hooks/useSecondTick';
import PixelAthlete from '@/components/PixelAthlete';
import { appHeaderHeight } from '@/lib/pip';
import { haptic } from '@/lib/haptics';
import { FONTS } from '@/constants/fonts';
import {
  ALPHA,
  COLORS,
  FONT_SIZE,
  ICON_SIZE,
  RADIUS,
  SIZE,
  SPACE,
  SPRING,
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
  const card = useMemo(() => cameraCard(page, headerH), [page, headerH]);
  const rowsTop = feedTop(card);
  // A locked feed doesn't open: the camera lifts a quarter of the page and the gap underneath says
  // why and what to do (owner, 2026-10-08). No feed rows show.
  const locked = useFeedStore((s) => s.loaded && s.locked);
  const gap = lockedGap(page.height);

  // 0 = camera full screen, 1 = feed showing. `feedShown` is where it last settled.
  const progress = useSharedValue(0);
  const startProgress = useSharedValue(0);
  const [feedShown, setFeedShown] = useState(false);
  // Half a screen of travel moves it all the way.
  const travel = page.height / 2;

  const settle = useCallback(
    (open: boolean) => {
      progress.value = withSpring(open ? 1 : 0, SPRING.pullBack, (finished) => {
        if (finished) scheduleOnRN(setFeedShown, open);
      });
      haptic('tick');
    },
    [progress]
  );
  const openFeed = useCallback(() => settle(true), [settle]);
  const closeFeed = useCallback(() => settle(false), [settle]);
  // Leaving the page with the feed up: the camera is back when you return.
  useEffect(() => {
    if (!active && feedShown) closeFeed();
  }, [active, feedShown, closeFeed]);

  // Numbers only for the worklets (see the rule above).
  const cardX = card.x;
  const cardY = card.y;
  const cardScale = card.scale;
  const cardRadius = RADIUS.r24;

  // Swipe the full camera up (it shrinks towards its card as the finger goes), or the small card
  // down. Decided by direction and handed off explicitly, like the camera's own pull, so a
  // sideways drag is always the page swipe to Messages / Profile (feedSwipe, cameraFeed.ts).
  const touchX = useSharedValue(0);
  const touchY = useSharedValue(0);
  const decided = useSharedValue(false);
  const insetTop = insets.top;
  const makeSwipe = useCallback(
    (open: boolean) =>
      Gesture.Pan()
        .enabled(open === feedShown)
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
          const settled = feedOpensOnRelease({
            progress: progress.value,
            velocity: e.velocityY / 1000,
            travel,
            startedOpen: open,
          });
          scheduleOnRN(settle, settled);
        }),
    [feedShown, insetTop, touchX, touchY, decided, progress, startProgress, travel, settle]
  );
  const upSwipe = useMemo(() => makeSwipe(false), [makeSwipe]);
  const cardSwipe = useMemo(() => makeSwipe(true), [makeSwipe]);

  const cameraStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (locked) {
      return {
        transformOrigin: 'top left',
        borderRadius: p * cardRadius,
        transform: [{ translateX: 0 }, { translateY: -p * gap }, { scale: 1 }],
      };
    }
    return {
      transformOrigin: 'top left',
      borderRadius: p * cardRadius,
      transform: [
        { translateX: p * cardX },
        { translateY: p * cardY },
        { scale: 1 + p * (cardScale - 1) },
      ],
    };
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

  const onDarkCamera = !feedShown || locked;
  const pillBg = onDarkCamera ? COLORS.offWhite : dark ? COLORS.offWhite : COLORS.offBlack;
  const pillText = onDarkCamera ? COLORS.offBlack : dark ? COLORS.offBlack : COLORS.offWhite;

  return (
    <View style={styles.root}>
      {/* The feed, behind: its rows start under the camera card. */}
      <Reanimated.View
        style={[styles.layer, { backgroundColor: dark ? COLORS.bgDark : COLORS.white }, feedStyle]}
        pointerEvents={feedShown && !locked ? 'auto' : 'none'}
        accessibilityElementsHidden={!feedShown || locked}
        importantForAccessibility={feedShown && !locked ? 'auto' : 'no-hide-descendants'}
      >
        <FeedScreen
          onGoToCamera={closeFeed}
          onFindFriends={onFindFriends}
          headerAnim={headerAnim}
          onOverlayChange={onOverlayChange}
          listGesture={feedList}
          isActive={active && feedShown && !locked}
          topInset={rowsTop - headerH}
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
          <Reanimated.View style={feedHeaderStyle} pointerEvents={feedShown ? 'box-none' : 'none'}>
            {header(false)}
          </Reanimated.View>
        </RNAnimated.View>
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
          <LockedGap onPost={closeFeed} onFindFriends={onFindFriends} />
        </Reanimated.View>
      ) : null}

      {/* The camera, in front: full screen, or a small card at the top-left. */}
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
            onFindFriends={onFindFriends}
            onOpenProfile={onOpenProfile}
          />
          <Reanimated.View pointerEvents="box-none" style={[styles.header, cameraHeaderStyle]}>
            {header(true)}
          </Reanimated.View>
        </Reanimated.View>
      </GestureDetector>

      {/* The small card (or, locked, the lifted camera) takes taps and a swipe down. */}
      {feedShown ? (
        <GestureDetector gesture={cardSwipe}>
          <PressScale
            style={[
              styles.cardTouch,
              locked
                ? { left: 0, top: 0, width: page.width, height: page.height - gap }
                : { left: card.x, top: card.y, width: card.width, height: card.height },
            ]}
            onPress={closeFeed}
            accessibilityRole="button"
            accessibilityLabel="Back to the camera"
            accessibilityHint="Or swipe it down"
          >
            <View />
          </PressScale>
        </GestureDetector>
      ) : null}

      {/* One pill at the header's left: Feed on the camera, Camera on the feed. */}
      <PressScale
        style={[styles.pill, { top: insets.top, backgroundColor: pillBg }]}
        onPress={feedShown ? closeFeed : openFeed}
        accessibilityRole="button"
        accessibilityLabel={feedShown ? 'Camera' : 'Feed'}
        accessibilityHint={feedShown ? 'Brings the camera back' : 'Shows your feed'}
      >
        {feedShown ? (
          <CameraIcon size={ICON_SIZE.i16} color={pillText} />
        ) : (
          <FeedIcon size={ICON_SIZE.i16} color={pillText} />
        )}
        <Text style={[styles.pillText, { color: pillText }]}>{feedShown ? 'Camera' : 'Feed'}</Text>
      </PressScale>
    </View>
  );
}

/** Why the feed is locked and the one thing to do, under the lifted camera. */
function LockedGap({
  onPost,
  onFindFriends,
}: {
  onPost: () => void;
  onFindFriends: () => void;
}): React.JSX.Element | null {
  const { colors } = useAppTheme();
  const { openTags, loaded } = useOpenTags();
  const unlockedUntil = useFeedStore((s) => s.unlockedUntil);
  const serverOffsetMs = useFeedStore((s) => s.serverOffsetMs);
  // The tag clock ticks every second, like every tag countdown.
  const deviceNow = useSecondTick(openTags.length > 0);
  const pill = loaded
    ? lockPill({ locked: true, unlockedUntil, openTags, serverOffsetMs, deviceNow })
    : null;
  if (!pill) return null;
  const toFriends = pill.target === 'friends';
  return (
    <View style={styles.gapInner}>
      <View style={styles.gapWhy} accessible accessibilityLabel={pill.line}>
        <View style={[styles.gapLock, { backgroundColor: colors.text }]}>
          <LockIcon size={ICON_SIZE.i20} color={colors.bg} />
        </View>
        <Text style={[styles.gapLine, { color: colors.text }]} numberOfLines={2}>
          {pill.line}
        </Text>
      </View>
      <PressScale
        style={[styles.gapButton, { backgroundColor: colors.text }]}
        onPress={toFriends ? onFindFriends : onPost}
        accessibilityRole="button"
        accessibilityLabel={pill.button}
        accessibilityHint={toFriends ? 'Opens search' : 'Back to the camera'}
      >
        <PixelAthlete size={SIZE.z28} color={colors.bg} />
        <Text style={[styles.gapButtonText, { color: colors.bg }]}>{pill.button}</Text>
      </PressScale>
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
    gap: SPACE.s14,
  },
  gapWhy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s12,
  },
  gapLock: {
    width: SIZE.z40,
    height: SIZE.z40,
    borderRadius: RADIUS.r20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gapLine: {
    flex: 1,
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.semiBold,
  },
  gapButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s8,
    minHeight: SIZE.z44,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACE.s8,
    paddingLeft: SPACE.s12,
    paddingRight: SPACE.s16,
  },
  gapButtonText: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.bold,
  },
  pill: {
    position: 'absolute',
    left: SPACE.s24,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    paddingHorizontal: SPACE.s12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s6,
    opacity: ALPHA.a92,
  },
  pillText: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
  },
});
