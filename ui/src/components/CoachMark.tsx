import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useAuthStore } from '@/store';
import { useCoachStore } from '@/store/coachStore';
import { useToastStore } from '@/store/toastStore';
import { useAppTheme } from '@/hooks/useAppTheme';
import { CameraIcon, FeedIcon, NotificationsIcon, ProfileIcon } from '@/components/ScreenIcons';
import { hasNativeExpoUI, loadSwiftUI } from '@/lib/expoUiModule';
import { themeColors } from '@/lib/themeColors';
import {
  COACH_TIPS,
  anchorVisible,
  coachBubbleLayout,
  coachQueue,
  coachStepLabel,
  coachTipText,
  nextCoachTip,
  sameRect,
  spotlightPath,
  spotlightRect,
  tipPresenter,
  type CoachIcon,
  type CoachTipId,
  type Rect,
} from '@/lib/coachMarks';
import { FONTS } from '@/constants/fonts';
import { TYPOGRAPHY } from '@/constants/typography';
import {
  ALPHA,
  BLUR_INTENSITY,
  BORDER_WIDTH,
  COACH,
  COLORS,
  DURATION,
  ELEVATION,
  FONT_SIZE,
  ICON_SIZE,
  LAYER,
  MOTION,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  WAIT,
  withAlpha,
} from '@/constants/tokens';

type Size = { width: number; height: number };

/** The arrow's two slanted sides, pointing up (turned over when the bubble sits above). */
const ARROW_PATH = `M0 ${COACH.arrowHeight}L${COACH.arrowWidth / 2} 0L${COACH.arrowWidth} ${COACH.arrowHeight}`;
const GOT_IT_SLOP = { top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 };

/**
 * Where one-time tips appear (rules and geometry: src/lib/coachMarks.ts). Mounted over the swipe
 * pages (HorizontalNavigator) and inside the post preview (`compose`), which is its own window.
 * Picks the one tip to show, then measures the thing it explains until two readings a beat apart
 * agree and it is wholly on screen; it keeps measuring while the tip shows and hides the tip if
 * the thing moves away. The anchor and this layer are measured in the same window, so the
 * pager's sideways strip and the header's slide are taken into account.
 * - iPhone with @expo/ui (build 11+): Apple's own popover, attached to a clear frame laid exactly
 *   over the thing (the thing itself is never wrapped, so its layout and gestures don't change).
 *   A tap outside or "Got it" closes it.
 * - Elsewhere (build 10, Android): the page dims around a bright rounded cut-out of the thing,
 *   with a gently breathing accent ring, and a frosted bubble whose arrow points at its middle.
 *   Any tap closes it. VoiceOver reads it and stays on it; Reduce Motion: fades, no breathing.
 */
