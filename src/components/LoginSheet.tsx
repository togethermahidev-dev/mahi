import React, { useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Sentry } from '@/lib/sentry';
import { posthog } from '@/lib/posthog';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import ForgotPasswordSheet from '@/components/ForgotPasswordSheet';
import { authErrorText } from '@/lib/account';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  FONT_SIZE,
  RADIUS,
  SPACE,
  TRACKING,
} from '@/constants/tokens';
import { themeColors, useAppTheme } from '@/hooks/useAppTheme';

const DOMAINS = ['gmail.com', 'icloud.com', 'outlook.com', 'yahoo.com'];

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onAuthComplete: () => void;
}

export default function LoginSheet({
  visible,
  onDismiss,
  onAuthComplete,
}: Props): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.white : COLORS.inkDeep;
  const inputBg = dark ? COLORS.surfaceDark : COLORS.surfaceLight;
  const { muted } = themeColors(dark);
  const red = dark ? COLORS.dangerSoft : COLORS.dangerDeep;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const resetEnabled = useFeatureFlag('auth-password-reset');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0); // a fresh reset sheet on every open

  const handleLogin = async () => {
    if (loading) return;
    if (!email.trim() || !password.trim()) {
      setError('Enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (signInError) {
      Sentry.captureMessage(signInError.message, {
        level: 'warning',
        tags: { flow: 'login' },
        extra: { email: email.trim().toLowerCase() },
      });
      posthog.capture('login_failed', { error: signInError.message });
      // Plain words, never the server's own text.
      setError(authErrorText(signInError.message, 'login', { canReset: resetEnabled }));
      return;
    }
    posthog.capture('login_success', { user_id: data.user?.id });
    // onAuthStateChange in App.tsx fires from signInWithPassword above,
    // switching to CameraScreen. onAuthComplete triggers the exit animation.
    onAuthComplete();
  };

  const handleDismiss = () => {
    setError('');
    onDismiss();
  };

  const atIndex = email.indexOf('@');
  const showPills = atIndex !== -1 && email.slice(atIndex + 1).length <= 1;
  const localPart = atIndex !== -1 ? email.slice(0, atIndex + 1) : email + '@';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
    >
      <SafeAreaView style={[styles.root, { backgroundColor: bg }]}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { color: text }]} accessibilityRole="header">
            Log in
          </Text>

          {/* Email */}
          <Text style={[styles.label, { color: muted }]}>Email</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: text }]}
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            placeholderTextColor={muted}
            keyboardType="email-address"
            textContentType="username"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          {/* Email domain pills */}
          {showPills && (
            <View style={styles.pillRow}>
              {DOMAINS.map((domain) => (
                <Pressable
                  key={domain}
                  style={({ pressed }) => [
                    styles.pill,
                    { borderColor: text },
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setEmail(localPart + domain)}
                  accessibilityRole="button"
                  accessibilityLabel={`Use @${domain}`}
                >
                  <Text style={[styles.pillText, { color: text }]}>@{domain}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Password */}
          <Text style={[styles.label, { color: muted }]}>Password</Text>
          <View style={[styles.inputRow, { backgroundColor: inputBg }]}>
            <TextInput
              ref={passwordRef}
              style={[styles.inputInner, { color: text }]}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={muted}
              secureTextEntry={!showPassword}
              textContentType="password"
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={handleLogin}
            />
            <Pressable
              onPress={() => setShowPassword((p) => !p)}
              style={({ pressed }) => pressed && styles.pressed}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Text style={[styles.toggle, { color: muted }]}>
                {showPassword ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
          </View>

          {/* Inline error */}
          {error !== '' && <Text style={[styles.errorText, { color: red }]}>{error}</Text>}

          {/* Login button */}
          <Pressable
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: text, opacity: loading ? ALPHA.a60 : 1 },
              pressed && styles.pressedStrong,
            ]}
            onPress={handleLogin}
            disabled={loading}
            accessibilityRole="button"
            accessibilityState={{ disabled: loading, busy: loading }}
          >
            {loading ? (
              <ActivityIndicator color={bg} />
            ) : (
              <Text style={[styles.buttonText, { color: bg }]}>Log in</Text>
            )}
          </Pressable>

          {/* Forgot password */}
          {resetEnabled && (
            <Pressable
              onPress={() => {
                setError('');
                setResetKey((k) => k + 1);
                setResetOpen(true);
              }}
              style={({ pressed }) => pressed && styles.pressed}
              accessibilityRole="button"
            >
              <Text style={[styles.forgot, { color: muted }]}>Forgot password?</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Opens over this sheet; logging in from it closes both. */}
      <ForgotPasswordSheet
        key={resetKey}
        visible={resetOpen}
        initialEmail={email.trim()}
        onDismiss={() => setResetOpen(false)}
        onLoggedIn={() => {
          setResetOpen(false);
          onAuthComplete();
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACE.s32, gap: SPACE.s12 },
  title: {
    fontSize: FONT_SIZE.f32,
    fontFamily: FONTS.bold,
    letterSpacing: TRACKING.t4,
    marginBottom: SPACE.s16,
  },
  label: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
    letterSpacing: TRACKING.t1,
    marginBottom: -SPACE.s4,
  },
  input: {
    borderRadius: RADIUS.r14,
    paddingHorizontal: SPACE.s16,
    paddingVertical: SPACE.s14,
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.semiBold,
  },
  inputRow: {
    borderRadius: RADIUS.r14,
    paddingHorizontal: SPACE.s16,
    paddingVertical: SPACE.s4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputInner: {
    flex: 1,
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.semiBold,
    paddingVertical: SPACE.s10,
  },
  toggle: { fontSize: FONT_SIZE.f13, fontFamily: FONTS.semiBold, paddingHorizontal: SPACE.s4 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s8 },
  pill: {
    borderWidth: BORDER_WIDTH.w1_5,
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s14,
    paddingVertical: SPACE.s8,
  },
  pillText: { fontSize: FONT_SIZE.f13, fontFamily: FONTS.semiBold },
  button: {
    borderRadius: RADIUS.r50,
    paddingVertical: SPACE.s20,
    alignItems: 'center',
    marginTop: SPACE.s8,
  },
  buttonText: { fontSize: FONT_SIZE.f18, fontFamily: FONTS.semiBold },
  forgot: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    marginTop: SPACE.s4,
  },
  errorText: { fontSize: FONT_SIZE.f13, fontFamily: FONTS.semiBold },
  // Pressed feedback, matching the old TouchableOpacity activeOpacity values.
  pressed: { opacity: ALPHA.a70 },
  pressedStrong: { opacity: ALPHA.a80 },
});
