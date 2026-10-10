import React, { useLayoutEffect, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
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
  /** Where the photo may move on this post (see pipPlacement). It starts bottom-left. */
  zone: PipZone;
  /** How far down the post its fence reaches: it is never drawn past it (above the name row). */
  fence: number;
  /** Tap: swap the big and small photos. */
  onTap: () => void;
}

/**
 * The small second-camera photo on a full-screen post, FaceTime-style: tap to swap photos,
 * press and hold to drag, and it snaps to the nearest corner of its safe zone on release.
 * Uses gesture-handler so it wins over the list scroll and page swipes underneath.
 *
 * One of these belongs to one post: PostCard mounts it with the post's id as its key, and only
 * once that post's name row has been measured, so it never starts where another post left it.
 * It is drawn inside a fence that ends above the name row (owner, 2026-10-10: it must never
 * cover the name): if its position is a frame behind a change, the fence cuts it off.
 */
export default function DraggablePip({
  uri,
  video = false,
  playing = false,
  zone,
  fence,
  onTap,
}: DraggablePipProps): React.JSX.Element {
  // Numbers only for the worklets below (never the zone object itself).
  const { left, right, top, bottom } = zone;
  const x = useSharedValue(left);
  const y = useSharedValue(bottom);
  const startX = useSharedValue(left);
  const startY = useSharedValue(bottom);
  const scale = useSharedValue(1);

  // The corner it rests in (bottom-left until dragged), kept so a zone that moves — the text
  // under it changed height — takes the photo with it, to the same corner. (Not when it first
  // appears: it starts in its corner.)
  const atRight = useSharedValue(false);
  const atTop = useSharedValue(false);
  const placed = useRef(false);
  useLayoutEffect(() => {
    if (!placed.current) {
      placed.current = true;
      return;
    }
    x.set(atRight.get() ? right : left);
    y.set(atTop.get() ? top : bottom);
  }, [left, right, top, bottom, x, y, atRight, atTop]);

  const pan = Gesture.Pan()
    .activateAfterLongPress(DURATION.d150)
    .onStart(() => {
      'worklet';
      startX.set(x.get());
      startY.set(y.get());
      scale.set(withSpring(SCALE.s1_1, SPRING.lift));
      runOnJS(haptic)('pickUp');
    })
    .onUpdate((e) => {
      'worklet';
      const p = clampToZone(startX.get() + e.translationX, startY.get() + e.translationY, {
        left,
        right,
        top,
        bottom,
      });
      x.set(p.x);
      y.set(p.y);
    })
    .onEnd(() => {
      'worklet';
      // It always rests on a corner of the zone: never over the name row or the caption.
      const p = snapToCorner(x.get(), y.get(), { left, right, top, bottom });
      x.set(withSpring(p.x, SPRING.snap));
      y.set(withSpring(p.y, SPRING.snap));
      scale.set(withSpring(1, SPRING.lift));
      // (A zone squeezed to one row has no top corner: it counts as the bottom.)
      atRight.set(p.x === right);
      atTop.set(p.y === top && top < bottom);
    });

  const tap = Gesture.Tap().runOnJS(true).onEnd(onTap);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: scale.get() }],
  }));

  return (
    <View style={[styles.fence, { height: fence }]} pointerEvents="box-none">
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
    </View>
  );
}

const styles = StyleSheet.create({
  // The part of the post the photo may be drawn on: from the top down to just above the name
  // row. Touches that miss the photo pass through to the post underneath.
  fence: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
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
