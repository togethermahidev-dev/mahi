/**
 * The waiting camera gives a little when pulled down (owner, 2026-10-07, #115): the live camera
 * and its frost slide down at most MOTION.pull.limit (a rubber band), and the waiting card, which
 * sits "behind" the glass, moves a share of that and grows to full size. Letting go springs it
 * back. One tick as it passes its mark. A small handle with a chevron says it can be pulled; it
 * breathes once when it shows (Apple's own symbol effect on an iPhone build with @expo/ui, ours
 * elsewhere). Rules and geometry: src/lib/cameraPull.ts.
 *
 * Reduce Motion: nothing slides or grows — the frost thins a little as you pull, and comes back.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { pullFelt, pullOffset, pullParallax, verticalPull } from '@/lib/cameraPull';
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
  withAlpha,
} from '@/constants/tokens';

/**
 * The pull gesture and the styles it drives. `enabled`: only while the waiting card shows.
 * `insetTop`: a drag from the status bar is left to the phone.
 */
export function useCameraPull(enabled: boolean, insetTop: number) {
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(0);
  const startY = useSharedValue(0);
  const startX = useSharedValue(0);
  const decided = useSharedValue(false);
  const felt = useSharedValue(false);

  // Leaving the waiting state mid-pull puts everything back.
  useEffect(() => {
    if (!enabled) offset.value = 0;
  }, [enabled, offset]);

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
      const decision = verticalPull({
        startY: startY.value,
        dx: t.absoluteX - startX.value,
        dy: t.absoluteY - startY.value,
        insetTop,
      });
      if (decision === 'wait') return;
      decided.value = true;
      if (decision === 'activate') manager.activate();
      else manager.fail();
    })
    .onStart(() => {
      'worklet';
      felt.value = false;
    })
    .onUpdate((e) => {
      'worklet';
      offset.value = pullOffset(e.absoluteY - startY.value);
      if (pullFelt(offset.value, felt.value)) {
        felt.value = true;
        scheduleOnRN(haptic, 'tick');
      }
    })
    .onFinalize(() => {
      'worklet';
      offset.value = withSpring(0, SPRING.pullBack);
    });

  // The live camera and its frost move together.
  const cameraStyle = useAnimatedStyle(() =>
    reduceMotion ? {} : { transform: [{ translateY: offset.value }] }
  );
  // Reduce Motion: the frost thins instead.
  const frostStyle = useAnimatedStyle(() =>
    reduceMotion
      ? {
          opacity: interpolate(offset.value, [0, MOTION.pull.limit], [1, MOTION.pullFrostLow]),
        }
      : { transform: [{ translateY: offset.value }] }
  );
  // The card behind the glass.
  const behindStyle = useAnimatedStyle(() => {
    if (reduceMotion) return {};
    const p = pullParallax(offset.value);
    return { transform: [{ translateY: p.translateY }, { scale: p.scale }] };
  });
  return { gesture, cameraStyle, frostStyle, behindStyle };
}

/** The handle at the top of the waiting camera: a short bar and a chevron pointing down. */
export function PullHandle({
  top,
  anchorRef,
}: {
  top: number;
  /** Where the one-time "Pull down for your mates" tip points. */
  anchorRef?: React.Ref<View>;
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
    <View
      ref={anchorRef}
      collapsable={false}
      pointerEvents="none"
      style={[styles.handleSpot, { top }]}
      accessible
      accessibilityLabel="Pull down to see your mates behind the camera"
    >
      <Reanimated.View style={[styles.handleBar, breathStyle]} />
      {swift ? (
        <NativeChevron swift={swift} breathe={!reduceMotion} />
      ) : (
        <Reanimated.View style={breathStyle}>
          <Svg width={ICON_SIZE.i20} height={ICON_SIZE.i14} viewBox="0 0 24 14">
            <Path
              d="M3 3l9 8 9-8"
              stroke={withAlpha(COLORS.white, ALPHA.a75)}
              strokeWidth={STROKE.s2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Reanimated.View>
      )}
    </View>
  );
}

/** Apple's chevron, breathing once as it appears (Reduce Motion: still). */
function NativeChevron({
  swift,
  breathe,
}: {
  swift: NonNullable<ReturnType<typeof loadSwiftUI>>;
  breathe: boolean;
}): React.JSX.Element {
  const { Host, Image } = swift.ui;
  const { symbolEffect } = swift.modifiers;
  return (
    <Host matchContents>
      <Image
        systemName="chevron.compact.down"
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
    alignItems: 'center',
    gap: SPACE.s4,
  },
  handleBar: {
    width: SIZE.z36,
    height: SIZE.z4,
    borderRadius: RADIUS.pill,
    backgroundColor: withAlpha(COLORS.white, ALPHA.a60),
  },
});
