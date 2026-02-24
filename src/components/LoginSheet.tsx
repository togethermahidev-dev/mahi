import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ScrollView, useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { Sentry } from '@/lib/sentry';
import { posthog } from '@/lib/posthog';

const DOMAINS = ['gmail.com', 'icloud.com', 'outlook.com', 'yahoo.com'];

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onAuthComplete: () => void;
}

export default function LoginSheet({ visible, onDismiss, onAuthComplete }: Props): React.JSX.Element {
  const dark = useColorScheme() === 'dark';
  const bg      = dark ? '#1C1C19' : '#FFFFFF';
  const text    = dark ? '#FFFFFF' : '#0F0F0D';
  const inputBg = dark ? '#2A2A27' : '#F5F5F0';
  const muted   = dark ? '#888'    : '#999';
  const red     = dark ? '#E06060' : '#C03030';

  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

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

  const atIndex    = email.indexOf('@');
  const showPills  = atIndex !== -1 && email.slice(atIndex + 1).length <= 1;
  const localPart  = atIndex !== -1 ? email.slice(0, atIndex + 1) : email + '@';

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
              {DOMAINS.map(domain => (
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
            <TouchableOpacity onPress={() => setShowPassword(p => !p)} activeOpacity={0.7}>
              <Text style={[styles.toggle, { color: muted }]}>{showPassword ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>

          {/* Inline error */}
          {error !== '' && (
            <Text style={[styles.errorText, { color: red }]}>{error}</Text>
          )}

          {/* Login button */}
          <TouchableOpacity
            style={[styles.button, { backgroundColor: text, opacity: loading ? 0.6 : 1 }]}
            activeOpacity={0.8}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={bg} />
              : <Text style={[styles.buttonText, { color: bg }]}>Login</Text>
            }
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
  content: { padding: 32, gap: 12 },
  title: { fontSize: 32, fontFamily: 'JosefinSans_700Bold', letterSpacing: 4, marginBottom: 16 },
  label: { fontSize: 13, fontFamily: 'JosefinSans_600SemiBold', letterSpacing: 1, marginBottom: -4 },
  input: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'JosefinSans_600SemiBold',
  },
  inputRow: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputInner: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'JosefinSans_600SemiBold',
    paddingVertical: 10,
  },
  toggle: { fontSize: 13, fontFamily: 'JosefinSans_600SemiBold', paddingHorizontal: 4 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    borderWidth: 1.5,
    borderRadius: 50,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillText: { fontSize: 13, fontFamily: 'JosefinSans_600SemiBold' },
  button: {
    borderRadius: 50,
    paddingVertical: 20,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { fontSize: 18, fontFamily: 'JosefinSans_600SemiBold' },
  forgot:    { fontSize: 14, fontFamily: 'JosefinSans_400Regular_Italic', textAlign: 'center', marginTop: 4 },
  errorText: { fontSize: 13, fontFamily: 'JosefinSans_600SemiBold' },
});
