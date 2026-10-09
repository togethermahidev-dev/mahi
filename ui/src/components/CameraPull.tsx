/**
 * The waiting camera opens like a physical front layer (owner, 2026-10-08): the live camera and
 * its frost follow a downward pull, then settle low enough to uncover the accountability card
 * built behind them. Pulling up or tapping the up arrow closes it. One tick as it passes its mark.
 * The round button beside the bell shows a camera, which turns into the up arrow as the drawer
 * opens (owner, 2026-10-09). Rules and geometry: src/lib/cameraPull.ts.
 *
 * Reduce Motion: the camera crossfades away instead of sliding.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import Reanimated, {
  interpolate,
  type SharedValue,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Path } from 'react-native-svg';
import { haptic } from '@/lib/haptics';
import { bellHandoff } from '@/lib/bellPill';
import { CameraIcon } from '@/components/ScreenIcons';
import { cameraDrag, drawerOffset, drawerShouldOpen, pullParallax } from '@/lib/cameraPull';
import { detentProgress, releaseDetent, type Detent } from '@/lib/detent';
import {
  ALPHA,
  COLORS,
  ICON_SIZE,
  MOTION,
  RADIUS,
  SIZE,
  SPRING,
  STROKE,
  SWIPE,
  SPACE,
} from '@/constants/tokens';

/**
 * The pull gesture and the styles it drives. `enabled`: only while the waiting card shows.
 * `insetTop`: a drag from the status bar is left to the phone.
 */
