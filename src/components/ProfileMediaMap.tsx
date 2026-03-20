import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Image,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useProfilePosts } from '@/hooks/useProfilePosts';
import type { Database } from '@/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PLACEHOLDER_IMG = require('../../assets/jogger.png') as number;

type PostRow = Database['public']['Tables']['posts']['Row'];

// ─── Layout constants ─────────────────────────────────────────────────────────

const CELL_SIZE             = 160;
const CELL_GAP              = 4;
const CELL_STEP             = CELL_SIZE + CELL_GAP;   // 164
const COLS                  = 2;
const GRID_W                = COLS * CELL_SIZE + (COLS - 1) * CELL_GAP; // 324
const ZOOM_BADGE_THRESHOLD  = 0.8;
const SCREEN_W              = Dimensions.get('window').width;

function computeGridH(postCount: number): number {
  if (postCount === 0) return 0;
  const rows = Math.ceil(postCount / COLS);
  return rows * CELL_SIZE + (rows - 1) * CELL_GAP;
}

// ─── Clamp (worklet-safe) ─────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(val, min), max);
}

// ─── Camera icon for empty state ─────────────────────────────────────────────

function CameraIcon({ color }: { color: string }) {
  return (
    <Svg width={48} height={48} viewBox="0 0 48 48" fill="none">
      {/* lens */}
      <Path
        d="M24 30a6 6 0 1 0 0-12 6 6 0 0 0 0 12z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* body */}
      <Path
        d="M6 18a4 4 0 0 1 4-4h2l3-4h18l3 4h2a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V18z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── StreakCell ───────────────────────────────────────────────────────────────
// Separate component so each tile owns its own useAnimatedStyle call
// (rules of hooks prohibit calling hooks inside a .map() loop).

interface StreakCellProps {
  post:    PostRow;
  left:    number;
  top:     number;
  scale:   SharedValue<number>;
  isNew:   boolean;
  dark:    boolean;
}

function StreakCell({ post, left, top, scale, isNew, dark }: StreakCellProps): React.JSX.Element {
  const badgeBg   = dark ? 'rgba(26,26,23,0.75)'  : 'rgba(232,232,227,0.75)';
  const badgeText = dark ? '#E8E8E3'               : '#1A1A17';

  // Flash shared value — pulses when this tile is newly added
  const flashOpacity = useSharedValue(0);

  useEffect(() => {
    if (isNew) {
      flashOpacity.value = withSequence(
        withTiming(0.25, { duration: 400 }),
        withTiming(0,    { duration: 600 }),
      );
    }
  }, [isNew]);

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: withTiming(scale.value < ZOOM_BADGE_THRESHOLD ? 1 : 0, { duration: 150 }),
  }));

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  const [imgError, setImgError] = useState(false);

  return (
    <View style={[styles.cell, { left, top }]}>
      <Image
        source={imgError || !post.image_url ? PLACEHOLDER_IMG : { uri: post.image_url }}
        style={styles.cellImage}
        resizeMode="cover"
        onError={() => setImgError(true)}
      />

      {/* New-post highlight flash */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.flashOverlay,
          flashStyle,
        ]}
      />

      {/* Streak day badge — fades in when zoomed out past threshold */}
      <Animated.View style={[styles.badge, { backgroundColor: badgeBg }, badgeStyle]}>
        <Text style={[styles.badgeText, { color: badgeText }]}>
          DAY {post.streak_day}
        </Text>
      </Animated.View>
    </View>
  );
}

// ─── ProfileMediaMap ──────────────────────────────────────────────────────────

interface ProfileMediaMapProps {
  userId: string;
  isSelf: boolean;
}

