import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { resetPassword, sendResetCode, signIn } from '@/api/auth';
import { authErrorText, CODE_LENGTH, PASSWORD_CHANGED_NOTICE, resetFormError } from '@/lib/account';
import { reportAuthError } from '@/lib/authReport';
import { RESEND_AFTER_MS } from '@/lib/otpCode';
import { PASSWORD_HINT, PASSWORD_PLACEHOLDER, PASSWORD_RULES } from '@/lib/password';
import { posthog } from '@/lib/posthog';
import { reportError } from '@/lib/sentry';
import OtpCodeInput from '@/components/OtpCodeInput';
import { FIELD_TEXT, TYPOGRAPHY } from '@/constants/typography';
import { COLORS, ALPHA, RADIUS, SPACE } from '@/constants/tokens';
import { themeColors, useAppTheme } from '@/hooks/useAppTheme';

interface Props {
  visible: boolean;
  /** The email already typed on the log-in sheet, if any. Give the sheet a new `key` on each
   *  open so it starts fresh from this. */
  initialEmail: string;
  onDismiss: () => void;
  /** Password changed and logged in with it. */
  onLoggedIn: () => void;
}

/**
 * "Forgot password?": email → 6-digit code emailed → code + new
 * password → password changed → logged in. The server never says whether the email has an account.
 */