export function useCameraPull(
  enabled: boolean,
  insetTop: number,
  viewportWidth: number,
  viewportHeight: number,
  /** The feed behind the camera (the combined screen): an upward drag moves it (cameraDrag). */
  feed?: {
    progress: SharedValue<number>;
    travel: number;
    onRelease: (progress: number, velocity: number) => void;
  }
) {
  const reduceMotion = useReducedMotion();
  // Open: the camera is a portrait card in the bottom half; it travels down to its top edge.
  const collapsedHeight = viewportHeight * MOTION.pull.collapsedHeightShare;
  const collapsedWidth = Math.min(
    collapsedHeight * MOTION.pull.collapsedAspect,
    viewportWidth - MOTION.pull.collapsedInset * 2
  );
  const openOffset = Math.max(0, viewportHeight - collapsedHeight - MOTION.pull.collapsedInset);
  const offset = useSharedValue(0);
  const startOffset = useSharedValue(0);
  // 0 = this drag moves the drawer, 1 = it moves the feed. Plain values only for the worklets.
  const dragMode = useSharedValue(0);
  const feedStart = useSharedValue(0);
  const feedProgress = feed?.progress;
  const feedTravel = feed?.travel ?? 0;
  const feedRelease = feed?.onRelease;
  const feedOn = !!feed;
  const startY = useSharedValue(0);
  const startX = useSharedValue(0);
  const decided = useSharedValue(false);
  const felt = useSharedValue(false);
  // Closed, a short peek, or open (owner, 2026-10-08: nudge first, then a tap or a second pull
  // goes the rest). The roadmap's buttons work once it's open.
  const [detent, setDetent] = useState<Detent>('closed');
  const expanded = detent === 'open';
  const peek = MOTION.pull.peekShare;

  // Leaving the waiting state mid-pull puts everything back. The camera itself never tugs on
  // its own (owner, 2026-10-08: no shake when Mahi opens); the arrow's hops are the hint.
  useEffect(() => {
    if (!enabled) {
      offset.value = 0;
      // The drawer may disappear because a tag arrived while it was open.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetent('closed');
    }
  }, [enabled, offset]);

  // The pill (or a tap on the peek): closed or peeking → all the way open; open → closed.
  const toggle = useCallback(() => {
    const next: Detent = detent === 'open' ? 'closed' : 'open';
    setDetent(next);
    // SharedValues are deliberately mutable on the UI thread.
    // eslint-disable-next-line react-hooks/immutability
    offset.value = withSpring(detentProgress(next, peek) * openOffset, SPRING.pullBack);
  }, [detent, offset, openOffset, peek]);

  // Plain values for the worklets: where this drag starts.
  const start: Detent = detent;
  const moved = detent !== 'closed';

  const gesture = Gesture.Pan()
    .enabled(enabled)
    .manualActivation(true)
    .onTouchesDown((e, manager) => {
      'worklet';
      const t = e.changedTouches[0];
      if (e.numberOfTouches !== 1 || !t) return;
      cancelAnimation(offset);
      startX.value = t.absoluteX;
      startY.value = t.absoluteY;
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
      const way = cameraDrag({
        startY: startY.value,
        insetTop,
        moved,
        feedOn,
        dx: t.absoluteX - startX.value,
        dy: t.absoluteY - startY.value,
      });
      if (way === 'wait') return;
      decided.value = true;
      if (way === 'fail') {
        manager.fail();
        return;
      }
      dragMode.value = way === 'feed' ? 1 : 0;
      manager.activate();
    })
    .onStart(() => {
      'worklet';
      felt.value = false;
      startOffset.value = offset.value;
      if (feedProgress) feedStart.value = feedProgress.value;
    })
    .onUpdate((e) => {
      'worklet';
      if (dragMode.value === 1) {
        if (feedProgress && feedTravel > 0) {
          feedProgress.value = Math.min(
            1,
            Math.max(0, feedStart.value - e.translationY / feedTravel)
          );
        }
        return;
      }
      // eslint-disable-next-line react-hooks/immutability
      offset.value =
        startOffset.value > 0
          ? Math.max(0, Math.min(openOffset, startOffset.value + e.translationY))
          : drawerOffset(e.translationY, openOffset);
      if (!felt.value && drawerShouldOpen(offset.value, openOffset)) {
        felt.value = true;
        scheduleOnRN(haptic, 'tick');
      }
    })
    .onEnd((e) => {
      'worklet';
      if (dragMode.value === 1) {
        // Towards the feed is up: a negative vertical velocity.
        if (feedRelease && feedProgress) {
          scheduleOnRN(feedRelease, feedProgress.value, -e.velocityY / 1000);
        }
        return;
      }
      const target = releaseDetent({
        start,
        progress: openOffset > 0 ? offset.value / openOffset : 0,
        // Towards open is down: a positive vertical velocity.
        velocity: e.velocityY / 1000,
        peek,
        // One swipe, all the way: a drawer peek shows nothing (the roadmap needs almost all of the
        // drawer's room), so it looked stuck (owner, 2026-10-08, 13.33). The feed keeps its peek.
        twoStage: false,
      });
      // eslint-disable-next-line react-hooks/immutability
      offset.value = withSpring(detentProgress(target, peek) * openOffset, SPRING.pullBack);
      scheduleOnRN(setDetent, target);
    });

  // To the peek the camera only slides down, so the roadmap shows in the gap above it; past the
  // peek it shrinks into the portrait card (owner, 2026-10-08: the peek looked stuck when the
  // camera started shrinking straight away and covered everything). Numbers only (worklet rule).
  const peekY = openOffset * MOTION.pull.peekShare;
  const cardX = (viewportWidth - collapsedWidth) / 2;
  const cardRadius = RADIUS.r24;
  const cardStyle = useAnimatedStyle(() => {
    const o = reduceMotion ? 0 : Math.max(0, Math.min(openOffset, offset.value));
    if (o <= peekY) {
      return {
        left: 0,
        top: o,
        width: viewportWidth,
        height: viewportHeight,
        borderRadius: peekY > 0 ? (o / peekY) * cardRadius : 0,
      };
    }
    const q = openOffset > peekY ? (o - peekY) / (openOffset - peekY) : 1;
    return {
      left: q * cardX,
      top: peekY + q * (openOffset - peekY),
      width: viewportWidth + q * (collapsedWidth - viewportWidth),
      height: viewportHeight + q * (collapsedHeight - viewportHeight),
      borderRadius: cardRadius,
    };
  });
  // The live camera and its frost crossfade for Reduce Motion; shared card geometry owns movement.
  const cameraStyle = useAnimatedStyle(() => {
    const progress = openOffset > 0 ? offset.value / openOffset : 0;
    return {
      opacity: interpolate(
        progress,
        reduceMotion ? [0, 1] : [0, MOTION.pull.cameraFadeAt, 1],
        reduceMotion ? [1, 0] : [1, 1, 1],
        'clamp'
      ),
    };
  });
  // Reduce Motion: the frost thins instead.
  const frostStyle = useAnimatedStyle(() =>
    reduceMotion
      ? {
          opacity: interpolate(offset.value, [0, openOffset], [1, 0]),
        }
      : {
          opacity: interpolate(
            offset.value,
            [0, openOffset * MOTION.pull.cameraFadeAt, openOffset],
            [1, 1, 0],
            'clamp'
          ),
        }
  );
  // The card behind the glass.
  const behindStyle = useAnimatedStyle(() => {
    const progress = openOffset > 0 ? Math.min(1, offset.value / openOffset) : 0;
    if (reduceMotion) return { opacity: progress };
    const p = pullParallax(progress * MOTION.pull.limit);
    return {
      opacity: interpolate(progress, [0, 0.12, 0.42], [0, 0.2, 1]),
      transform: [{ translateY: p.translateY }, { scale: p.scale }],
    };
  });
  const primaryStyle = useAnimatedStyle(() => {
    const progress = openOffset > 0 ? Math.min(1, offset.value / openOffset) : 0;
    return {
      opacity: interpolate(progress, [0.12, 0.45], [0, 1]),
      transform: [{ translateY: reduceMotion ? 0 : interpolate(progress, [0.12, 0.45], [12, 0]) }],
    };
  });
  const secondaryStyle = useAnimatedStyle(() => {
    const progress = openOffset > 0 ? Math.min(1, offset.value / openOffset) : 0;
    return {
      opacity: interpolate(progress, [0.38, 0.68], [0, 1]),
      transform: [{ translateY: reduceMotion ? 0 : interpolate(progress, [0.38, 0.68], [12, 0]) }],
    };
  });
  const tertiaryStyle = useAnimatedStyle(() => {
    const progress = openOffset > 0 ? Math.min(1, offset.value / openOffset) : 0;
    return { opacity: interpolate(progress, [0.58, 0.82], [0, 1]) };
  });
  const edgeStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 0 };
    const progress = openOffset > 0 ? Math.min(1, offset.value / openOffset) : 0;
    return {
      opacity: interpolate(progress, [0, 0.08, 1], [0, MOTION.pull.edgePeak, MOTION.pull.edgeRest]),
    };
  });
  return {
    gesture,
    cameraStyle,
    frostStyle,
    behindStyle,
    primaryStyle,
    secondaryStyle,
    tertiaryStyle,
    cardStyle,
    edgeStyle,
    offset,
    expanded,
    toggle,
    openOffset,
    /** The small camera card's place when open (the pip window and the arrow follow it). */
    collapsed: {
      x: (viewportWidth - collapsedWidth) / 2,
      y: openOffset,
      width: collapsedWidth,
      height: collapsedHeight,
    },
    viewport: { width: viewportWidth, height: viewportHeight },
  };
}

