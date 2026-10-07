import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useAuthStore } from '@/store';
import { useCoachStore } from '@/store/coachStore';
import { useToastStore } from '@/store/toastStore';
import { useEntering } from '@/components/Motion';
import {
  COACH_TIPS,
  anchorOnScreen,
  coachBubblePlacement,
  nextCoachTip,
  type BubblePlacement,
  type CoachTipId,
} from '@/lib/coachMarks';
import { FONTS } from '@/constants/fonts';
import {
  ALPHA,
  COLORS,
  DURATION,
  ELEVATION,
  FONT_SIZE,
  LAYER,
  LINE_HEIGHT,
  RADIUS,
  SHADOW_BLUR,
  SIZE,
  SPACE,
  WAIT,
  withAlpha,
} from '@/constants/tokens';

/**
 * Where one-time tips appear (rules: src/lib/coachMarks.ts). Mounted over the swipe pages
 * (HorizontalNavigator) and inside the post preview (`compose`), which is its own window. Picks
 * the one tip to show, waits a beat for the page to settle, finds the thing it points at, and
 * shows a small bubble beside it with an arrow. A tap anywhere or "Got it" closes it for good on
 * this device. VoiceOver reads it out and keeps to it until closed; Reduce Motion fades it in.
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
  const [shown, setShown] = useState<{ tip: CoachTipId; place: BubblePlacement } | null>(null);

  useEffect(() => {
    if (userId && !compose) useCoachStore.getState().loadSeen(userId);
  }, [userId, compose]);

  const tip = nextCoachTip({
    requested: Object.keys(anchors) as CoachTipId[],
    seen,
    page,
    blocked: blocked || toast,
    current,
  });
  const mine = tip !== null && (COACH_TIPS[tip].page === 'compose') === compose ? tip : null;

  useEffect(() => {
    if (!mine) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    // Until the thing it points at is laid out on screen (the page settled, the header back).
    const attempt = () => {
      const anchor = useCoachStore.getState().anchors[mine]?.current;
      const root = rootRef.current;
      if (!anchor || !root) return retry();
      root.measureInWindow((rx, ry, width, height) => {
        anchor.measureInWindow((ax, ay, aw, ah) => {
          if (!live) return;
          const rect = { x: ax - rx, y: ay - ry, width: aw, height: ah };
          const container = { width, height };
          if (!anchorOnScreen(rect, container)) return retry();
          setShown({
            tip: mine,
            place: coachBubblePlacement({
              anchor: rect,
              container,
              maxWidth: SIZE.z280,
              margin: SPACE.s16,
              gap: SPACE.s8,
              arrow: SIZE.z10,
              radius: RADIUS.r12,
            }),
          });
          useCoachStore.getState().setCurrent(mine);
          AccessibilityInfo.announceForAccessibility(COACH_TIPS[mine].text);
        });
      });
    };
    const retry = () => {
      if (live) timer = setTimeout(attempt, WAIT.coachMark);
    };
    retry();
    return () => {
      live = false;
      clearTimeout(timer);
      setShown(null);
      if (useCoachStore.getState().current === mine) useCoachStore.getState().setCurrent(null);
    };
  }, [mine]);

  const close = () => {
    if (shown) useCoachStore.getState().markSeen(shown.tip);
    setShown(null);
  };

  return (
    <View
      ref={rootRef}
      collapsable={false}
      pointerEvents="box-none"
      // VoiceOver stays on the tip until it is closed.
      accessibilityViewIsModal={shown !== null}
      style={[StyleSheet.absoluteFill, styles.layer]}
    >
      {shown ? <CoachBubble tip={shown.tip} place={shown.place} onClose={close} /> : null}
    </View>
  );
}

function CoachBubble({
  tip,
  place,
  onClose,
}: {
  tip: CoachTipId;
  place: BubblePlacement;
  onClose: () => void;
}): React.JSX.Element {
  const entering = useEntering();
  const { text } = COACH_TIPS[tip];
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* A tap anywhere closes it. */}
      <Reanimated.View
        entering={FadeIn.duration(DURATION.d200)}
        exiting={FadeOut.duration(DURATION.d180)}
        style={StyleSheet.absoluteFill}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, styles.scrim]}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
        />
      </Reanimated.View>
      <Reanimated.View
        entering={entering}
        exiting={FadeOut.duration(DURATION.d180)}
        style={[
          styles.wrap,
          { left: place.left, width: place.width },
          place.above ? { bottom: place.bottom } : { top: place.top },
        ]}
      >
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`${text} Got it`}
          accessibilityHint="Closes the tip"
          style={({ pressed }) => [styles.bubble, pressed && styles.pressed]}
        >
          <View
            style={[
              styles.arrow,
              { left: place.arrowLeft },
              place.above ? styles.arrowBelow : styles.arrowAbove,
            ]}
          />
          <Text style={styles.text}>{text}</Text>
          <Text style={styles.gotIt}>Got it</Text>
        </Pressable>
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    zIndex: LAYER.coach,
    elevation: ELEVATION.e12,
  },
  scrim: {
    backgroundColor: withAlpha(COLORS.black, ALPHA.a25),
  },
  wrap: {
    position: 'absolute',
  },
  bubble: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.r12,
    paddingHorizontal: SPACE.s16,
    paddingTop: SPACE.s12,
    paddingBottom: SPACE.s8,
    shadowColor: COLORS.black,
    shadowOpacity: ALPHA.a25,
    shadowRadius: SHADOW_BLUR.b8,
    shadowOffset: { width: 0, height: SIZE.z2 },
    elevation: ELEVATION.e4,
  },
  pressed: {
    opacity: ALPHA.a85,
  },
  arrow: {
    position: 'absolute',
    width: SIZE.z10,
    height: SIZE.z10,
    backgroundColor: COLORS.accent,
    transform: [{ rotate: '45deg' }],
  },
  arrowAbove: {
    top: -SIZE.z10 / 2,
  },
  arrowBelow: {
    bottom: -SIZE.z10 / 2,
  },
  text: {
    color: COLORS.offBlack,
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f15,
    lineHeight: LINE_HEIGHT.l20,
  },
  gotIt: {
    color: COLORS.offBlack,
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f14,
    alignSelf: 'flex-end',
    paddingVertical: SPACE.s4,
    marginTop: SPACE.s4,
  },
});