export default function CoachMarkHost({
  compose = false,
}: {
  /** Inside the post preview: shows only its tip. */
  compose?: boolean;
}): React.JSX.Element {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const anchors = useCoachStore((s) => s.anchors);
  const seen = useCoachStore((s) => s.seen);
  const page = useCoachStore((s) => (s.composing ? 'compose' : s.page));
  const blocked = useCoachStore((s) => s.blocks > 0);
  const current = useCoachStore((s) => s.current);
  const toast = useToastStore((s) => s.message !== null);
  const rootRef = useRef<View>(null);
  const [shown, setShown] = useState<{ tip: CoachTipId; anchor: Rect; container: Size } | null>(
    null
  );
  const presenter = tipPresenter(Platform.OS, hasNativeExpoUI());

  useEffect(() => {
    if (userId && !compose) useCoachStore.getState().loadSeen(userId);
  }, [userId, compose]);

  const requested = Object.keys(anchors) as CoachTipId[];
  const tip = nextCoachTip({ requested, seen, page, blocked: blocked || toast, current });
  const mine = tip !== null && (COACH_TIPS[tip].page === 'compose') === compose ? tip : null;

  // "2 of 3": the tips closed on this page since it came up.
  const [closed, setClosed] = useState({ page, count: 0 });
  const closedHere = closed.page === page ? closed.count : 0;
  const step = coachStepLabel(closedHere, coachQueue({ requested, seen, page }).length);

  useEffect(() => {
    if (!mine) return;
    const id: CoachTipId = mine;
    let live = true;
    let showing = false;
    let last: Rect | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const later = () => {
      if (live) timer = setTimeout(measure, showing ? COACH.remeasureMs : WAIT.coachMark);
    };
    const hide = () => {
      showing = false;
      setShown(null);
    };
    function measure() {
      const anchor = useCoachStore.getState().anchors[id]?.current;
      const root = rootRef.current;
      if (!anchor || !root) {
        if (showing) hide();
        return later();
      }
      root.measureInWindow((rx, ry, width, height) => {
        anchor.measureInWindow((ax, ay, aw, ah) => {
          if (!live) return;
          const rect = { x: ax - rx, y: ay - ry, width: aw, height: ah };
          const container = { width, height };
          if (!anchorVisible(rect, container)) {
            // Slid away, on another page, or not laid out: no tip until it's back.
            last = null;
            if (showing) hide();
            return later();
          }
          const settled = sameRect(rect, last);
          last = rect;
          if (!showing && settled) {
            showing = true;
            setShown({ tip: id, anchor: rect, container });
            useCoachStore.getState().setCurrent(id);
            AccessibilityInfo.announceForAccessibility(coachTipText(id));
          } else if (showing && !settled) {
            setShown({ tip: id, anchor: rect, container });
          }
          later();
        });
      });
    }
    later();
    return () => {
      live = false;
      clearTimeout(timer);
      setShown(null);
      if (useCoachStore.getState().current === mine) useCoachStore.getState().setCurrent(null);
    };
  }, [mine]);

  const close = () => {
    if (!shown) return;
    setClosed({ page, count: closedHere + 1 });
    useCoachStore.getState().markSeen(shown.tip);
    setShown(null);
  };

  const custom = shown !== null && presenter === 'custom';
  return (
    <View
      ref={rootRef}
      collapsable={false}
      pointerEvents="box-none"
      // VoiceOver stays on our own tip until it is closed (Apple's popover does this itself).
      accessibilityViewIsModal={custom}
      style={[StyleSheet.absoluteFill, styles.layer]}
    >
      {shown && presenter === 'native' ? (
        <NativeTip
          tip={shown.tip}
          anchor={shown.anchor}
          step={step}
          dark={COACH_TIPS[shown.tip].page !== 'feed'}
          onClose={close}
        />
      ) : null}
      {shown && custom ? (
        <Spotlight
          tip={shown.tip}
          anchor={shown.anchor}
          container={shown.container}
          step={step}
          onClose={close}
        />
      ) : null}
    </View>
  );
}

// ─── Apple's popover (iPhone, build 11+) ─────────────────────────────────────

function NativeTip({
  tip,
  anchor,
  step,
  dark,
  onClose,
}: {
  tip: CoachTipId;
  anchor: Rect;
  step: string | null;
  /** The Camera and the post preview are always dark; the Feed follows the app's setting. */
  dark: boolean;
  onClose: () => void;
}): React.JSX.Element | null {
  const theme = useAppTheme();
  const swift = loadSwiftUI();
  if (!swift) return null;
  const { Host, Popover, RNHostView, Spacer, VStack } = swift.ui;
  const { frame } = swift.modifiers;
  const onDark = dark || theme.dark;
  const box = { left: anchor.x, top: anchor.y, width: anchor.width, height: anchor.height };

  return (
    // A clear frame laid exactly over the thing: iOS attaches the popover's arrow to it. Touches
    // pass through it; while the popover is up, iOS closes it on a tap anywhere outside.
    <View pointerEvents="none" style={[styles.nativeFrame, box]}>
      <Host style={StyleSheet.absoluteFill} colorScheme={onDark ? 'dark' : 'light'}>
        <Popover
          isPresented
          onIsPresentedChange={(open) => {
            if (!open) onClose();
          }}
        >
          <Popover.Trigger>
            <VStack modifiers={[frame({ width: anchor.width, height: anchor.height })]}>
              <Spacer />
            </VStack>
          </Popover.Trigger>
          <Popover.Content>
            <RNHostView matchContents>
              <View style={styles.popover}>
                <TipCard tip={tip} step={step} onDark={onDark} onClose={onClose} />
              </View>
            </RNHostView>
          </Popover.Content>
        </Popover>
      </Host>
    </View>
  );
}