/**
 * The round button beside the bell on the camera: a camera icon that turns into the up arrow as
 * the drawer opens; it hops to teach the pull, then travels with the camera. As the feed starts to
 * come up it hands over to the feed page's circle at the same spot (bellPill.ts), so only one
 * circle ever shows.
 */
export function PullHandle({
  top,
  openTop,
  offset,
  openOffset,
  expanded,
  anchorRef,
  onPress,
  feedProgress,
}: {
  top: number;
  openTop: number;
  offset: SharedValue<number>;
  openOffset: number;
  expanded: boolean;
  /** Where the one-time "Pull down to peek" tip points. */
  anchorRef?: React.Ref<View>;
  onPress?: () => void;
  /** The feed coming up over the camera (0 = not at all): this circle hides once it moves. */
  feedProgress?: SharedValue<number>;
}): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const jump = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    jump.value = withSequence(
      withTiming(MOTION.pull.arrowJumpY, { duration: MOTION.pullHandleMs }),
      withSpring(0, SPRING.pullBack),
      withTiming(MOTION.pull.arrowJumpY, { duration: MOTION.pullHandleMs }),
      withSpring(0, SPRING.pullBack)
    );
  }, [reduceMotion, jump]);
  // Opened: the arrow turns Mahi blue and bounces (owner, 2026-10-08).
  useEffect(() => {
    if (!expanded || reduceMotion) return;
    jump.value = withSequence(
      withTiming(-MOTION.pull.arrowJumpY, { duration: MOTION.pullHandleMs }),
      withSpring(0, SPRING.bounce),
      withTiming(-MOTION.pull.arrowJumpY, { duration: MOTION.pullHandleMs }),
      withSpring(0, SPRING.bounce)
    );
  }, [expanded, reduceMotion, jump]);
  // Dark arrow on the white pill; Mahi blue once open.
  const arrowColor = expanded ? COLORS.accent : COLORS.offBlack;
  const jumpStyle = useAnimatedStyle(() => ({ transform: [{ translateY: jump.value }] }));
  // The shared value alone goes into the worklet (worklet rule).
  const feed = feedProgress;
  const positionStyle = useAnimatedStyle(() => {
    const progress = openOffset > 0 ? Math.min(1, offset.value / openOffset) : 0;
    return {
      opacity: feed ? 1 - bellHandoff(feed.value) : 1,
      transform: [{ translateY: (openTop - top) * progress }],
    };
  });
  const fromScale = MOTION.pull.glyphFromScale;
  // A camera at rest (owner, 2026-10-09; a question mark before) that morphs into the up-arrow
  // as the camera nudges down (owner, 2026-10-08): one fades and shrinks as the other grows and
  // turns in. The morph is complete by the peek, so the peek shows a clean arrow.
  const glyphEnd = openOffset * MOTION.pull.peekShare;
  const chevronStyle = useAnimatedStyle(() => {
    const progress = glyphEnd > 0 ? Math.min(1, offset.value / glyphEnd) : 0;
    return {
      opacity: progress,
      transform: [
        { rotate: `${progress * 180}deg` },
        { scale: fromScale + (1 - fromScale) * progress },
      ],
    };
  });
  const cameraStyle = useAnimatedStyle(() => {
    const progress = glyphEnd > 0 ? Math.min(1, offset.value / glyphEnd) : 0;
    return { opacity: 1 - progress, transform: [{ scale: 1 - (1 - fromScale) * progress }] };
  });

  return (
    <Reanimated.View
      ref={anchorRef}
      style={[styles.handleSpot, { top }, positionStyle]}
      collapsable={false}
    >
      <Pressable
        style={({ pressed }) => [
          styles.arrowTarget,
          pressed && Platform.OS !== 'android' && styles.handlePressed,
        ]}
        onPress={onPress}
        disabled={!onPress}
        android_ripple={{ color: COLORS.accent, foreground: true }}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={
          expanded ? 'Close accountability actions' : 'Show accountability actions'
        }
        accessibilityHint={expanded ? undefined : 'Pull down or double tap'}
        accessibilityState={{ expanded }}
      >
        {/* Two layers: the hop and the turn each own a transform, so neither overwrites the other. */}
        <Reanimated.View style={[jumpStyle, styles.glyphBox]}>
          <Reanimated.View style={[styles.glyph, cameraStyle]}>
            <CameraIcon size={ICON_SIZE.i20} color={COLORS.offBlack} />
          </Reanimated.View>
          <Reanimated.View style={[styles.glyph, chevronStyle]}>
            {/* The app's own arrow: Apple's native one came up blank while it faded in. */}
            <Svg width={ICON_SIZE.i24} height={ICON_SIZE.i16} viewBox="0 0 24 14">
              <Path
                d="M3 3l9 8 9-8"
                stroke={arrowColor}
                strokeWidth={STROKE.s2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Reanimated.View>
        </Reanimated.View>
      </Pressable>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  // A round header pill beside the bell (owner, 2026-10-08): the bell is 36 across, 24 in from
  // the edge; this sits 8 to its left. The pull gesture itself still works anywhere on the camera.
  handleSpot: {
    position: 'absolute',
    right: SPACE.s24 + SIZE.z36 + SPACE.s8,
    width: SIZE.z44,
    height: SIZE.z44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowTarget: {
    width: SIZE.z36,
    height: SIZE.z36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.r18,
    overflow: 'hidden',
    backgroundColor: COLORS.offWhite,
  },
  // The camera icon and the arrow share one spot and morph into each other.
  glyphBox: {
    width: ICON_SIZE.i24,
    height: ICON_SIZE.i24,
  },
  glyph: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handlePressed: {
    opacity: ALPHA.a80,
  },
});
