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
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import Reanimated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
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
import {
  ALPHA,
  COLORS,
  ICON_SIZE,
  MOTION,
  RADIUS,
  SIZE,
  SPACE,
  SPRING,
  STROKE,
  SWIPE,
  withAlpha,
} from '@/constants/tokens';

/**
 * The pull gesture and the styles it drives. `enabled`: only while the waiting card shows.
 * `insetTop`: a drag from the status bar is left to the phone.
 */
export function useCameraPull(enabled: boolean, insetTop: number, viewportHeight: number) {
  const reduceMotion = useReducedMotion();
  const openOffset = viewportHeight * MOTION.pull.openScreenShare;
  const offset = useSharedValue(0);
  const startOffset = useSharedValue(0);
  const startY = useSharedValue(0);
  const startX = useSharedValue(0);
  const decided = useSharedValue(false);
  const felt = useSharedValue(false);
  const [expanded, setExpanded] = useState(false);

  // Leaving the waiting state mid-pull puts everything back.
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
    .onEnd(() => {
      'worklet';
      const open = drawerShouldSettleOpen(offset.value, openOffset, startOffset.value > 0);
      // eslint-disable-next-line react-hooks/immutability
      offset.value = withSpring(open ? openOffset : 0, SPRING.pullBack, (finished) => {
        if (finished) scheduleOnRN(setExpanded, open);
      });
    });

  // The live camera and its frost move together.
  const cameraStyle = useAnimatedStyle(() => {
    const progress = openOffset > 0 ? offset.value / openOffset : 0;
    return reduceMotion
      ? { opacity: interpolate(progress, [0, 1], [1, 0]) }
      : { transform: [{ translateY: offset.value }] };
  });
  // Reduce Motion: the frost thins instead.
  const frostStyle = useAnimatedStyle(() =>
    reduceMotion
      ? {
          opacity: interpolate(offset.value, [0, openOffset], [1, 0]),
        }
      : { transform: [{ translateY: offset.value }] }
  );
  // The card behind the glass.
  const behindStyle = useAnimatedStyle(() => {
    if (reduceMotion) return {};
    const progress = openOffset > 0 ? Math.min(1, offset.value / openOffset) : 0;
    const p = pullParallax(progress * MOTION.pull.limit);
    return {
      opacity: progress,
      transform: [{ translateY: p.translateY }, { scale: p.scale }],
    };
  });
  return { gesture, cameraStyle, frostStyle, behindStyle, expanded, toggle, openOffset };
}

/** The handle at the top of the waiting camera: a short bar and a chevron pointing down. */
export function PullHandle({
  top,
  anchorRef,
  direction = 'down',
  onPress,
}: {
  top: number;
  /** Where the one-time "Pull down to peek" tip points. */
  anchorRef?: React.Ref<View>;
  direction?: 'down' | 'up';
  onPress?: () => void;
}): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const swift = loadSwiftUI();
  const breath = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion || swift) return;
    breath.value = withSequence(
      withTiming(MOTION.pullHandleScale, { duration: MOTION.pullHandleMs }),
      withTiming(1, { duration: MOTION.pullHandleMs })
    );
  }, [reduceMotion, swift, breath]);
  const breathStyle = useAnimatedStyle(() => ({ transform: [{ scale: breath.value }] }));

  return (
    <Pressable
      ref={anchorRef}
      style={[styles.handleSpot, { top }]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={direction === 'down' ? 'Show accountability actions' : 'Close actions'}
      accessibilityHint={direction === 'down' ? 'Pull down or double tap' : undefined}
    >
      <Reanimated.View style={[styles.handleBar, breathStyle]} />
      {swift ? (
        <NativeChevron swift={swift} breathe={!reduceMotion} direction={direction} />
      ) : (
        <Reanimated.View style={breathStyle}>
          <Svg width={ICON_SIZE.i20} height={ICON_SIZE.i14} viewBox="0 0 24 14">
            <Path
              d={direction === 'down' ? 'M3 3l9 8 9-8' : 'M3 11l9-8 9 8'}
              stroke={withAlpha(COLORS.white, ALPHA.a75)}
              strokeWidth={STROKE.s2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Reanimated.View>
      )}
    </Pressable>
  );
}

/** Apple's chevron, breathing once as it appears (Reduce Motion: still). */
function NativeChevron({
  swift,
  breathe,
  direction,
}: {
  swift: NonNullable<ReturnType<typeof loadSwiftUI>>;
  breathe: boolean;
  direction: 'down' | 'up';
}): React.JSX.Element {
  const { Host, Image } = swift.ui;
  const { symbolEffect } = swift.modifiers;
  return (
    <Host matchContents>
      <Image
        systemName={direction === 'down' ? 'chevron.compact.down' : 'chevron.compact.up'}
        size={ICON_SIZE.i20}
        color={withAlpha(COLORS.white, ALPHA.a75)}
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
  handleSpot: {
    position: 'absolute',
    left: 0,
    right: 0,
    minHeight: SIZE.z44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.s4,
  },
  handleBar: {
    width: SIZE.z36,
    height: SIZE.z4,
    borderRadius: RADIUS.pill,
    backgroundColor: withAlpha(COLORS.white, ALPHA.a60),
  },
});
