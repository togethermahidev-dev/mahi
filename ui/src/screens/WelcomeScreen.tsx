import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  ScrollView,
  Platform,
} from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useReducedMotion } from 'react-native-reanimated';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useAppleSignIn } from '@/hooks/useAppleSignIn';
import LoginSheet from '@/components/LoginSheet';
import CreateAccountSheet from '@/components/CreateAccountSheet';
import AccountabilityLoop from '@/components/AccountabilityLoop';
import { PressScale } from '@/components/Motion';
import { useInviteStore } from '@/store';
import { welcomeInvite } from '@/lib/welcomeCards';
import { FONTS } from '@/constants/fonts';
import { TYPOGRAPHY } from '@/constants/typography';
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

function EntryAction({
  label,
  primary,
  sheetBg,
  sheetText,
  onPress,
}: {
  label: string;
  primary?: boolean;
  sheetBg: string;
  sheetText: string;
  onPress: () => void;
}) {
  const glass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const content = (
    <Text style={[styles.buttonText, { color: primary ? sheetBg : sheetText }]}>{label}</Text>
  );
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: primary ? sheetBg : sheetText, foreground: true }}
      style={styles.entryAction}
      onPress={onPress}
    >
      {glass ? (
        <GlassView
          style={[styles.buttonSurface, !primary && styles.buttonOutline]}
          glassEffectStyle="regular"
          isInteractive
          tintColor={primary ? sheetText : undefined}
        >
          {content}
        </GlassView>
      ) : (
        <View
          style={[
            styles.buttonSurface,
            primary
              ? { backgroundColor: sheetText }
              : [styles.buttonOutline, { borderColor: sheetText }],
          ]}
        >
          {content}
        </View>
      )}
    </PressScale>
  );
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
  // Sign in with Apple: Apple's own button, on iPhones with build 13+ while the switch
  // `auth-apple-signin` is on. Google is still a placeholder pill behind its own switch.
  const apple = useAppleSignIn();
  const showApple = apple.shown && apple.sdk != null;
  const showGoogle = useFeatureFlag('auth-google-signin');
  const red = dark ? COLORS.dangerSoft : COLORS.dangerDeep;
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
            <EntryAction
              label="Create an account"
              primary
              sheetBg={sheetBg}
              sheetText={sheetText}
              onPress={() => setShowSignup(true)}
            />
            <EntryAction
              label="Log in"
              sheetBg={sheetBg}
              sheetText={sheetText}
              onPress={() => setShowLogin(true)}
            />
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
          <AccountabilityLoop />
          {invite ? (
            <View style={styles.invite} accessible>
              <Text style={[styles.inviteWho, { color: sheetText }]}>{invite.who}</Text>
              <Text style={[styles.inviteLine, { color: colors.muted }]}>{invite.line}</Text>
            </View>
          ) : null}
          {showApple || showGoogle ? (
            <View style={styles.buttons}>
              {showApple && apple.sdk ? (
                <apple.sdk.AppleAuthenticationButton
                  buttonType={apple.sdk.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={
                    dark
                      ? apple.sdk.AppleAuthenticationButtonStyle.WHITE
                      : apple.sdk.AppleAuthenticationButtonStyle.BLACK
                  }
                  cornerRadius={RADIUS.r28}
                  style={[styles.appleButton, apple.busy && { opacity: ALPHA.a60 }]}
                  onPress={() => void apple.signIn()}
                />
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
              {apple.error ? (
                <Text style={[styles.error, { color: red }]} accessibilityLiveRegion="polite">
                  {apple.error}
                </Text>
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
  subtitle: { ...TYPOGRAPHY.body, opacity: ALPHA.a70 },
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
  inviteWho: { ...TYPOGRAPHY.h3, textAlign: 'center' },
  inviteLine: { ...TYPOGRAPHY.body, textAlign: 'center' },
  buttons: { width: '100%', gap: SPACE.s12 },
  button: {
    width: '72%',
    alignSelf: 'center',
    paddingVertical: SPACE.s20,
    borderRadius: RADIUS.r50,
    alignItems: 'center',
  },
  entryAction: {
    width: '72%',
    minHeight: SIZE.z56,
    alignSelf: 'center',
    borderRadius: RADIUS.r50,
    overflow: 'hidden',
  },
  buttonSurface: {
    flex: 1,
    minHeight: SIZE.z56,
    borderRadius: RADIUS.r50,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Apple's own button: its size is set here, its colours and words by Apple.
  appleButton: { width: '72%', height: SIZE.z56, alignSelf: 'center' },
  error: { ...TYPOGRAPHY.body, textAlign: 'center' },
  buttonOutline: { backgroundColor: 'transparent', borderWidth: BORDER_WIDTH.w1_5 },
  buttonText: { ...TYPOGRAPHY.authButton },
});
