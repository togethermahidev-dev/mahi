import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Dimensions, ScrollView } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import LoginSheet from '@/components/LoginSheet';
import CreateAccountSheet from '@/components/CreateAccountSheet';
import { useInviteStore } from '@/store';
import { welcomeInvite } from '@/lib/welcomeCards';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  DURATION,
  FONT_SIZE,
  LAYOUT,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  TRACKING,
} from '@/constants/tokens';

const { height } = Dimensions.get('window');

interface Props {
  onAuthComplete: () => void;
}

export default function WelcomeScreen({ onAuthComplete }: Props): React.JSX.Element {
  const { dark, colors } = useAppTheme();
  const sheetBg = dark ? COLORS.bgDark : COLORS.white;
  const sheetText = dark ? COLORS.white : COLORS.inkDeep;

  const topY = useRef(new Animated.Value(0)).current;
  const botY = useRef(new Animated.Value(0)).current;
  // Reduce Motion: the two halves fade away instead of sliding apart.
  const reduceMotion = useReducedMotion();
  const [fade] = useState(() => new Animated.Value(1));

  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  // Placeholders until Apple / Google sign-in is built; each pill is hidden by its own flag.
  const showApple = useFeatureFlag('auth-apple-signin');
  const showGoogle = useFeatureFlag('auth-google-signin');
  // Opened from an invite link: say who sent it, once the invite has loaded.
  const invite = welcomeInvite(useInviteStore((s) => s.preview));

  const handleAuthComplete = () => {
    setShowLogin(false);
    setShowSignup(false);
    if (reduceMotion) {
      Animated.timing(fade, { toValue: 0, duration: DURATION.d300, useNativeDriver: true }).start(
        () => onAuthComplete()
      );
      return;
    }
    Animated.parallel([
      Animated.timing(topY, { toValue: -height, duration: DURATION.d400, useNativeDriver: true }),
      Animated.timing(botY, { toValue: height, duration: DURATION.d400, useNativeDriver: true }),
    ]).start(() => onAuthComplete());
  };

  return (
    <View style={styles.root}>
      <Animated.View
        style={[
          styles.topSheet,
          { backgroundColor: sheetBg, opacity: fade, transform: [{ translateY: topY }] },
        ]}
      >
        {/* Scrolls only when the words don't fit (the largest text on a small phone), so Log in
            is never cut off. */}
        <ScrollView
          contentContainerStyle={styles.topContent}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false}
        >
          <View style={styles.titles}>
            {/* The wordmark is already display size, so it doesn't grow with the text setting
                (the words under it do). Read once, as "Mahi". */}
            <View style={styles.titleWrapper} accessible accessibilityLabel="Mahi">
              <Text
                style={[styles.title, styles.titleEcho]}
                maxFontSizeMultiplier={LAYOUT.wordmarkMaxScale}
              >
                MAHI
              </Text>
              <Text
                style={[styles.title, { color: sheetText }]}
                maxFontSizeMultiplier={LAYOUT.wordmarkMaxScale}
              >
                MAHI
              </Text>
            </View>
            <Text style={[styles.subtitle, { color: sheetText }]}>
              The fitness accountability app
            </Text>
          </View>
          <View style={styles.buttons}>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: sheetText },
                pressed && { opacity: ALPHA.a80 },
              ]}
              onPress={() => setShowSignup(true)}
            >
              <Text style={[styles.buttonText, { color: sheetBg }]}>Create an account</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                styles.buttonOutline,
                { borderColor: sheetText },
                pressed && { opacity: ALPHA.a80 },
              ]}
              onPress={() => setShowLogin(true)}
            >
              <Text style={[styles.buttonText, { color: sheetText }]}>Log in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </Animated.View>

      <View style={styles.gap} />

      <Animated.View
        style={[
          styles.bottomSheet,
          { backgroundColor: sheetBg, opacity: fade, transform: [{ translateY: botY }] },
        ]}
      >
        <ScrollView
          contentContainerStyle={styles.bottomContent}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false}
        >
          {invite ? (
            <View style={styles.invite} accessible>
              <Text style={[styles.inviteWho, { color: sheetText }]}>{invite.who}</Text>
              <Text style={[styles.inviteLine, { color: colors.muted }]}>{invite.line}</Text>
            </View>
          ) : null}
          {showApple || showGoogle ? (
            <View style={styles.buttons}>
              {showApple ? (
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.button,
                    styles.buttonOutline,
                    { borderColor: sheetText },
                    pressed && { opacity: ALPHA.a80 },
                  ]}
                  onPress={() => {}}
                >
                  <Text style={[styles.buttonText, { color: sheetText }]}>Continue with Apple</Text>
                </Pressable>
              ) : null}
              {showGoogle ? (
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.button,
                    styles.buttonOutline,
                    { borderColor: sheetText },
                    pressed && { opacity: ALPHA.a80 },
                  ]}
                  onPress={() => {}}
                >
                  <Text style={[styles.buttonText, { color: sheetText }]}>
                    Continue with Google
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </Animated.View>

      <LoginSheet
        visible={showLogin}
        onDismiss={() => setShowLogin(false)}
        onAuthComplete={handleAuthComplete}
      />
      <CreateAccountSheet
        visible={showSignup}
        onDismiss={() => setShowSignup(false)}
        onAuthComplete={handleAuthComplete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.ink },
  topSheet: {
    flex: 1,
    borderBottomLeftRadius: RADIUS.r40,
    borderBottomRightRadius: RADIUS.r40,
    overflow: 'hidden',
  },
  topContent: {
    flexGrow: 1,
    paddingHorizontal: SPACE.s24,
    paddingTop: SPACE.s80,
    paddingBottom: SPACE.s40,
    justifyContent: 'space-between',
  },
  titles: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titleWrapper: { position: 'relative', marginBottom: SPACE.s12 },
  title: { fontSize: FONT_SIZE.f56, fontFamily: FONTS.bold, letterSpacing: TRACKING.t10 },
  titleEcho: { position: 'absolute', color: COLORS.accent, top: OFFSET.o4, left: OFFSET.o4 },
  subtitle: { fontSize: FONT_SIZE.f16, fontFamily: FONTS.regular, opacity: ALPHA.a70 },
  gap: { height: SIZE.z55 },
  bottomSheet: {
    flex: 1,
    borderTopLeftRadius: RADIUS.r40,
    borderTopRightRadius: RADIUS.r40,
    overflow: 'hidden',
  },
  bottomContent: {
    flexGrow: 1,
    paddingHorizontal: SPACE.s24,
    paddingTop: SPACE.s40,
    paddingBottom: SPACE.s60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.s24,
  },
  invite: { alignItems: 'center', gap: SPACE.s8 },
  inviteWho: { fontSize: FONT_SIZE.f18, fontFamily: FONTS.semiBold, textAlign: 'center' },
  inviteLine: { fontSize: FONT_SIZE.f16, fontFamily: FONTS.regular, textAlign: 'center' },
  buttons: { width: '100%', gap: SPACE.s12 },
  button: {
    width: '72%',
    alignSelf: 'center',
    paddingVertical: SPACE.s20,
    borderRadius: RADIUS.r50,
    alignItems: 'center',
  },
  buttonOutline: { backgroundColor: 'transparent', borderWidth: BORDER_WIDTH.w1_5 },
  buttonText: { fontSize: FONT_SIZE.f18, fontFamily: FONTS.semiBold },
});
