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
import { CameraIcon, FeedIcon } from '@/components/ScreenIcons';
import { usePageSize } from '@/hooks/useChrome';
import { useAppTheme } from '@/hooks/useAppTheme';
import { cameraCard, feedOpensOnRelease, feedSwipe, feedTop } from '@/lib/cameraFeed';
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
    opacity: interpolate(progress.value, [0, 0.35], [0, 1], 'clamp'),
  }));
  const cameraHeaderStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5], [1, 0], 'clamp'),
  }));
  const feedHeaderStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.5, 1], [0, 1], 'clamp'),
  }));

  const pillBg = feedShown ? (dark ? COLORS.offWhite : COLORS.offBlack) : COLORS.offWhite;
  const pillText = feedShown ? (dark ? COLORS.offBlack : COLORS.offWhite) : COLORS.offBlack;

  return (
    <View style={styles.root}>
      {/* The feed, behind: its rows start under the camera card. */}
      <Reanimated.View
        style={[styles.layer, { backgroundColor: dark ? COLORS.bgDark : COLORS.white }, feedStyle]}
        pointerEvents={feedShown ? 'auto' : 'none'}
        accessibilityElementsHidden={!feedShown}
        importantForAccessibility={feedShown ? 'auto' : 'no-hide-descendants'}
      >
        <FeedScreen
          onGoToCamera={closeFeed}
          onFindFriends={onFindFriends}
          headerAnim={headerAnim}
          onOverlayChange={onOverlayChange}
          listGesture={feedList}
          isActive={active && feedShown}
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

      {/* The small card takes taps and a swipe down while the feed is showing. */}
      {feedShown ? (
        <GestureDetector gesture={cardSwipe}>
          <PressScale
            style={[
              styles.cardTouch,
              { left: card.x, top: card.y, width: card.width, height: card.height },
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
