import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  avatarCircleSize,
  avatarTapCloses,
  backdropOpacity,
  clampPan,
  clampZoom,
  doubleTapZoom,
  swipeCloses,
} from '@/lib/viewer';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  withAlpha,
  FONT_SIZE,
  LINE_HEIGHT,
  OFFSET,
  RADIUS,
  SIZE,
  VIEWER,
} from '@/constants/tokens';

interface AvatarViewerProps {
  /** The profile picture to show; null keeps the viewer closed. */
  uri: string | null;
  onClose: () => void;
}

/**
 * A profile picture, as a circle in the middle of a dark screen (founder, 2026-10-05: a big
 * square was too invasive): pinch (or double tap) to zoom, drag a zoomed photo around. To close:
 * tap the dark space around it, drag it away in any direction, the ✕, or the back gesture.
 * Opened by tapping the picture on your own profile or anyone else's.
 */
export default function AvatarViewer({ uri, onClose }: AvatarViewerProps): React.JSX.Element {
  // Keep showing the photo while the viewer fades out after `uri` goes null.
  const [shown, setShown] = useState(uri);
  if (uri && uri !== shown) setShown(uri);

  return (
    <Modal
      visible={!!uri}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* A Modal is its own native window: gesture-handler needs its own root here. */}
      <GestureHandlerRootView style={styles.root}>
        {shown ? <ZoomablePhoto key={shown} uri={shown} onClose={onClose} /> : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

function ZoomablePhoto({ uri, onClose }: { uri: string; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // A circle, a share of the screen's short side.
  const size = avatarCircleSize(width, height);
  const far = Math.max(width, height);

  const scale = useSharedValue<number>(VIEWER.zoomMin);
  const startScale = useSharedValue<number>(VIEWER.zoomMin);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      'worklet';
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      'worklet';
      scale.value = clampZoom(startScale.value * e.scale);
    })
    .onEnd(() => {
      'worklet';
      // Zoomed out a little: keep the photo's edges on screen.
      x.value = withSpring(clampPan(x.value, scale.value, size), VIEWER.snapBack);
      y.value = withSpring(clampPan(y.value, scale.value, size), VIEWER.snapBack);
    });

  // One finger: moves a zoomed photo around inside its edges; on a fitted photo, it drags the
  // photo away and lets go to close (or springs back).
  const pan = Gesture.Pan()
    .maxPointers(1)
    .onStart(() => {
      'worklet';
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((e) => {
      'worklet';
      if (scale.value > VIEWER.zoomMin) {
        x.value = clampPan(startX.value + e.translationX, scale.value, size);
        y.value = clampPan(startY.value + e.translationY, scale.value, size);
      } else {
        x.value = e.translationX;
        y.value = e.translationY;
      }
    })
    .onEnd((e, success) => {
      'worklet';
      if (scale.value > VIEWER.zoomMin) return;
      const distance = Math.hypot(e.translationX, e.translationY);
      const speed = Math.hypot(e.velocityX, e.velocityY);
      if (success && swipeCloses(distance, speed)) {
        // Off screen the way it was thrown, then close.
        const dx = distance ? e.translationX / distance : e.velocityX / (speed || 1);
        const dy = distance ? e.translationY / distance : e.velocityY / (speed || 1);
        x.value = withTiming(dx * far, { duration: VIEWER.closeMs });
        y.value = withTiming(dy * far, { duration: VIEWER.closeMs }, (done) => {
          if (done) scheduleOnRN(onClose);
        });
      } else {
        x.value = withSpring(0, VIEWER.snapBack);
        y.value = withSpring(0, VIEWER.snapBack);
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      scale.value = withSpring(doubleTapZoom(scale.value), VIEWER.snapBack);
      x.value = withSpring(0, VIEWER.snapBack);
      y.value = withSpring(0, VIEWER.snapBack);
    });

  // A tap on the dark space around the picture closes it; on the picture it does nothing.
  const tapOutside = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd((e) => {
      'worklet';
      if (
        avatarTapCloses({
          x: e.absoluteX,
          y: e.absoluteY,
          cx: width / 2 + x.value,
          cy: height / 2 + y.value,
          size,
          scale: scale.value,
        })
      ) {
        scheduleOnRN(onClose);
      }
    });

  const photoStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));
  // The dark background clears as a fitted photo is dragged away.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: scale.value > VIEWER.zoomMin ? 1 : backdropOpacity(Math.hypot(x.value, y.value)),
  }));

  return (
    <View style={styles.root} accessibilityViewIsModal onAccessibilityEscape={onClose}>
      <Reanimated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
      <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap, tapOutside)}>
        <View style={styles.stage}>
          <Reanimated.View style={photoStyle}>
            <Image
              source={{ uri }}
              style={{ width: size, height: size, borderRadius: size / 2 }}
              resizeMode="cover"
              accessibilityRole="image"
              accessibilityLabel="Profile photo"
              accessibilityHint="Pinch to zoom. Tap outside it or swipe it away to close"
            />
          </Reanimated.View>
        </View>
      </GestureDetector>

      {/* ✕ — always there to close */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close photo"
        style={({ pressed }) => [
          styles.close,
          { top: insets.top + OFFSET.o8 },
          pressed && { opacity: 0.8 },
        ]}
        onPress={onClose}
        hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
      >
        <Text style={styles.closeX}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: COLORS.black,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: {
    position: 'absolute',
    right: OFFSET.o24,
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    backgroundColor: withAlpha(COLORS.white, 0.15),
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeX: {
    fontSize: FONT_SIZE.f18,
    lineHeight: LINE_HEIGHT.l20,
    color: COLORS.white,
    fontFamily: FONTS.semiBold,
  },
});