export default function ProfileMediaMap({ userId, isSelf }: ProfileMediaMapProps): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg       = dark ? '#1C1C19' : '#FFFFFF';
  const text     = dark ? '#E8E8E3' : '#1A1A17';
  const muted    = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const gridLine = dark ? 'rgba(232,232,227,0.06)' : 'rgba(26,26,23,0.08)';

  const { posts, isLoading } = useProfilePosts(userId);

  // Track newly added post to trigger highlight flash
  const prevCountRef    = useRef(posts.length);
  const [latestPostId, setLatestPostId] = useState<string | null>(null);

  useEffect(() => {
    if (posts.length > prevCountRef.current && posts.length > 0) {
      setLatestPostId(posts[0].id);
      const t = setTimeout(() => setLatestPostId(null), 1500);
      prevCountRef.current = posts.length;
      return () => clearTimeout(t);
    }
    prevCountRef.current = posts.length;
  }, [posts.length]);

  // ─── Grid geometry (JS thread) ───────────────────────────────────────────────
  const gridH = computeGridH(posts.length);

  // ─── Gesture shared values ───────────────────────────────────────────────────
  const translateX  = useSharedValue(0);
  const translateY  = useSharedValue(0);
  const scale       = useSharedValue(1);
  const savedTx     = useSharedValue(0);
  const savedTy     = useSharedValue(0);
  const savedScale  = useSharedValue(1);
  // gridH as a shared value so the pan clamp worklet always reads the current value
  const gridHShared = useSharedValue(gridH);
  const containerW  = useSharedValue(SCREEN_W);
  const containerH  = useSharedValue(400);

  // Keep gridHShared in sync when post count changes
  useEffect(() => {
    gridHShared.value = computeGridH(posts.length);
  }, [posts.length]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    containerW.value = e.nativeEvent.layout.width;
    containerH.value = e.nativeEvent.layout.height;
  }, []);

  // ─── Pinch — always active ───────────────────────────────────────────────────
  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = clamp(savedScale.value * e.scale, 0.3, 3.0);
    });

  // ─── Pan — only activates when zoomed in past 1.0× ──────────────────────────
  // Using manualActivation + onTouchesMove so the gesture fails (and falls
  // through to the outer PanResponder) when the canvas is at default zoom.
  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_, manager) => {
      if (scale.value > 1.0) {
        manager.activate();
      } else {
        manager.fail();
      }
    })
    .onStart(() => {
      savedTx.value = translateX.value;
      savedTy.value = translateY.value;
    })
    .onUpdate(({ translationX, translationY, numberOfPointers }) => {
      if (numberOfPointers !== 1) return;
      const scaledW = GRID_W * scale.value;
      const scaledH = gridHShared.value * scale.value;
      const maxX    = scaledW > containerW.value ? (scaledW - containerW.value) / 2 : 0;
      const maxY    = scaledH > containerH.value ? (scaledH - containerH.value) / 2 : 0;
      translateX.value = clamp(savedTx.value + translationX, -maxX, maxX);
      translateY.value = clamp(savedTy.value + translationY, -maxY, maxY);
    });

  const composed = Gesture.Simultaneous(pan, pinch);

  // ─── Canvas transform ────────────────────────────────────────────────────────
  const canvasAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // ─── Grid lines (static positions between tiles) ─────────────────────────────
  const rows       = Math.ceil(posts.length / COLS);
  const vertLines  = Array.from({ length: COLS - 1 }, (_, i) => (i + 1) * CELL_STEP - CELL_GAP / 2);
  const horizLines = Array.from({ length: Math.max(0, rows - 1) }, (_, i) => (i + 1) * CELL_STEP - CELL_GAP / 2);

  // ─── Loading state ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <ActivityIndicator color={muted} />
      </View>
    );
  }

  // ─── Empty state ─────────────────────────────────────────────────────────────
  if (posts.length === 0) {
    return (
      <View style={[styles.container, styles.emptyCenter, { backgroundColor: bg }]}>
        <CameraIcon color={muted} />
        <Text style={[styles.emptyTitle, { color: text }]}>
          {isSelf ? 'UPLOAD YOUR FIRST WORKOUT' : 'NO POSTS YET'}
        </Text>
        <Text style={[styles.emptySubtitle, { color: muted }]}>
          {isSelf
            ? 'Snap a photo and it will appear here.'
            : 'This user hasn\u2019t posted yet.'}
        </Text>
      </View>
    );
  }

  // ─── Canvas ──────────────────────────────────────────────────────────────────
  return (
    <View
      style={[styles.container, { backgroundColor: bg }]}
      onLayout={onLayout}
      onStartShouldSetResponder={() => true}
    >
      <GestureDetector gesture={composed}>
        <View style={styles.canvasWrapper}>
          <Animated.View
            style={[{ width: GRID_W, height: gridH }, canvasAnimStyle]}
          >
            {/* Subtle grid lines between cells */}
            {vertLines.map((x) => (
              <View
                key={`v${x}`}
                style={[styles.gridLineV, { left: x, height: gridH, backgroundColor: gridLine }]}
              />
            ))}
            {horizLines.map((y) => (
              <View
                key={`h${y}`}
                style={[styles.gridLineH, { top: y, width: GRID_W, backgroundColor: gridLine }]}
              />
            ))}

            {/* Photo tiles */}
            {posts.map((post, index) => {
              const col  = index % COLS;
              const row  = Math.floor(index / COLS);
              const left = col * CELL_STEP;
              const top  = row * CELL_STEP;
              return (
                <StreakCell
                  key={post.id}
                  post={post}
                  left={left}
                  top={top}
                  scale={scale}
                  isNew={post.id === latestPostId}
                  dark={dark}
                />
              );
            })}
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },
  emptyCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 3,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'JosefinSans_400Regular_Italic',
    textAlign: 'center',
  },
  canvasWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cell: {
    position: 'absolute',
    width:    CELL_SIZE,
    height:   CELL_SIZE,
    overflow: 'hidden',
    borderRadius: 4,
  },
  cellImage: {
    width:  CELL_SIZE,
    height: CELL_SIZE,
  },
  flashOverlay: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
  },
  badge: {
    position:     'absolute',
    bottom:       6,
    right:        6,
    borderRadius: 50,
    paddingVertical:   4,
    paddingHorizontal: 8,
  },
  badgeText: {
    fontSize:   11,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 1,
  },
  gridLineV: {
    position: 'absolute',
    top:   0,
    width: 0.5,
  },
  gridLineH: {
    position: 'absolute',
    left:   0,
    height: 0.5,
  },
});
