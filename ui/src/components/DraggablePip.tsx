import React, { useEffect } from 'react';
import { Image, StyleSheet } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import PostVideo from '@/components/PostVideo';
import { PIP_H, PIP_W, clampToZone, snapToCorner, type PipZone } from '@/lib/pip';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  DURATION,
  ELEVATION,
  RADIUS,
  SCALE,
  SHADOW_BLUR,
  SIZE,
  SPRING,
  withAlpha,
} from '@/constants/tokens';

interface DraggablePipProps {
  /** The second camera's photo (or video). */
  uri: string;
  /** Video posts: the shot is a video. It plays muted, looping, while `playing`. */
  video?: boolean;
  playing?: boolean;
  /** Where the photo may move (see pipZone). It starts bottom-left. */
  zone: PipZone;
  /** Tap: swap the big and small photos. */
  onTap: () => void;
  /** Change it to put the photo back in its start corner (a recycled list cell). */
  resetKey?: string;
}

/**
 * The small second-camera photo on a full-screen post, FaceTime-style: tap to swap photos,
 * press and hold to drag, and it snaps to the nearest corner of its safe zone on release.
 * Uses gesture-handler so it wins over the list scroll and page swipes underneath.
 */
export default function DraggablePip({
  uri,
  video = false,
  playing = false,
  zone,
  onTap,
  resetKey,
}: DraggablePipProps): React.JSX.Element {
  const x = useSharedValue(zone.left);
  const y = useSharedValue(zone.bottom);
  const startX = useSharedValue(zone.left);
  const startY = useSharedValue(zone.bottom);
  const scale = useSharedValue(1);
  // Whether the user has dragged it on this post: until then it follows its start corner.
  const moved = useSharedValue(false);

  useEffect(() => {
    x.set(zone.left);
    y.set(zone.bottom);
    scale.set(1);
    moved.set(false);
    // Only a new post moves it back; a changed zone keeps where the user put it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // The zone changes once the name row under it has been measured (or the text size changes):
  // not yet dragged, it moves to the new start corner; dragged, it stays put unless that spot is
  // now outside the zone (over the name row), when it moves just inside.
  const { left, right, top, bottom } = zone;
  useEffect(() => {
    const z = { left, right, top, bottom };
    const p = moved.get() ? clampToZone(x.get(), y.get(), z) : { x: left, y: bottom };
    x.set(p.x);
    y.set(p.y);
  }, [left, right, top, bottom, moved, x, y]);

  const pan = Gesture.Pan()
    .activateAfterLongPress(DURATION.d150)
    .onStart(() => {
      'worklet';
      moved.set(true);
      startX.set(x.get());
      startY.set(y.get());
      scale.set(withSpring(SCALE.s1_1, SPRING.lift));
      runOnJS(haptic)('pickUp');
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
      x.set(withSpring(p.x, SPRING.snap));
      y.set(withSpring(p.y, SPRING.snap));
      scale.set(withSpring(1, SPRING.lift));
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
        accessibilityLabel={video ? 'Small video. Swap with the big one' : 'Swap photos'}
        accessibilityHint="Press and hold to move it"
      >
        {video ? (
          <PostVideo uri={uri} playing={playing} muted style={styles.image} />
        ) : (
          <Image source={{ uri, cache: 'force-cache' }} style={styles.image} resizeMode="cover" />
        )}
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
    borderColor: withAlpha(COLORS.white, ALPHA.a60),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: SIZE.z3 },
    shadowOpacity: ALPHA.a35,
    shadowRadius: SHADOW_BLUR.b6,
    elevation: ELEVATION.e6,
  },
  image: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS.r10,
    overflow: 'hidden',
  },
});
