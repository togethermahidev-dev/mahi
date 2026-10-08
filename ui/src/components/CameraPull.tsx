/**
 * The waiting camera opens like a physical front layer (owner, 2026-10-08): the live camera and
 * its frost follow a downward pull, then settle low enough to uncover the accountability card
 * built behind them. Pulling up or tapping the up arrow closes it. One tick as it passes its mark.
 * A centered handle with a chevron says it can be pulled; it
 * breathes once when it shows (Apple's own symbol effect on an iPhone build with @expo/ui, ours
 * elsewhere). Rules and geometry: src/lib/cameraPull.ts.
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
import {
  drawerOffset,
  drawerShouldOpen,
  drawerShouldSettleOpen,
  pullParallax,
  verticalPull,
} from '@/lib/cameraPull';
import { loadSwiftUI } from '@/lib/expoUiModule';
import { useCardMorphStyle } from '@/components/MorphTransition';
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
  viewportHeight: number
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
  const startY = useSharedValue(0);
  const startX = useSharedValue(0);
  const decided = useSharedValue(false);
  const felt = useSharedValue(false);
  const [expanded, setExpanded] = useState(false);

  // Leaving the waiting state mid-pull puts everything back. The camera itself never tugs on
  // its own (owner, 2026-10-08: no shake when Mahi opens); the arrow's hops are the hint.
  useEffect(() => {
    if (!enabled) {
      offset.value = 0;
      // The drawer may disappear because a tag arrived while it was open.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpanded(false);
    }
  }, [enabled, offset]);

  const toggle = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    // SharedValues are deliberately mutable on the UI thread.
    // eslint-disable-next-line react-hooks/immutability
    offset.value = withSpring(next ? openOffset : 0, SPRING.pullBack);
  }, [expanded, offset, openOffset]);

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
      const dx = t.absoluteX - startX.value;
      const dy = t.absoluteY - startY.value;
      const decision =
        expanded && dy < -SWIPE.slop && Math.abs(dy) > Math.abs(dx)
          ? 'activate'
          : verticalPull({ startY: startY.value, dx, dy, insetTop });
      if (decision === 'wait') return;
      decided.value = true;
      if (decision === 'activate') manager.activate();
      else manager.fail();
    })
    .onStart(() => {
      'worklet';
      felt.value = false;
      startOffset.value = offset.value;
    })
    .onUpdate((e) => {
      'worklet';
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
      const open = drawerShouldSettleOpen(
        offset.value,
        openOffset,
        startOffset.value > 0,
        e.velocityY / 1000
      );
      // eslint-disable-next-line react-hooks/immutability
      offset.value = withSpring(open ? openOffset : 0, SPRING.pullBack, (finished) => {
        if (finished) scheduleOnRN(setExpanded, open);
      });
    });

  const cardStyle = useCardMorphStyle(
    offset,
    openOffset,
    { x: 0, y: 0, width: viewportWidth, height: viewportHeight, borderRadius: 0 },
    {
      x: (viewportWidth - collapsedWidth) / 2,
      y: openOffset,
      width: collapsedWidth,
      height: collapsedHeight,
      borderRadius: RADIUS.r24,
    }
  );
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

/** One large arrow: it jumps once to teach the physical pull, then travels with the camera. */
export function PullHandle({
  top,
  openTop,
  offset,
  openOffset,
  expanded,
  anchorRef,
  onPress,
}: {
  top: number;
  openTop: number;
  offset: SharedValue<number>;
  openOffset: number;
  expanded: boolean;
  /** Where the one-time "Pull down to peek" tip points. */
  anchorRef?: React.Ref<View>;
  onPress?: () => void;
}): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const swift = loadSwiftUI();
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
  const positionStyle = useAnimatedStyle(() => {
    const progress = openOffset > 0 ? Math.min(1, offset.value / openOffset) : 0;
    return {
      transform: [{ translateY: (openTop - top) * progress }],
    };
  });
  const chevronStyle = useAnimatedStyle(() => {
    const progress = openOffset > 0 ? Math.min(1, offset.value / openOffset) : 0;
    return { transform: [{ rotate: `${progress * 180}deg` }] };
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
        <Reanimated.View style={jumpStyle}>
          <Reanimated.View style={chevronStyle}>
            {swift ? (
              <NativeChevron swift={swift} breathe={!reduceMotion} color={arrowColor} />
            ) : (
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
            )}
          </Reanimated.View>
        </Reanimated.View>
      </Pressable>
    </Reanimated.View>
  );
}

/** Apple's chevron, breathing once as it appears (Reduce Motion: still). */
function NativeChevron({
  swift,
  breathe,
  color,
}: {
  swift: NonNullable<ReturnType<typeof loadSwiftUI>>;
  breathe: boolean;
  color: string;
}): React.JSX.Element {
  const { Host, Image } = swift.ui;
  const { symbolEffect } = swift.modifiers;
  return (
    <Host matchContents>
      <Image
        systemName="chevron.compact.down"
        size={ICON_SIZE.i24}
        color={color}
        modifiers={
          breathe
            ? [symbolEffect({ effect: 'breathe' }, { options: { repeat: 'nonRepeating' } })]
            : []
        }
      />
    </Host>
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
  handlePressed: {
    opacity: ALPHA.a80,
  },
});