export default function ForgotPasswordSheet({
  visible,
  initialEmail,
  onDismiss,
  onLoggedIn,
}: Props): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.white : COLORS.inkDeep;
  const inputBg = dark ? COLORS.surfaceDark : COLORS.surfaceLight;
  const { muted } = themeColors(dark);
  const red = dark ? COLORS.dangerSoft : COLORS.dangerDeep;

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  /** Good news (the password changed), shown in the muted style, not the red error one. */
  const [notice, setNotice] = useState('');
  const [resendReady, setResendReady] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  // The server allows one code a minute, so Resend unlocks a minute after each send.
  useEffect(() => {
    if (step !== 'code' || resendReady) return;
    const t = setTimeout(() => setResendReady(true), RESEND_AFTER_MS);
    return () => clearTimeout(t);
  }, [step, resendReady]);

  const send = async () => {
    if (loading) return;
    if (!email.trim()) {
      setError('Enter your email.');
      return;
    }
    setError('');
    setLoading(true);
    const { error: sendError } = await sendResetCode(email);
    setLoading(false);
    if (sendError) {
      reportAuthError(sendError, 'auth', 'sendResetCode');
      setError(authErrorText(sendError.message, 'send-code'));
      return;
    }
    posthog.capture('password_reset_code_sent');
    setCode('');
    setResendReady(false);
    setStep('code');
  };

  const submit = async () => {
    if (loading) return;
    const formError = resetFormError({ code, password });
    if (formError) {
      setError(formError);
      return;
    }
    setError('');
    setLoading(true);
    const { error: resetError } = await resetPassword(email, code, password);
    if (resetError) {
      setLoading(false);
      posthog.capture('password_reset_failed', { error: resetError.message });
      reportAuthError(resetError, 'auth', 'resetPassword');
      setError(authErrorText(resetError.message, 'reset'));
      return;
    }
    posthog.capture('password_reset_done');
    const { error: signInError } = await signIn(email.trim().toLowerCase(), password);
    setLoading(false);
    if (signInError) {
      reportError(signInError, { flow: 'auth', action: 'signInAfterReset', level: 'warning' });
      // Rare: the password did change. Back to the log-in sheet to use it.
      setNotice(PASSWORD_CHANGED_NOTICE);
      return;
    }
    onLoggedIn();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
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
            Reset password
          </Text>

          {step === 'email' ? (
            <>
              <Text style={[styles.subtitle, { color: muted }]}>
                We’ll email you a {CODE_LENGTH}-digit code.
              </Text>
              <Text style={[styles.label, { color: muted }]}>Email</Text>
              <TextInput
                style={[styles.input, { backgroundColor: inputBg, color: text }]}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  setError('');
                }}
                placeholder="your@email.com"
                placeholderTextColor={muted}
                keyboardType="email-address"
                textContentType="username"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus={!initialEmail}
                returnKeyType="send"
                onSubmitEditing={send}
              />
            </>
          ) : (
            <>
              <Text style={[styles.subtitle, { color: muted }]}>
                If {email.trim()} has a Mahi account, a code is on its way. It works for 10 minutes.
                Not there? Check your spam folder.
              </Text>

              <Text style={[styles.label, { color: muted }]}>Code</Text>
              <OtpCodeInput
                value={code}
                onChange={(c) => {
                  setCode(c);
                  setError('');
                }}
                onComplete={() => passwordRef.current?.focus()}
                length={CODE_LENGTH}
                textColor={text}
                boxColor={inputBg}
                autoFocus
              />

              {/* iOS saves the new password against this email. */}
              <TextInput
                style={styles.hiddenUsername}
                value={email.trim()}
                textContentType="username"
                autoComplete="email"
                editable={false}
                importantForAccessibility="no"
                accessibilityElementsHidden
              />

              <Text style={[styles.label, { color: muted }]}>New password</Text>
              <View style={[styles.inputRow, { backgroundColor: inputBg }]}>
                <TextInput
                  ref={passwordRef}
                  style={[styles.inputInner, { color: text }]}
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    setError('');
                  }}
                  placeholder={PASSWORD_PLACEHOLDER}
                  placeholderTextColor={muted}
                  secureTextEntry={!showPassword}
                  textContentType="newPassword"
                  autoComplete="new-password"
                  passwordRules={PASSWORD_RULES}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={submit}
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
              <Text style={[styles.hint, { color: muted }]}>{PASSWORD_HINT}</Text>
            </>
          )}

          {error !== '' && <Text style={[styles.errorText, { color: red }]}>{error}</Text>}
          {notice !== '' && error === '' && (
            <Text style={[styles.errorText, { color: text }]} accessibilityLiveRegion="polite">
              {notice}
            </Text>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: text, opacity: loading ? ALPHA.a60 : 1 },
              pressed && styles.pressedStrong,
            ]}
            onPress={step === 'email' ? send : submit}
            disabled={loading}
            accessibilityRole="button"
            accessibilityState={{ disabled: loading, busy: loading }}
          >
            {loading ? (
              <ActivityIndicator color={bg} />
            ) : (
              <Text style={[styles.buttonText, { color: bg }]}>
                {step === 'email' ? 'Send code' : 'Change password'}
              </Text>
            )}
          </Pressable>

          {step === 'code' && (
            <Pressable
              onPress={send}
              disabled={!resendReady || loading}
              style={({ pressed }) => pressed && styles.pressed}
              accessibilityRole="button"
              accessibilityState={{ disabled: !resendReady || loading }}
            >
              <Text style={[styles.link, { color: resendReady ? text : muted }]}>
                {resendReady ? 'Send a new code' : 'New code available in 1 min'}
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => pressed && styles.pressed}
            accessibilityRole="button"
          >
            <Text style={[styles.link, { color: muted }]}>Back to log in</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACE.s32, gap: SPACE.s12 },
  title: { ...TYPOGRAPHY.h1, marginBottom: SPACE.s4 },
  subtitle: { ...TYPOGRAPHY.body, marginBottom: SPACE.s4 },
  label: { ...TYPOGRAPHY.label, marginBottom: -SPACE.s4 },
  input: {
    ...FIELD_TEXT,
    borderRadius: RADIUS.r14,
    paddingHorizontal: SPACE.s16,
    paddingVertical: SPACE.s14,
  },
  inputRow: {
    borderRadius: RADIUS.r14,
    paddingHorizontal: SPACE.s16,
    paddingVertical: SPACE.s4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputInner: { ...FIELD_TEXT, flex: 1, paddingVertical: SPACE.s10 },
  // Kept in the form for iOS autofill only; takes no room and is not seen.
  hiddenUsername: { ...FIELD_TEXT, height: 0, opacity: 0, padding: 0 },
  toggle: { ...TYPOGRAPHY.labelStrong, paddingHorizontal: SPACE.s4 },
  hint: { ...TYPOGRAPHY.caption, marginTop: -SPACE.s4 },
  errorText: { ...TYPOGRAPHY.caption },
  button: {
    borderRadius: RADIUS.r50,
    paddingVertical: SPACE.s20,
    alignItems: 'center',
    marginTop: SPACE.s8,
  },
  buttonText: { ...TYPOGRAPHY.button },
  link: { ...TYPOGRAPHY.bodyMedium, textAlign: 'center', marginTop: SPACE.s4 },
  pressed: { opacity: ALPHA.a70 },
  pressedStrong: { opacity: ALPHA.a80 },
});
