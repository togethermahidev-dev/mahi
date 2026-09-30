import React, { useEffect } from 'react';
import { Image, StyleSheet } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { PIP_H, PIP_W, clampToZone, snapToCorner, type PipZone } from '@/lib/pip';
import { COLORS, withAlpha, RADIUS, BORDER_WIDTH, SHADOW_BLUR, SIZE } from '@/constants/tokens';

interface DraggablePipProps {
  /** The second camera's photo. */
  uri: string;
  /** Where the photo may move (see pipZone). It starts bottom-left. */
  zone: PipZone;
  /** Tap: swap the big and small photos. */
  onTap: () => void;
  /** Change it to put the photo back in its start corner (a recycled list cell). */
  resetKey?: string;
}

const LIFT = { damping: 12, stiffness: 200 };
const SNAP = { damping: 16, stiffness: 140, overshootClamping: true };

/**
 * The small second-camera photo on a full-screen post, FaceTime-style: tap to swap photos,
 * press and hold to drag, and it snaps to the nearest corner of its safe zone on release.
 * Uses gesture-handler so it wins over the list scroll and page swipes underneath.
 */
export default function DraggablePip({
  uri,
  zone,
  onTap,
  resetKey,
}: DraggablePipProps): React.JSX.Element {
  const x = useSharedValue(zone.left);
  const y = useSharedValue(zone.bottom);
  const startX = useSharedValue(zone.left);
  const startY = useSharedValue(zone.bottom);
  const scale = useSharedValue(1);

  useEffect(() => {
    x.set(zone.left);
    y.set(zone.bottom);
    scale.set(1);
    // Only a new post moves it back; a changed zone keeps where the user put it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const pan = Gesture.Pan()
    .activateAfterLongPress(150)
    .onStart(() => {
      'worklet';
      startX.set(x.get());
      startY.set(y.get());
      scale.set(withSpring(1.1, LIFT));
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
    })
    .onUpdate((e) => {
      'worklet';
      const p = clampToZone(startX.get() + e.translationX, startY.get() + e.translationY, zone);
      x.set(p.x);
      y.set(p.y);
    })
    .onEnd(() => {
      'worklet';
      const p = snapToCorner(x.get(), y.get(), zone);
      x.set(withSpring(p.x, SNAP));
      y.set(withSpring(p.y, SNAP));
      scale.set(withSpring(1, LIFT));
    });

  const tap = Gesture.Tap().runOnJS(true).onEnd(onTap);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: scale.get() }],
  }));

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <Reanimated.View
        style={[styles.pip, animStyle]}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Swap photos"
        accessibilityHint="Press and hold to move it"
      >
        <Image source={{ uri }} style={styles.image} resizeMode="cover" />
      </Reanimated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  pip: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: PIP_W,
    height: PIP_H,
    borderRadius: RADIUS.r10,
    overflow: 'hidden',
    borderWidth: BORDER_WIDTH.w2,
    borderColor: withAlpha(COLORS.white, 0.6),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: SIZE.z3 },
    shadowOpacity: 0.35,
    shadowRadius: SHADOW_BLUR.b6,
    elevation: 6,
  },
  image: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS.r10,
  },
});
