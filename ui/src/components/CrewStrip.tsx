/**
 * "Your crew" — the friends you're tied to right now, under the feed timer: who tagged you and is
 * waiting (time left), who you tagged on your latest post, and who has answered you since (their
 * avatar morphs into a check). It makes the shared commitment visible without blame: nobody is
 * ever shown as missed or late. Built only from data the feed already reads fresh each session
 * (open tags and feed posts); nothing is kept on the phone. Hidden when nobody is tied to you.
 */
import React, { useEffect } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useOpenTags } from '@/hooks/useOpenTags';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import { useUserStore } from '@/store';
import { crewStrip, type CrewMember } from '@/lib/crew';
import { FadeInItem, PressScale } from '@/components/Motion';
import type { FeedPost } from '@/api';
import { FONTS } from '@/constants/fonts';
import {
  ALPHA,
  BLUR_INTENSITY,
  BORDER_WIDTH,
  DURATION,
  FONT_SIZE,
  ICON_SIZE,
  LINE_HEIGHT,
  MOTION,
  RADIUS,
  SIZE,
  SPACE,
  STROKE,
  withAlpha,
} from '@/constants/tokens';

export default function CrewStrip({
  posts,
  serverOffsetMs,
  onPressPerson,
}: {
  posts: FeedPost[];
  serverOffsetMs: number;
  onPressPerson: (userId: string) => void;
}): React.JSX.Element | null {
  const { dark, colors } = useAppTheme();
  const { openTags, loaded } = useOpenTags();
  const me = useUserStore((s) => s.profile);
  const deviceNow = useMinuteTick();
  if (!loaded || !me) return null;
  const crew = crewStrip({
    me: { id: me.id, username: me.username },
    openTags,
    posts,
    serverOffsetMs,
    deviceNow,
  });
  if (crew.length === 0) return null;

  return (
    <FadeInItem style={styles.wrap}>
      <BlurView
        intensity={BLUR_INTENSITY.i40}
        tint={dark ? 'dark' : 'light'}
        style={[styles.strip, { borderColor: withAlpha(colors.accent, ALPHA.a35) }]}
      >
        <Text style={[styles.title, { color: withAlpha(colors.text, ALPHA.a75) }]}>Your crew</Text>
        <View style={styles.row}>
          {crew.map((m, i) => (
            <FadeInItem key={m.id} index={i + 1} style={styles.cell}>
              <Member member={m} onPress={() => onPressPerson(m.id)} />
            </FadeInItem>
          ))}
        </View>
      </BlurView>
    </FadeInItem>
  );
}

function Member({ member, onPress }: { member: CrewMember; onPress: () => void }) {
  const { colors } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const answered = member.status === 'answered';
  // 0 → the avatar; 1 → a check (the friend answered you).
  const done = useSharedValue(answered ? 1 : 0);
  useEffect(() => {
    const to = answered ? 1 : 0;
    done.value = reduceMotion
      ? withTiming(to, { duration: DURATION.d200 })
      : withSpring(to, MOTION.morph);
  }, [answered, reduceMotion, done]);
  const avatarStyle = useAnimatedStyle(() => ({
    opacity: 1 - done.value,
    transform: reduceMotion ? [] : [{ scale: 1 - done.value * (1 - MOTION.pressScale) }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: done.value,
    transform: reduceMotion ? [] : [{ scale: done.value }],
  }));
  const ring =
    member.status === 'waiting'
      ? colors.accent
      : answered
        ? colors.accent
        : withAlpha(colors.text, ALPHA.a30);

  return (
    <PressScale
      style={styles.member}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${member.name}, ${member.line}`}
      accessibilityHint="Opens their profile"
    >
      <View style={[styles.avatarRing, { borderColor: ring }]}>
        <Reanimated.View style={[StyleSheet.absoluteFill, styles.center, avatarStyle]}>
          {member.avatar_url ? (
            <Image source={{ uri: member.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.center, { backgroundColor: colors.accent }]}>
              <Text style={[styles.initial, { color: colors.offBlack }]}>
                {(member.username[0] ?? '?').toUpperCase()}
              </Text>
            </View>
          )}
        </Reanimated.View>
        <Reanimated.View
          style={[
            StyleSheet.absoluteFill,
            styles.center,
            styles.check,
            { backgroundColor: colors.accent },
            checkStyle,
          ]}
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
        </Reanimated.View>
      </View>
      <View style={styles.copy}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {member.name}
        </Text>
        <Text
          style={[
            styles.line,
            {
              color:
                member.status === 'open' ? withAlpha(colors.text, ALPHA.a60) : colors.accentText,
            },
          ]}
          numberOfLines={1}
        >
          {member.line}
        </Text>
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: SPACE.s8,
  },
  strip: {
    borderRadius: RADIUS.r16,
    borderWidth: BORDER_WIDTH.w1,
    paddingHorizontal: SPACE.s12,
    paddingVertical: SPACE.s8,
    gap: SPACE.s6,
    overflow: 'hidden',
  },
  title: {
    fontSize: FONT_SIZE.f12,
    lineHeight: LINE_HEIGHT.l16,
    fontFamily: FONTS.semiBold,
  },
  row: {
    flexDirection: 'row',
    gap: SPACE.s8,
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s6,
    minHeight: SIZE.z44,
  },
  avatarRing: {
    width: SIZE.z32,
    height: SIZE.z32,
    borderRadius: RADIUS.r16,
    borderWidth: BORDER_WIDTH.w2,
    overflow: 'hidden',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: SIZE.z28,
    height: SIZE.z28,
    borderRadius: RADIUS.r14,
  },
  check: {
    borderRadius: RADIUS.r16,
  },
  initial: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.bold,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: FONT_SIZE.f13,
    lineHeight: LINE_HEIGHT.l16,
    fontFamily: FONTS.semiBold,
  },
  line: {
    fontSize: FONT_SIZE.f12,
    lineHeight: LINE_HEIGHT.l16,
    fontFamily: FONTS.semiBold,
  },
});
