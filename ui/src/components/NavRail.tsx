import React, { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import { haptic } from '@/lib/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useChromeFade } from '@/hooks/useChrome';
import {
  CameraIcon,
  FeedIcon,
  MessagesIcon,
  ProfileIcon,
  type IconProps,
} from '@/components/ScreenIcons';
import {
  COLORS,
  ALPHA,
  BLUR_INTENSITY,
  BORDER_WIDTH,
  DURATION,
  ICON_SIZE,
  LAYER,
  NAV_RAIL,
  RADIUS,
  SHADOW_BLUR,
  SIZE,
  SPACE,
  SPRING,
  withAlpha,
} from '@/constants/tokens';
import {
  followSpan,
  morphPlan,
  nearestSlot,
  slotSpan,
  type RailGeometry,
  type RailTab,
} from '@/lib/railSelector';
import type { Rect } from '@/lib/swipeRules';
import { NATIVE_TABS } from '@/lib/nativeTabs';
import { TAP_AREA, tapSlop } from '@/lib/tapArea';

export type { RailTab };

const ICONS: Record<RailTab, React.ComponentType<IconProps>> = {
  camera: CameraIcon,
  feed: FeedIcon,
  profile: ProfileIcon,
  messages: MessagesIcon,
};

// In the swipe order (Camera, Feed, Profile, Messages), like the pages and the phone's tab bar.
const TABS = NATIVE_TABS.map((t) => ({ key: t.key, label: t.title, Icon: ICONS[t.key] }));

// ─── Selector motion (nav-rail-morph) ─────────────────────────────────────────
/** The leading edge reaching the new icon while the trailing edge holds: the stretch. */
const STRETCH = {
  duration: DURATION.d140,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.Never,
};
/** The trailing edge catching up: the contract onto the new icon. */
const CONTRACT = { ...SPRING.railContract, reduceMotion: ReduceMotion.Never };
/** Following a dragging finger: the leading edge keeps up, the trailing edge lags a little. */
const FOLLOW_LEAD = { ...SPRING.railLead, reduceMotion: ReduceMotion.Never };
const FOLLOW_TRAIL = { ...SPRING.railTrail, reduceMotion: ReduceMotion.Never };
/** With Reduce Motion on: a plain move, no stretch. */
const MOVE = {
  duration: DURATION.d180,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.Never,
};

interface NavRailProps {
  active: RailTab;
  onSelect: (tab: RailTab) => void;
  /** The screen behind is dark (Camera), so icons go light whatever the theme. */
  onDark: boolean;
  /** Android blurs this view's content (expo-blur needs a BlurTargetView ref there). */
  blurTarget?: React.RefObject<View | null>;
  /**
   * nav-rail-morph: one floating pill with an outline and shadow, a single selector that slides
   * and stretches between icons, and hold-and-drag to switch. Off = the rail as it was.
   */
  morph?: boolean;
  /** Where the rail is on screen (window coordinates), so the page swipe can leave it alone. */
  onRect?: (rect: Rect) => void;
  /**
   * The dock: the same glass bar lying along the bottom, centred, for Feed, Profile and Messages
   * (owner, 2026-10-06). Plain taps only (no morph), and it fades while a post is held.
   */
  dock?: boolean;
}

/**
 * Floating glass rail on the left edge of the Camera (owner, 2026-10-02; see `railShows`), and
 * the same bar lying along the bottom of Feed, Profile and Messages (`dock`, `dockShows`): Apple's
 * Liquid Glass on iOS 26+, a frosted blur on older iPhones and on Android. Inside the safe area.
 */
export default function NavRail({
  active,
  onSelect,
  onDark,
  blurTarget,
  morph: morphOn = false,
  onRect,
  dock = false,
}: NavRailProps) {
  const morph = morphOn && !dock;
  const { colors, navRail } = useAppTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const chrome = useChromeFade();
  const scheme = onDark ? 'dark' : 'light';
  const iconColor = onDark ? colors.offWhite : colors.offBlack;
  const button = navRail.width - SIZE.z8;
  // Buttons are 44 (Apple's size). On Android each taps as 48: 2 of slop a side stays inside the
  // rail's 4 of padding and the 6 between buttons, so no two overlap.
  const buttonSlop = Platform.OS === 'android' ? tapSlop(button, TAP_AREA.android) : undefined;

  const geometry: RailGeometry = {
    padding: SPACE.s4,
    button,
    gap: navRail.gap,
    count: TABS.length,
  };
  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => t.key === active)
  );

  // ─── The selector (morph only) ──────────────────────────────────────────────
  const start = slotSpan(geometry, activeIndex);
  const top = useSharedValue(start.top);
  const bottom = useSharedValue(start.bottom);
  const activeSV = useSharedValue(activeIndex);
  const dragging = useSharedValue(false);
  const lastPicked = useSharedValue(activeIndex);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // The screen changed (tap, page swipe or drag): slide over, stretching then contracting.
  useEffect(() => {
    activeSV.value = activeIndex;
    if (!morph || dragging.value) return;
    const target = slotSpan(geometry, activeIndex);
    const plan = morphPlan({ top: top.value, bottom: bottom.value }, target, reduceMotion);
    if (reduceMotion) {
      top.value = withTiming(plan.settle.top, MOVE);
      bottom.value = withTiming(plan.settle.bottom, MOVE);
      return;
    }
    top.value = withSequence(
      withTiming(plan.stretch.top, STRETCH),
      withSpring(plan.settle.top, CONTRACT)
    );
    bottom.value = withSequence(
      withTiming(plan.stretch.bottom, STRETCH),
      withSpring(plan.settle.bottom, CONTRACT)
    );
    // geometry is rebuilt each render from fixed tokens; the active icon is what moves it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, morph]);

  const selectorStyle = useAnimatedStyle(() => ({
    top: top.value,
    height: bottom.value - top.value,
  }));

  // Switch screens live as the finger passes each icon.
  const pick = (i: number) => {
    haptic('selection');
    onSelectRef.current(TABS[i].key);
  };

  const follow = (y: number) => {
    'worklet';
    const span = followSpan(geometry, y);
    if (reduceMotion) {
      top.value = span.top;
      bottom.value = span.bottom;
    } else {
      const down = span.top > top.value;
      top.value = withSpring(span.top, down ? FOLLOW_TRAIL : FOLLOW_LEAD);
      bottom.value = withSpring(span.bottom, down ? FOLLOW_LEAD : FOLLOW_TRAIL);
    }
    const i = nearestSlot(geometry, y);
    if (i !== lastPicked.value) {
      lastPicked.value = i;
      scheduleOnRN(pick, i);
    }
  };

  const grab = (y: number) => {
    'worklet';
    dragging.value = true;
    lastPicked.value = activeSV.value;
    cancelAnimation(top);
    cancelAnimation(bottom);
    follow(y);
  };

  // Only the gesture that picked the selector up ends it (onEnd runs for an active gesture only).
  const drop = () => {
    'worklet';
    if (!dragging.value) return;
    dragging.value = false;
    const target = slotSpan(geometry, lastPicked.value);
    top.value = withSpring(target.top, CONTRACT);
    bottom.value = withSpring(target.bottom, CONTRACT);
  };

  // Press and hold, then drag; or drag along the rail straight away. A plain tap is left to the
  // buttons. Either way the touch belongs to the rail: the page swipe skips the rail (onRect).
  const hold = Gesture.Pan()
    .activateAfterLongPress(NAV_RAIL.holdMs)
    .onStart((e) => {
      'worklet';
      grab(e.y);
    })
    .onUpdate((e) => {
      'worklet';
      follow(e.y);
    })
    .onEnd(() => {
      'worklet';
      drop();
    });
  const drag = Gesture.Pan()
    .activeOffsetY([-SPACE.s8, SPACE.s8])
    .onStart((e) => {
      'worklet';
      grab(e.y);
    })
    .onUpdate((e) => {
      'worklet';
      follow(e.y);
    })
    .onEnd(() => {
      'worklet';
      drop();
    });
  const railGesture = Gesture.Race(hold, drag);

  // Where the rail sits on screen, for the page swipe.
  const wrapperRef = useRef<View | null>(null);
  const measure = () => {
    if (!onRect) return;
    wrapperRef.current?.measureInWindow((x, y, width, height) => onRect({ x, y, width, height }));
  };

  const buttons = TABS.map(({ key, label, Icon }) => {
    const selected = key === active;
    return (
      <Pressable
        key={key}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        hitSlop={buttonSlop}
        onPress={() => {
          if (selected) return;
          haptic('selection');
          onSelect(key);
        }}
        style={({ pressed }) => [
          styles.button,
          { width: button, height: button },
          dock ? { marginHorizontal: navRail.gap / 2 } : { marginVertical: navRail.gap / 2 },
          selected && !morph && { backgroundColor: colors.accent },
          pressed && styles.pressed,
        ]}
      >
        <Icon size={ICON_SIZE.i20} color={selected ? colors.offBlack : iconColor} />
      </Pressable>
    );
  });

  const content = morph ? (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.selector,
          { width: button, left: (navRail.width - button) / 2, backgroundColor: colors.accent },
          selectorStyle,
        ]}
      />
      {buttons}
    </>
  ) : (
    buttons
  );

  const shape = dock
    ? [styles.dock, { height: navRail.width, borderRadius: navRail.width / 2 }]
    : [styles.rail, { width: navRail.width, borderRadius: navRail.width / 2 }];

  let body: React.JSX.Element;
  if (isLiquidGlassAvailable()) {
    body = (
      <GlassView style={shape} glassEffectStyle="regular" colorScheme={scheme} isInteractive>
        {content}
      </GlassView>
    );
  } else if (Platform.OS === 'ios' || blurTarget) {
    body = (
      <BlurView
        style={[shape, styles.clip]}
        intensity={BLUR_INTENSITY.i60}
        tint={onDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        blurTarget={blurTarget}
        blurMethod="dimezisBlurViewSdk31Plus"
      >
        {content}
      </BlurView>
    );
  } else {
    body = (
      <View style={[shape, { backgroundColor: onDark ? colors.glassOnDark : colors.glassOnLight }]}>
        {content}
      </View>
    );
  }

  if (morph) {
    // One floating pill: a soft shadow under the glass and a clear outline around it.
    const pill = { borderRadius: navRail.width / 2 };
    body = (
      <GestureDetector gesture={railGesture}>
        <View ref={wrapperRef} onLayout={measure} style={[pill, styles.float]}>
          {body}
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              pill,
              styles.outline,
              {
                borderColor: onDark
                  ? withAlpha(COLORS.white, NAV_RAIL.outlineOnDark)
                  : withAlpha(COLORS.ink, NAV_RAIL.outlineOnLight),
              },
            ]}
          />
        </View>
      </GestureDetector>
    );
  }

  if (dock) {
    // One floating pill, as the morph rail: a soft shadow under the glass and a clear outline.
    const pill = { borderRadius: navRail.width / 2 };
    return (
      <View
        pointerEvents="box-none"
        style={[styles.dockAnchor, { bottom: insets.bottom + navRail.edgeGap }]}
      >
        <Animated.View
          pointerEvents={chrome.viewing ? 'none' : 'auto'}
          accessibilityRole="tablist"
          style={[pill, styles.float, chrome.style]}
        >
          {body}
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              pill,
              styles.outline,
              {
                borderColor: onDark
                  ? withAlpha(COLORS.white, NAV_RAIL.outlineOnDark)
                  : withAlpha(COLORS.ink, NAV_RAIL.outlineOnLight),
              },
            ]}
          />
        </Animated.View>
      </View>
    );
  }

  return (
    <View
      pointerEvents="box-none"
      accessibilityRole="tablist"
      onLayout={morph ? measure : undefined}
      style={[
        styles.anchor,
        {
          left: insets.left + navRail.edgeGap,
          top: insets.top,
          bottom: insets.bottom,
        },
      ]}
    >
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    justifyContent: 'center',
    zIndex: LAYER.rail,
  },
  rail: {
    alignItems: 'center',
    paddingVertical: SPACE.s4,
  },
  dockAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: LAYER.rail,
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.s4,
  },
  clip: {
    overflow: 'hidden',
  },
  pressed: {
    opacity: ALPHA.a70,
  },
  button: {
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selector: {
    position: 'absolute',
    borderRadius: RADIUS.pill,
  },
  float: {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: SIZE.z4,
        blurRadius: SHADOW_BLUR.b12,
        color: withAlpha(COLORS.black, NAV_RAIL.shadowOpacity),
      },
    ],
  },
  outline: {
    borderWidth: BORDER_WIDTH.w1_5,
  },
});
