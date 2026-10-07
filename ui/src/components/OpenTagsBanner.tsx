import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useSecondTick } from '@/hooks/useSecondTick';
import PushNudge from '@/components/PushNudge';
import { CountdownRing, FadeInItem } from '@/components/Motion';
import Reanimated, {
  Easing,
  FadeIn,
  FadeOut,
  ReduceMotion,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import { hasNativeExpoUI, loadSwiftUI } from '@/lib/expoUiModule';
import { nativeDigits } from '@/lib/pointMoments';
import { crossedLastHour, urgentPillLines, urgentRing } from '@/lib/urgentRing';
import { useCoachStore } from '@/store/coachStore';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { answeredMorph } from '@/lib/answerStamp';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import Svg, { Path } from 'react-native-svg';
import { msLeft } from '@/lib/countdown';
import { bannerText, openTagsBanner } from '@/lib/openTagsBanner';
import { openTagsTop } from '@/lib/pip';
import type { OpenTag } from '@/api';
import { useUserStore } from '@/store';
import { FONTS } from '@/constants/fonts';
import {
  ALPHA,
  BLUR_INTENSITY,
  BORDER_WIDTH,
  COLORS,
  DURATION,
  FONT_SIZE,
  ICON_SIZE,
  MOTION,
  RADIUS,
  SIZE,
  SPACE,
  STROKE,
  withAlpha,
} from '@/constants/tokens';

/**
 * Camera overlay: what to do next (see `openTagsBanner` for the words). A first post, either kind,
 * promises the first point; a tag shows who and a ticking clock. Under it, the "turn on
 * notifications" line for someone tagged with them off. Nothing when there's nothing to do.
 */
export default function OpenTagsBanner({
  openTags,
  serverOffsetMs,
  firstPost = false,
  answered = null,
}: {
  openTags: OpenTag[];
  serverOffsetMs: number;
  firstPost?: boolean;
  /**
   * "Answered @sam" for a beat after a post the server says answered a tag (null otherwise). It
   * comes from the post's own result, never from tags leaving the list, which can also happen
   * when a tagger blocks you, deletes their account, or a read comes back empty.
   */
  answered?: string | null;
}): React.JSX.Element | null {
  const { colors } = useAppTheme();
  // Just under the app header, whose height follows the status bar / notch.
  // Under the points counter (top right), so the two never overlap.
  const top = openTagsTop(useSafeAreaInsets().top, useWindowDimensions().fontScale);
  // Every tag countdown ticks in hours, minutes and seconds (owner, 2026-10-07).
  const deviceNow = useSecondTick(openTags.length > 0);

  // The moment you answer: the tag pill morphs into a check for a beat (`answered`).
  const reduceMotion = useReducedMotion();
  const morph = answeredMorph({
    glass: isLiquidGlassAvailable(),
    expoUiPresent: hasNativeExpoUI(),
    reduceMotion,
  });

  // What a miss would cost: "Miss it and your 4 points go back to 0" (null until loaded).
  const points = useUserStore((s) => s.profile?.streak_current ?? null);
  const banner = openTagsBanner({ openTags, serverOffsetMs, deviceNow, firstPost, points });

  // The last 6 hours: the soonest tag's face in a draining ring; one gentle tap as the last hour
  // begins, only while the camera is on screen.
  const soonestTag = openTags.length
    ? [...openTags].sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at))[0]
    : null;
  const leftMs = soonestTag ? msLeft(soonestTag.expires_at, serverOffsetMs, deviceNow) : null;
  const onCamera = useCoachStore((s) => s.page === 'camera');
  const ringOn = useFeatureFlag('tag-drain-ring');
  const stampOn = useFeatureFlag('answered-stamp');
  const lastLeft = useRef<number | null>(null);
  useEffect(() => {
    if (leftMs === null) {
      lastLeft.current = null;
      return;
    }
    if (ringOn && crossedLastHour(lastLeft.current, leftMs) && onCamera) haptic('tick');
    lastLeft.current = leftMs;
  }, [leftMs, onCamera, ringOn]);

  if (answered) {
    const swift = stampOn && morph === 'glass' ? loadSwiftUI() : null;
    if (swift) {
      return (
        <View
          style={[styles.wrap, { top }]}
          pointerEvents="none"
          accessible
          accessibilityRole="text"
          accessibilityLabel={answered}
          accessibilityLiveRegion="polite"
        >
          <GlassAnswered swift={swift} words={answered} />
        </View>
      );
    }
    return (
      <View style={[styles.wrap, { top }]} pointerEvents="none">
        <Reanimated.View
          entering={
            morph === 'fade'
              ? FadeIn.duration(DURATION.d200).reduceMotion(ReduceMotion.Never)
              : ZoomIn.springify().damping(MOTION.morph.damping).stiffness(MOTION.morph.stiffness)
          }
          exiting={FadeOut.duration(DURATION.d300)}
          style={[styles.pill, styles.donePill, { backgroundColor: colors.accent }]}
          accessible
          accessibilityRole="text"
          accessibilityLabel={stampOn ? answered : 'Tag answered'}
          accessibilityLiveRegion="polite"
        >
          <Svg width={ICON_SIZE.i16} height={ICON_SIZE.i16} viewBox="0 0 24 24">
            <Path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke={colors.offBlack}
              strokeWidth={STROKE.s2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <Text style={[styles.text, { color: colors.offBlack }]}>
            {stampOn ? answered : 'Tag answered'}
          </Text>
        </Reanimated.View>
      </View>
    );
  }
  if (!banner) return null;
  const isFirstPost = banner.firstPost === true;
  // Under 6 hours left: the clock turns the warning colour (the note says who's waiting).
  const clockColor = banner.urgent ? COLORS.warning : colors.accent;

  return (
    // box-none: touches pass through to the camera except on the notifications line.
    <View style={[styles.wrap, { top }]} pointerEvents="box-none">
      <FadeInItem style={styles.fadeRoom}>
        <View
          style={styles.pillRoom}
          pointerEvents="none"
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${bannerText(banner)}${banner.note ? ` ${banner.note}` : ''}`}
        >
          <BlurView
            intensity={BLUR_INTENSITY.i40}
            tint="dark"
            style={[styles.pill, { borderColor: colors.accent }]}
          >
            {ringOn && banner.urgent && !isFirstPost && soonestTag && leftMs !== null ? (
              <UrgentLine
                parts={banner.parts}
                avatarUrl={soonestTag.avatar_url}
                username={soonestTag.username}
                leftMs={leftMs}
                color={clockColor}
                textColor={colors.offWhite}
              />
            ) : (
              <Text style={[styles.text, { color: colors.offWhite }]} numberOfLines={3}>
                {banner.parts.map((part, i) =>
                  part.accent ? (
                    <Text key={i} style={[styles.time, { color: clockColor }]}>
                      {part.text}
                    </Text>
                  ) : (
                    part.text
                  )
                )}
              </Text>
            )}
            {/* One post answers every open tag; a newcomer hears that any workout counts. */}
            {banner.note ? (
              <Text style={[styles.note, { color: colors.offWhite }]} numberOfLines={2}>
                {banner.note}
              </Text>
            ) : null}
          </BlurView>
        </View>
      </FadeInItem>
      {/* Tagged with notifications off: one line to turn them on (flag push-core). */}
      {isFirstPost ? null : <PushNudge openTags={openTags} />}
    </View>
  );
}

/**
 * iOS 26 with @expo/ui: the tag pill becomes the tick in Apple's Liquid Glass. A glass capsule
 * with the mate's name appears, then morphs (same glass id, SwiftUI spring) into the accent tick
 * with "Answered @sam".
 */
function GlassAnswered({
  swift,
  words,
}: {
  swift: NonNullable<ReturnType<typeof loadSwiftUI>>;
  words: string;
}) {
  const ns = React.useId();
  const [done, setDone] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setDone(true), DURATION.d150);
    return () => clearTimeout(id);
  }, []);
  const { GlassEffectContainer, HStack, Host, Image: SImage, Namespace, Text: SText } = swift.ui;
  const m = swift.modifiers;
  const pad = m.padding({ horizontal: SPACE.s16, vertical: SPACE.s8 });
  const label = m.font({ family: FONTS.semiBold, size: FONT_SIZE.f14 });
  const who = words.replace(/^Answered /, '');
  return (
    <Host matchContents>
      <Namespace id={ns}>
        <GlassEffectContainer
          modifiers={[m.animation(m.Animation.spring(MOTION.glassMorph), done)]}
        >
          {done ? (
            <HStack
              spacing={SPACE.s6}
              modifiers={[
                pad,
                m.glassEffect({
                  glass: { variant: 'regular', tint: COLORS.accent },
                  shape: 'capsule',
                }),
                m.glassEffectId('tagPill', ns),
              ]}
            >
              <SImage systemName="checkmark" size={ICON_SIZE.i14} color={COLORS.offBlack} />
              <SText modifiers={[label, m.foregroundStyle(COLORS.offBlack)]}>{words}</SText>
            </HStack>
          ) : (
            <SText
              modifiers={[
                label,
                m.foregroundStyle(COLORS.offWhite),
                pad,
                m.glassEffect({ glass: { variant: 'regular' }, shape: 'capsule' }),
                m.glassEffectId('tagPill', ns),
              ]}
            >
              {who}
            </SText>
          )}
        </GlassEffectContainer>
      </Namespace>
    </Host>
  );
}

/**
 * The urgent pill's first line: the tagger's face in a ring that drains over the last 6 hours
 * (breathing slowly in the last hour), then who is waiting and the clock. On an iPhone build with
 * @expo/ui the seconds roll like an odometer (Apple's numericText); elsewhere they change in
 * place. Reduce Motion: the ring holds still and the digits don't roll.
 */
function UrgentLine({
  parts,
  avatarUrl,
  username,
  leftMs,
  color,
  textColor,
}: {
  parts: Parameters<typeof urgentPillLines>[0];
  avatarUrl: string | null;
  username: string;
  leftMs: number;
  color: string;
  textColor: string;
}) {
  const reduceMotion = useReducedMotion();
  const { progress, breathing } = urgentRing(leftMs);
  const lines = urgentPillLines(parts);
  const glow = useSharedValue(1);
  useEffect(() => {
    if (!breathing || reduceMotion) {
      cancelAnimation(glow);
      glow.value = 1;
      return;
    }
    glow.value = withRepeat(
      withTiming(MOTION.urgentBreatheLow, {
        duration: MOTION.urgentBreatheMs,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true
    );
  }, [breathing, reduceMotion, glow]);
  const ringStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const native =
    lines.clock !== null &&
    nativeDigits({ platform: Platform.OS, expoUiPresent: hasNativeExpoUI(), reduceMotion });
  const swift = native ? loadSwiftUI() : null;

  return (
    <View style={styles.urgentRow}>
      <View style={styles.ringSpot}>
        <Reanimated.View style={[StyleSheet.absoluteFill, ringStyle]}>
          <CountdownRing
            progress={progress}
            color={color}
            track={withAlpha(COLORS.white, ALPHA.a20)}
            size={MOTION.urgentRingSize}
          />
        </Reanimated.View>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl, cache: 'force-cache' }} style={styles.urgentAvatar} />
        ) : (
          <View style={[styles.urgentAvatar, styles.urgentInitialBg]}>
            <Text style={[styles.urgentInitial, { color: textColor }]}>
              {(username[0] ?? '?').toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.urgentWords}>
        <Text style={[styles.text, styles.urgentText, { color: textColor }]} numberOfLines={2}>
          {lines.words}
        </Text>
        <View style={styles.clockRow}>
          {swift && lines.clock ? (
            <swift.ui.Host matchContents>
              <swift.ui.Text
                modifiers={[
                  swift.modifiers.font({ family: FONTS.bold, size: FONT_SIZE.f14 }),
                  swift.modifiers.monospacedDigit(),
                  swift.modifiers.foregroundStyle(color),
                  swift.modifiers.contentTransition('numericText', { countsDown: true }),
                  swift.modifiers.animation(
                    swift.modifiers.Animation.default,
                    Math.floor(leftMs / 1000)
                  ),
                ]}
              >
                {lines.clock}
              </swift.ui.Text>
            </swift.ui.Host>
          ) : lines.clock ? (
            <Text style={[styles.text, styles.time, { color }]}>{lines.clock}</Text>
          ) : null}
          <Text style={[styles.text, styles.time, { color }]}>{lines.after}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  urgentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s10,
  },
  ringSpot: {
    width: MOTION.urgentRingSize,
    height: MOTION.urgentRingSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgentAvatar: {
    width: MOTION.urgentAvatarSize,
    height: MOTION.urgentAvatarSize,
    borderRadius: RADIUS.pill,
  },
  urgentInitialBg: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(COLORS.white, ALPHA.a15),
  },
  urgentInitial: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f12,
  },
  urgentWords: {
    flexShrink: 1,
  },
  urgentText: {
    textAlign: 'left',
  },
  clockRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fadeRoom: {
    alignSelf: 'stretch',
  },
  pillRoom: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingHorizontal: SPACE.s24,
  },
  pill: {
    // Grows with the text size instead of clipping it.
    minHeight: SIZE.z36,
    paddingVertical: SPACE.s8,
    borderRadius: RADIUS.r18,
    borderWidth: BORDER_WIDTH.w1,
    paddingHorizontal: SPACE.s16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  donePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s6,
    borderWidth: 0,
  },
  text: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f14,
    textAlign: 'center',
  },
  time: {
    fontFamily: FONTS.bold,
    // Same-width digits, so the ticking clock doesn't jitter.
    fontVariant: ['tabular-nums'],
  },
  note: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f13,
    textAlign: 'center',
    marginTop: SPACE.s4,
  },
});
