import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { Sentry } from '@/lib/sentry';
import { posthog } from '@/lib/posthog';
import { FONTS } from '@/constants/fonts';
import { COLORS, FONT_SIZE, SPACE, RADIUS } from '@/constants/tokens';

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
  const dark = useColorScheme() === 'dark';
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.white : COLORS.inkDeep;
  const inputBg = dark ? COLORS.surfaceDark : COLORS.surfaceLight;
  const muted = dark ? COLORS.grey888 : COLORS.grey999;
  const red = dark ? COLORS.dangerSoft : COLORS.dangerDeep;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
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
      setError(signInError.message);
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
          <Text style={[styles.title, { color: text }]}>Login</Text>

          {/* Email */}
          <Text style={[styles.label, { color: muted }]}>Email</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: text }]}
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            placeholderTextColor={muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Email domain pills */}
          {showPills && (
            <View style={styles.pillRow}>
              {DOMAINS.map((domain) => (
                <TouchableOpacity
                  key={domain}
                  style={[styles.pill, { borderColor: text }]}
                  onPress={() => setEmail(localPart + domain)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pillText, { color: text }]}>@{domain}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Password */}
          <Text style={[styles.label, { color: muted }]}>Password</Text>
          <View style={[styles.inputRow, { backgroundColor: inputBg }]}>
            <TextInput
              style={[styles.inputInner, { color: text }]}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={muted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => setShowPassword((p) => !p)} activeOpacity={0.7}>
              <Text style={[styles.toggle, { color: muted }]}>
                {showPassword ? 'Hide' : 'Show'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Inline error */}
          {error !== '' && <Text style={[styles.errorText, { color: red }]}>{error}</Text>}

          {/* Login button */}
          <TouchableOpacity
            style={[styles.button, { backgroundColor: text, opacity: loading ? 0.6 : 1 }]}
            activeOpacity={0.8}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={bg} />
            ) : (
              <Text style={[styles.buttonText, { color: bg }]}>Login</Text>
            )}
          </TouchableOpacity>

          {/* Forgot password */}
          <TouchableOpacity onPress={() => {}} activeOpacity={0.7}>
            <Text style={[styles.forgot, { color: muted }]}>Forgot password?</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACE.s32, gap: SPACE.s12 },
  title: { fontSize: FONT_SIZE.f32, fontFamily: FONTS.bold, letterSpacing: 4, marginBottom: SPACE.s16 },
  label: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
    letterSpacing: 1,
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
    borderWidth: 1.5,
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
    fontFamily: FONTS.italic,
    textAlign: 'center',
    marginTop: SPACE.s4,
  },
  errorText: { fontSize: FONT_SIZE.f13, fontFamily: FONTS.semiBold },
});