// ─── Our own tip (build 10, Android) ─────────────────────────────────────────

function Spotlight({
  tip,
  anchor,
  container,
  step,
  onClose,
}: {
  tip: CoachTipId;
  anchor: Rect;
  container: Size;
  step: string | null;
  onClose: () => void;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const spot = spotlightRect(anchor, COACH.spotPad, container);
  const radius = Math.min(COACH.spotRadius, spot.height / 2, spot.width / 2);
  // The bubble is measured once, unseen, so it can go below or above by its real height.
  const [bubbleHeight, setBubbleHeight] = useState<number | null>(null);
  const layout = coachBubbleLayout({
    spot,
    container,
    bubbleHeight: bubbleHeight ?? 0,
    maxWidth: COACH.bubbleWidth,
    margin: SPACE.s16,
    gap: SPACE.s4,
    arrowWidth: COACH.arrowWidth,
    arrowHeight: COACH.arrowHeight,
    radius: RADIUS.r16,
    safeTop: insets.top,
    safeBottom: insets.bottom,
  });

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* The page dims around the bright cut-out; a tap anywhere closes the tip. */}
      <Reanimated.View
        entering={FadeIn.duration(DURATION.d200)}
        exiting={FadeOut.duration(DURATION.d180)}
        style={StyleSheet.absoluteFill}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
        >
          <Svg width={container.width} height={container.height} pointerEvents="none">
            <Path
              d={spotlightPath(container, spot, radius)}
              fill={withAlpha(COLORS.black, COACH.dim)}
              fillRule="evenodd"
            />
          </Svg>
        </Pressable>
      </Reanimated.View>
      <PulseRing spot={spot} radius={radius} />
      {bubbleHeight === null ? (
        <View
          style={[styles.measure, { width: layout.width }]}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onLayout={(e) => setBubbleHeight(e.nativeEvent.layout.height)}
        >
          <GlassBubble>
            <TipCard tip={tip} step={step} onDark onClose={onClose} />
          </GlassBubble>
        </View>
      ) : (
        <Bubble left={layout.left} top={layout.top} width={layout.width}>
          <Arrow left={layout.arrowLeft} above={layout.above} />
          <GlassBubble>
            <TipCard tip={tip} step={step} onDark onClose={onClose} />
          </GlassBubble>
        </Bubble>
      )}
    </View>
  );
}

/** The accent ring around the cut-out, breathing gently (still with Reduce Motion). */
function PulseRing({ spot, radius }: { spot: Rect; radius: number }): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    scale.value = withRepeat(
      withSequence(
        withTiming(COACH.pulseScale, { duration: COACH.pulseMs }),
        withTiming(1, { duration: COACH.pulseMs })
      ),
      -1
    );
    return () => cancelAnimation(scale);
  }, [reduceMotion, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Reanimated.View
      pointerEvents="none"
      entering={FadeIn.duration(DURATION.d200)}
      style={[
        styles.ring,
        { left: spot.x, top: spot.y, width: spot.width, height: spot.height, borderRadius: radius },
        style,
      ]}
    />
  );
}

/** The bubble springs in from a touch smaller as it fades in; Reduce Motion: it only fades. */
function Bubble({
  left,
  top,
  width,
  children,
}: {
  left: number;
  top: number;
  width: number;
  children: React.ReactNode;
}): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(reduceMotion ? 1 : COACH.enterScale);
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withTiming(1, { duration: DURATION.d200 });
    if (!reduceMotion) scale.value = withSpring(1, MOTION.morph);
  }, [opacity, scale, reduceMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return (
    <Reanimated.View
      exiting={FadeOut.duration(DURATION.d180)}
      style={[styles.bubbleWrap, { left, top, width }, style]}
    >
      {children}
    </Reanimated.View>
  );
}

function GlassBubble({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <BlurView intensity={BLUR_INTENSITY.i40} tint="dark" style={styles.glass}>
      {children}
    </BlurView>
  );
}

