import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Dimensions } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import LoginSheet from '@/components/LoginSheet';
import CreateAccountSheet from '@/components/CreateAccountSheet';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  FONT_SIZE,
  SPACE,
  RADIUS,
  TRACKING,
  OFFSET,
  SIZE,
  BORDER_WIDTH,
} from '@/constants/tokens';

const { height } = Dimensions.get('window');

interface Props {
  onAuthComplete: () => void;
}

export default function WelcomeScreen({ onAuthComplete }: Props): React.JSX.Element {
  const { dark } = useAppTheme();
  const sheetBg = dark ? COLORS.bgDark : COLORS.white;
  const sheetText = dark ? COLORS.white : COLORS.inkDeep;

  const topY = useRef(new Animated.Value(0)).current;
  const botY = useRef(new Animated.Value(0)).current;

  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  // Placeholders until Apple / Google sign-in is built; each pill is hidden by its own flag.
  const showApple = useFeatureFlag('auth-apple-signin');
  const showGoogle = useFeatureFlag('auth-google-signin');

  const handleAuthComplete = () => {
    setShowLogin(false);
    setShowSignup(false);
    Animated.parallel([
      Animated.timing(topY, { toValue: -height, duration: 400, useNativeDriver: true }),
      Animated.timing(botY, { toValue: height, duration: 400, useNativeDriver: true }),
    ]).start(() => onAuthComplete());
  };

  return (
    <View style={styles.root}>
      <Animated.View
        style={[styles.topSheet, { backgroundColor: sheetBg, transform: [{ translateY: topY }] }]}
      >
        <View style={styles.titles}>
          <View style={styles.titleWrapper}>
            <Text style={[styles.title, styles.titleEcho]}>MAHI</Text>
            <Text style={[styles.title, { color: sheetText }]}>MAHI</Text>
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
              pressed && { opacity: 0.8 },
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
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => setShowLogin(true)}
          >
            <Text style={[styles.buttonText, { color: sheetText }]}>Log in</Text>
          </Pressable>
        </View>
      </Animated.View>

      <View style={styles.gap} />

      <Animated.View
        style={[
          styles.bottomSheet,
          { backgroundColor: sheetBg, transform: [{ translateY: botY }] },
        ]}
      >
        {showApple || showGoogle ? (
          <View style={styles.buttons}>
            {showApple ? (
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.button,
                  styles.buttonOutline,
                  { borderColor: sheetText },
                  pressed && { opacity: 0.8 },
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
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => {}}
              >
                <Text style={[styles.buttonText, { color: sheetText }]}>Continue with Google</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
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
    paddingHorizontal: SPACE.s24,
    paddingTop: SPACE.s80,
    paddingBottom: SPACE.s40,
    borderBottomLeftRadius: RADIUS.r40,
    borderBottomRightRadius: RADIUS.r40,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  titles: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titleWrapper: { position: 'relative', marginBottom: SPACE.s12 },
  title: { fontSize: FONT_SIZE.f56, fontFamily: FONTS.bold, letterSpacing: TRACKING.t10 },
  titleEcho: { position: 'absolute', color: COLORS.accent, top: OFFSET.o4, left: OFFSET.o4 },
  subtitle: { fontSize: FONT_SIZE.f16, fontFamily: FONTS.regular, opacity: 0.7 },
  gap: { height: SIZE.z55 },
  bottomSheet: {
    flex: 1,
    paddingHorizontal: SPACE.s24,
    paddingTop: SPACE.s40,
    paddingBottom: SPACE.s60,
    borderTopLeftRadius: RADIUS.r40,
    borderTopRightRadius: RADIUS.r40,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
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