/** Attached to the bubble's edge facing the thing, its point on the thing's middle. */
function Arrow({ left, above }: { left: number; above: boolean }): React.JSX.Element {
  return (
    <Svg
      width={COACH.arrowWidth}
      height={COACH.arrowHeight}
      pointerEvents="none"
      style={[
        styles.arrow,
        { left },
        above ? { bottom: BORDER_WIDTH.w1 - COACH.arrowHeight } : styles.arrowUp,
        above && styles.arrowFlip,
      ]}
    >
      <Path
        d={ARROW_PATH}
        fill={withAlpha(COLORS.offBlack, COACH.glass)}
        stroke={COLORS.accent}
        strokeWidth={BORDER_WIDTH.w1}
      />
    </Svg>
  );
}

// ─── The words, the same in both ─────────────────────────────────────────────

function TipIcon({ icon }: { icon: CoachIcon }): React.JSX.Element {
  const props = { size: ICON_SIZE.i16, color: COLORS.offBlack };
  return (
    <View style={styles.icon}>
      {icon === 'plusOne' ? (
        <Text style={styles.plusOne}>+1</Text>
      ) : icon === 'camera' ? (
        <CameraIcon {...props} />
      ) : icon === 'feed' ? (
        <FeedIcon {...props} />
      ) : icon === 'notifications' ? (
        <NotificationsIcon {...props} />
      ) : (
        <ProfileIcon {...props} />
      )}
    </View>
  );
}

function TipCard({
  tip,
  step,
  onDark,
  onClose,
}: {
  tip: CoachTipId;
  step: string | null;
  onDark: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { title, body, icon } = COACH_TIPS[tip];
  const { text, muted } = themeColors(onDark);
  return (
    <View style={styles.card}>
      <View style={styles.row} accessible accessibilityLabel={coachTipText(tip)}>
        <TipIcon icon={icon} />
        <View style={styles.words}>
          <Text style={[styles.title, { color: text }]}>{title}</Text>
          <Text style={[styles.body, { color: text }]}>{body}</Text>
        </View>
      </View>
      <View style={styles.footer}>
        {step ? <Text style={[styles.step, { color: muted }]}>{step}</Text> : <View />}
        <Pressable
          onPress={onClose}
          hitSlop={GOT_IT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Got it"
          accessibilityHint="Closes the tip"
          style={({ pressed }) => [styles.gotIt, pressed && styles.pressed]}
        >
          <Text style={styles.gotItText}>Got it</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    zIndex: LAYER.coach,
    elevation: ELEVATION.e12,
  },
  nativeFrame: {
    position: 'absolute',
  },
  popover: {
    width: COACH.popoverWidth,
  },
  ring: {
    position: 'absolute',
    borderWidth: BORDER_WIDTH.w2,
    borderColor: COLORS.accent,
  },
  measure: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    top: 0,
  },
  bubbleWrap: {
    position: 'absolute',
  },
  glass: {
    borderRadius: RADIUS.r16,
    borderWidth: BORDER_WIDTH.w1,
    borderColor: COLORS.accent,
    backgroundColor: withAlpha(COLORS.offBlack, COACH.glass),
    overflow: 'hidden',
  },
  arrow: {
    position: 'absolute',
    zIndex: LAYER.raised,
  },
  arrowUp: {
    top: BORDER_WIDTH.w1 - COACH.arrowHeight,
  },
  arrowFlip: {
    transform: [{ rotate: '180deg' }],
  },
  card: {
    padding: SPACE.s14,
    gap: SPACE.s10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.s12,
  },
  icon: {
    width: SIZE.z32,
    height: SIZE.z32,
    borderRadius: RADIUS.r16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusOne: {
    color: COLORS.offBlack,
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f13,
  },
  words: {
    flex: 1,
    gap: SPACE.s2,
  },
  // A first-run tip is read as a sentence, so it takes the banner pair, not a tooltip's 11pt.
  title: {
    ...TYPOGRAPHY.bodyStrong,
  },
  body: {
    ...TYPOGRAPHY.small,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  step: {
    ...TYPOGRAPHY.caption,
  },
  gotIt: {
    minHeight: SIZE.z28,
    paddingHorizontal: SPACE.s14,
    justifyContent: 'center',
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent,
  },
  gotItText: {
    ...TYPOGRAPHY.labelStrong,
    color: COLORS.offBlack,
  },
  pressed: {
    opacity: ALPHA.a80,
  },
});
