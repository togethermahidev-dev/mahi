import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput as RNTextInput,
  Keyboard,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { sendOTP, verifyOTP, clearOTP, getOTPState, OTP_LENGTH } from '@/lib/otp';
import { sanitiseOtp, reusableCode, codeTimes } from '@/lib/otpCode';
import { completeSignup } from '@/api/auth';
import { useFeedStore, useInviteStore, useSignUpStore, useTagStore, useUserStore } from '@/store';
import { getProfile } from '@/api';
import { invitePreviewLine, typedInvite } from '@/lib/inviteLink';
import {
  getPasswordStrength,
  MIN_PASSWORD_LENGTH,
  PASSWORD_HINT,
  PASSWORD_PLACEHOLDER,
  PASSWORD_RULES,
  type Strength,
} from '@/lib/password';
import { authErrorText, WEAK_PASSWORD_MESSAGE } from '@/lib/account';
import { reportAuthError } from '@/lib/authReport';
import { Sentry, reportError } from '@/lib/sentry';
import { posthog } from '@/lib/posthog';
import { env } from '@/lib/env';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  FONT_SIZE,
  LINE_HEIGHT,
  RADIUS,
  SIZE,
  SPACE,
  TRACKING,
} from '@/constants/tokens';
import { themeColors, useAppTheme } from '@/hooks/useAppTheme';

const SUPABASE_URL = env.supabaseUrl;

const DOMAINS = ['gmail.com', 'hotmail.com', 'icloud.com', 'outlook.com', 'yahoo.com'];
const GOALS = [
  'Lose weight',
  'Build muscle',
  'Improve endurance',
  'Flexibility',
  'General fitness',
  'Sports performance',
];

// ─── Props ───────────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onDismiss: () => void;
  onAuthComplete: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function CreateAccountSheet({
  visible,
  onDismiss,
  onAuthComplete,
}: Props): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.white : COLORS.inkDeep;
  const inputBg = dark ? COLORS.surfaceDark : COLORS.surfaceLight;
  const { muted } = themeColors(dark);
  const green = dark ? COLORS.success : COLORS.successDeep;
  const red = dark ? COLORS.dangerSoft : COLORS.dangerDeep;
  const amber = dark ? COLORS.amber : COLORS.amberText;

  // ── UI state (local) ───────────────────────────────────────────────────────
  const [step, setStep] = useState(1);
  // An invite the app was opened with, or one typed in below. Claimed after sign-up.
  const invitePreview = useInviteStore((s) => s.preview);
  const pendingInvite = useInviteStore((s) => s.pendingToken);
  const inviteChecked = useInviteStore((s) => s.previewChecked);
  const [codeInput, setCodeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Step 2 — the code, in one field; the boxes are drawn from it
  const [otp, setOtp] = useState('');
  // Code verified in step 2 — complete-signup checks it again before creating the account.
  const [enteredCode, setEnteredCode] = useState('');
  const passwordRef = useRef<RNTextInput>(null);
  const otpRef = useRef<RNTextInput>(null);
  const [otpFocused, setOtpFocused] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const focusBorder = (field: string) => ({
    borderWidth: focusedField === field ? BORDER_WIDTH.w2 : 0,
    borderColor: focusedField === field ? COLORS.accent : 'transparent',
    backgroundColor: focusedField === field ? (dark ? COLORS.borderDark : COLORS.white) : inputBg,
  });

  // Step 2 — countdown timer & resend cooldown
  const [secondsLeft, setSecondsLeft] = useState(600);
  const [resendReady, setResendReady] = useState(false);
  const [codeSentAt, setCodeSentAt] = useState<number | null>(null);

  // Step 4 — username availability
  const [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'unknown'
  >('idle');
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 1 — email-exists hint (debounced, non-blocking)
  const [emailExists, setEmailExists] = useState(false);
  const emailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Zustand form state ─────────────────────────────────────────────────────
  const {
    email,
    password,
    firstName,
    lastName,
    dobDD,
    dobMM,
    dobYYYY,
    contactNumber,
    username,
    displayName,
    fitnessGoals,
    setField,
    toggleGoal,
    reset: resetForm,
  } = useSignUpStore();

  // ── Step logging ──────────────────────────────────────────────────────────
  useEffect(() => {
    const names: Record<number, string> = {
      1: 'Email & Password',
      2: 'OTP Verification',
      3: 'Getting Started (personal details)',
      4: 'Your Profile (fitness)',
    };
  }, [step]);

  // ── Countdown timer (runs from when the current code was sent) ────────────
  useEffect(() => {
    if (step !== 2 || codeSentAt === null) return;
    const { secondsLeft: left, resendInMs } = codeTimes(codeSentAt, Date.now());
    setSecondsLeft(left);
    setResendReady(resendInMs === 0);
    const countdown = setInterval(() => {
      setSecondsLeft(codeTimes(codeSentAt, Date.now()).secondsLeft);
    }, 1000);
    const resendTimer = setTimeout(() => setResendReady(true), resendInMs);
    return () => {
      clearInterval(countdown);
      clearTimeout(resendTimer);
    };
  }, [step, codeSentAt]);

  // ── Username availability (real query against profiles table) ─────────────
  useEffect(() => {
    if (!username) {
      setUsernameStatus('idle');
      return;
    }
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    setUsernameStatus('checking');
    usernameTimer.current = setTimeout(async () => {
      // Signed out, profiles can't be read; the server answers free or taken only.
      const { data, error } = await supabase.rpc('username_available', {
        p_username: username,
      });
      if (error) {
        reportError(error, { flow: 'signup', action: 'checkUsername', level: 'warning' });
        setUsernameStatus('unknown');
        return;
      }
      setUsernameStatus(data ? 'available' : 'taken');
    }, 500);
  }, [username]);

  // ── Email-exists check (debounced, non-blocking UX hint) ──────────────────
  useEffect(() => {
    if (!email || !email.includes('@')) {
      setEmailExists(false);
      return;
    }
    if (emailTimer.current) clearTimeout(emailTimer.current);
    emailTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/check-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.toLowerCase() }),
        });
        const json = await res.json();
        setEmailExists(json.exists === true);
      } catch (e) {
        reportError(e, { flow: 'signup', action: 'checkEmail', level: 'warning' });
        setEmailExists(false); // never block sign-up on error
      }
    }, 700);
  }, [email]);

  // ── OTP input handler ──────────────────────────────────────────────────────
  // Typed, pasted or autofilled: once the whole code is in, check it (pass the
  // code directly to avoid stale state).
  const handleOtpChange = (raw: string) => {
    const code = sanitiseOtp(raw, OTP_LENGTH);
    setOtp(code);
    if (code.length === OTP_LENGTH) handleStep2Next(code);
  };

  // ── Reset everything on close ──────────────────────────────────────────────
  const handleDismiss = useCallback(() => {
    setStep(1);
    setError('');
    setLoading(false);
    setShowPassword(false);
    setOtp('');
    setEnteredCode('');
    setUsernameStatus('idle');
    setEmailExists(false);
    // The sent-code record is kept, so reopening with the same email goes back to that code.
    resetForm();
    onDismiss();
  }, [onDismiss, resetForm]);

  // ── Step handlers ──────────────────────────────────────────────────────────

  // Step 1 → 2: send OTP
  const handleStep1Next = async () => {
    if (loading) return;
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    if (!password.trim()) {
      setError('Password is required.');
      return;
    }
    // One rule, said the same way as the hint under the field.
    if (password.length < MIN_PASSWORD_LENGTH || getPasswordStrength(password) === 'low') {
      setError(WEAK_PASSWORD_MESSAGE);
      return;
    }
    setError('');
    setLoading(true);
    try {
      // Back then Next (or closing and reopening) with the same email: the code already sent
      // still works, so go back to it. Asking again inside a minute is refused by the server
      // and would leave the user stuck here; after that it would cancel the code they have.
      const sent = await getOTPState();
      if (sent && reusableCode(sent, email, Date.now())) {
        posthog.capture('signup_otp_reused');
        setCodeSentAt(sent.sentAt);
        setStep(2);
        return;
      }
      await sendOTP(email.trim());
      Sentry.addBreadcrumb({ category: 'signup', message: 'OTP sent', level: 'info' });
      posthog.capture('signup_otp_sent');
      setCodeSentAt(Date.now());
      setStep(2);
    } catch (e: any) {
      reportAuthError(e, 'signup', 'send_otp');
      setError(authErrorText(e?.message, 'send-code'));
    } finally {
      setLoading(false);
    }
  };

  // Step 2 → 3: the server checks the code now (verify-otp); complete-signup
  // checks it again on the final step before creating the account.
  // codeOverride used by auto-advance (avoids stale otp state after setOtp).
  const handleStep2Next = async (codeOverride?: string) => {
    const code = codeOverride ?? otp;
    if (code.length < OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code.`);
      return;
    }
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      await verifyOTP(email, code);
      await clearOTP(); // spent on the server: going back to step 1 must send a fresh one
      setEnteredCode(code);
      Sentry.addBreadcrumb({ category: 'signup', message: 'OTP verified', level: 'info' });
      posthog.capture('signup_otp_verified');
      setStep(3);
    } catch (e: any) {
      posthog.capture('signup_otp_rejected');
      reportAuthError(e, 'signup', 'verify_otp');
      setError(authErrorText(e?.message, 'check-code'));
      setOtp('');
      otpRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResend = async () => {
    if (!resendReady) return;
    setError('');
    setLoading(true);
    try {
      await sendOTP(email.trim());
      setOtp('');
      setEnteredCode('');
      setCodeSentAt(Date.now());
    } catch (e: any) {
      reportAuthError(e, 'signup', 'resend_otp');
      setError(authErrorText(e?.message, 'send-code'));
    } finally {
      setLoading(false);
    }
  };

  // Step 3 → 4: validate personal details (all fields required)
  const handleStep3Next = () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are required.');
      return;
    }
    if (!dobDD || !dobMM || !dobYYYY || dobYYYY.length < 4) {
      setError('Enter a valid date of birth.');
      return;
    }
    if (!contactNumber.trim()) {
      setError('Contact number is required.');
      return;
    }
    setError('');
    setStep(4);
  };

  // Step 4: create account
  const handleCreateAccount = async () => {
    if (!username.trim()) {
      setError('Username is required.');
      return;
    }
    if (usernameStatus === 'taken') {
      setError('That username is already taken.');
      return;
    }
    // Still checking: the note under the field already says so (not an error).
    if (usernameStatus === 'checking') return;
    if (fitnessGoals.length === 0) {
      setError('Select at least one fitness goal.');
      return;
    }
    if (enteredCode.length < OTP_LENGTH) {
      setError('Go back and enter the code from your email again.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      // 1. Create the confirmed auth user server-side. complete-signup only
      //    does so for a code verify-otp accepted in the last 30 minutes; an
      //    expired one surfaces here as the thrown error message.
      await completeSignup(email.trim().toLowerCase(), password, enteredCode);

      // 2. Sign in to obtain a session
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError || !signInData.session) {
        throw new Error(signInError?.message ?? 'Sign in failed.');
      }

      // 3. Insert profile row (auth.uid() is now set via RLS)
      const dob = `${dobYYYY}-${dobMM.padStart(2, '0')}-${dobDD.padStart(2, '0')}`;
      const { error: profileError } = await supabase.from('profiles').insert({
        id: signInData.session.user.id,
        username: username.trim().toLowerCase(),
        display_name: displayName.trim() || null,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        date_of_birth: dob,
        contact_number: contactNumber.trim() || null,
        fitness_goals: fitnessGoals.length > 0 ? fitnessGoals : null,
      });
      if (profileError)
        throw new Error('Profile save failed: ' + profileError.message, { cause: profileError });

      // Signing in (step 2) already started loading the profile, before it existed. Load it again
      // now it's saved, so the camera and the invite claim (which waits for it) can go ahead.
      const { data: savedProfile, error: reloadError } = await getProfile(
        signInData.session.user.id
      );
      if (reloadError) {
        reportError(reloadError, { flow: 'signup', action: 'reloadProfile' });
      } else if (savedProfile) {
        useUserStore.getState().setProfile(savedProfile);
        useFeedStore.getState().sync(true);
        useTagStore.getState().syncOpenTags();
      }

      // 4. Track completed sign-up — fitness_goals is used in PostHog dashboards. `joined_via`
      //    splits the two paths (Maximus, 2026-10-07): an invite from a mate, or downloaded alone.
      const joinedVia = useInviteStore.getState().pendingToken ? 'invite' : 'self';
      posthog.capture('signup_completed', {
        username: username.trim().toLowerCase(),
        fitness_goals: fitnessGoals,
        joined_via: joinedVia,
        $set_once: { joined_via: joinedVia },
      });
      Sentry.addBreadcrumb({ category: 'signup', message: 'Account created', level: 'info' });
      await clearOTP(); // the code is spent

      // 5. onAuthStateChange in App.tsx fires from signInWithPassword above,
      //    switching to CameraScreen. onAuthComplete triggers the exit animation.
      onAuthComplete();
    } catch (e: any) {
      reportAuthError(e, 'signup', 'create_account');
      setError(authErrorText(e?.message, 'create'));
    } finally {
      setLoading(false);
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const strength = getPasswordStrength(password);
  const strengthColour = strength === 'high' ? green : strength === 'medium' ? amber : red;
  const strengthLabel = strength === 'high' ? 'High' : strength === 'medium' ? 'Medium' : 'Low';

  const atIndex = email.indexOf('@');
  const showPills = atIndex !== -1 && email.slice(atIndex + 1).length <= 1;
  const localPart = atIndex !== -1 ? email.slice(0, atIndex + 1) : email + '@';

  const dobSet = !!(dobDD && dobMM && dobYYYY);
  const dobValue = dobSet
    ? new Date(Number(dobYYYY), Number(dobMM) - 1, Number(dobDD))
    : new Date(2000, 0, 1);
  const setDob = (date: Date) => {
    setField('dobDD', String(date.getDate()).padStart(2, '0'));
    setField('dobMM', String(date.getMonth() + 1).padStart(2, '0'));
    setField('dobYYYY', String(date.getFullYear()));
  };
  // Android: the system date dialog.
  const openAndroidDob = () => {
    Keyboard.dismiss();
    DateTimePickerAndroid.open({
      value: dobValue,
      mode: 'date',
      maximumDate: new Date(),
      onValueChange: (_event, date) => setDob(date),
    });
  };

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secs = String(secondsLeft % 60).padStart(2, '0');

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
    >
      <SafeAreaView style={[styles.root, { backgroundColor: bg }]}>
        {/* Progress dots */}
        <View style={styles.dots}>
          {[1, 2, 3, 4].map((n) => (
            <View
              key={n}
              style={[styles.dot, { backgroundColor: text, opacity: step === n ? 1 : ALPHA.a20 }]}
            />
          ))}
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          {/* ── View 1 — Email + Password ─────────────────────────────────── */}
          {step === 1 && (
            <View style={styles.step}>
              <Text style={[styles.title, { color: text }]}>Create account</Text>

              {/* Invite — who sent it, or a place to type its code */}
              {invitePreview ? (
                <View style={[styles.inviteCard, { backgroundColor: inputBg }]}>
                  <Text style={[styles.inviteWho, { color: text }]}>
                    @{invitePreview.username} invited you
                  </Text>
                  <Text style={[styles.inviteWhat, { color: muted }]}>
                    {invitePreviewLine(invitePreview)}
                  </Text>
                </View>
              ) : pendingInvite && !codeInput && !inviteChecked ? null : (
                <>
                  <Text style={[styles.label, { color: muted }]}>Got an invite link?</Text>
                  <TextInput
                    style={[
                      styles.input,
                      styles.inviteCodeInput,
                      { backgroundColor: inputBg, color: text },
                      focusBorder('inviteCode'),
                    ]}
                    value={codeInput}
                    onChangeText={(v) => {
                      // A code, or a whole invite link pasted in.
                      setCodeInput(v);
                      useInviteStore.getState().setPending(typedInvite(v));
                    }}
                    onFocus={() => setFocusedField('inviteCode')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Paste the link or code"
                    placeholderTextColor={muted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  {codeInput.trim().length >= 6 && (!pendingInvite || inviteChecked) ? (
                    <Text style={[styles.inviteWhat, { color: muted }]}>
                      {pendingInvite
                        ? "That invite code isn't right. Check it and try again."
                        : 'An invite code is 6 letters and numbers.'}
                    </Text>
                  ) : null}
                </>
              )}

              {/* Email */}
              <Text style={[styles.label, { color: muted }]}>Email</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: inputBg, color: text },
                  focusBorder('email'),
                ]}
                value={email}
                onChangeText={(v) => {
                  setField('email', v);
                  setError('');
                }}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
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

              {/* Email domain suggestion pills */}
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
                      onPress={() => setField('email', localPart + domain)}
                      accessibilityRole="button"
                      accessibilityLabel={`Use @${domain}`}
                    >
                      <Text style={[styles.pillText, { color: text }]}>@{domain}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Email-exists hint (non-blocking) */}
              {emailExists && (
                <Text style={[styles.fieldNote, { color: amber }]}>
                  Looks like you have an account — try logging in.
                </Text>
              )}

              {/* Password */}
              <Text style={[styles.label, { color: muted }]}>Password</Text>
              <View
                style={[styles.inputRow, { backgroundColor: inputBg }, focusBorder('password')]}
              >
                <TextInput
                  ref={passwordRef}
                  style={[styles.inputInner, { color: text }]}
                  value={password}
                  onChangeText={(v) => {
                    setField('password', v);
                    setError('');
                  }}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder={PASSWORD_PLACEHOLDER}
                  placeholderTextColor={muted}
                  secureTextEntry={!showPassword}
                  textContentType="newPassword"
                  autoComplete="new-password"
                  passwordRules={PASSWORD_RULES}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={handleStep1Next}
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

              {/* The rule, from the start, so the placeholder and the check agree */}
              <Text style={[styles.passwordHint, { color: muted }]}>{PASSWORD_HINT}</Text>

              {/* Password strength bar */}
              {password.length > 0 && (
                <View style={styles.strengthRow}>
                  {(['low', 'medium', 'high'] as Strength[]).map((lvl, i) => {
                    const levels: Record<Strength, number> = { low: 1, medium: 2, high: 3 };
                    const active = levels[strength!] >= levels[lvl];
                    return (
                      <View
                        key={lvl}
                        style={[
                          styles.strengthSegment,
                          { backgroundColor: active ? strengthColour : inputBg },
                        ]}
                      />
                    );
                  })}
                  <Text style={[styles.strengthLabel, { color: strengthColour }]}>
                    {strengthLabel}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── View 2 — OTP verification ────────────────────────────────── */}
          {step === 2 && (
            <View style={styles.step}>
              <Text style={[styles.title, { color: text }]}>Verify</Text>
              <Text style={[styles.subtitle, { color: muted }]}>Code sent to {email}</Text>

              {/* Countdown */}
              <Text style={[styles.countdown, { color: secondsLeft < 60 ? red : muted }]}>
                {secondsLeft > 0 ? `Expires in ${mins}:${secs}` : 'Code expired — please resend'}
              </Text>

              <Text style={[styles.label, { color: muted }]}>Code</Text>
              {/* One real field (iOS offers the emailed code above the keyboard). The
                  boxes are drawn from its value; the field lies invisibly on top of
                  them, so tapping any box focuses it and long-press pastes. */}
              <View>
                <View
                  style={styles.otpRow}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  {Array.from({ length: OTP_LENGTH }, (_, i) => {
                    const digit = otp[i] ?? '';
                    const current = otpFocused && i === Math.min(otp.length, OTP_LENGTH - 1);
                    return (
                      <View
                        key={i}
                        style={[
                          styles.otpBox,
                          {
                            backgroundColor: inputBg,
                            borderColor: current ? COLORS.accent : digit ? text : 'transparent',
                            borderWidth: current ? BORDER_WIDTH.w2 : BORDER_WIDTH.w1_5,
                          },
                        ]}
                      >
                        <Text style={[styles.otpDigit, { color: text }]}>{digit}</Text>
                      </View>
                    );
                  })}
                </View>
                <TextInput
                  ref={otpRef}
                  style={styles.otpInput}
                  value={otp}
                  onChangeText={handleOtpChange}
                  onFocus={() => setOtpFocused(true)}
                  onBlur={() => setOtpFocused(false)}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  maxLength={OTP_LENGTH}
                  caretHidden
                  autoFocus
                  accessibilityLabel="Verification code"
                />
              </View>

              {/* Resend */}
              <Pressable
                onPress={handleResend}
                disabled={!resendReady || loading}
                style={({ pressed }) => pressed && styles.pressed}
                accessibilityRole="button"
                accessibilityState={{ disabled: !resendReady || loading }}
              >
                <Text style={[styles.resendText, { color: resendReady ? text : muted }]}>
                  {resendReady ? 'Resend code' : 'Resend available in 1 min'}
                </Text>
              </Pressable>
            </View>
          )}

          {/* ── View 3 — Personal details ─────────────────────────────────── */}
          {step === 3 && (
            <View style={styles.step}>
              <Text style={[styles.title, { color: text }]}>Getting started</Text>

              <Text style={[styles.label, { color: muted }]}>First name</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: inputBg, color: text },
                  focusBorder('firstName'),
                ]}
                value={firstName}
                onChangeText={(v) => setField('firstName', v)}
                onFocus={() => setFocusedField('firstName')}
                onBlur={() => setFocusedField(null)}
                placeholder="Jane"
                placeholderTextColor={muted}
                textContentType="givenName"
                autoComplete="given-name"
                autoCapitalize="words"
              />

              <Text style={[styles.label, { color: muted }]}>Last name</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: inputBg, color: text },
                  focusBorder('lastName'),
                ]}
                value={lastName}
                onChangeText={(v) => setField('lastName', v)}
                onFocus={() => setFocusedField('lastName')}
                onBlur={() => setFocusedField(null)}
                placeholder="Smith"
                placeholderTextColor={muted}
                textContentType="familyName"
                autoComplete="family-name"
                autoCapitalize="words"
              />

              <Text style={[styles.label, { color: muted }]}>Date of birth</Text>
              {Platform.OS === 'ios' ? (
                // iOS: the native date field; tapping it opens the system calendar popover.
                <View
                  style={[styles.input, styles.dobRow, { backgroundColor: inputBg }]}
                  onTouchStart={() => Keyboard.dismiss()}
                >
                  <View style={!dobSet && styles.dobUnset}>
                    <DateTimePicker
                      value={dobValue}
                      mode="date"
                      display="compact"
                      maximumDate={new Date()}
                      themeVariant={dark ? 'dark' : 'light'}
                      onValueChange={(_event, date) => setDob(date)}
                      accessibilityLabel="Date of birth"
                    />
                  </View>
                  {!dobSet && <Text style={[styles.dobHint, { color: muted }]}>Tap to choose</Text>}
                </View>
              ) : (
                <Pressable
                  style={({ pressed }) => [
                    styles.input,
                    { backgroundColor: inputBg },
                    pressed && styles.pressedStrong,
                  ]}
                  onPress={openAndroidDob}
                  accessibilityRole="button"
                  accessibilityLabel="Date of birth"
                >
                  <Text
                    style={{
                      color: dobSet ? text : muted,
                      fontSize: FONT_SIZE.f16,
                      fontFamily: FONTS.semiBold,
                    }}
                  >
                    {dobSet ? `${dobDD}/${dobMM}/${dobYYYY}` : 'DD/MM/YYYY'}
                  </Text>
                </Pressable>
              )}

              <Text style={[styles.label, { color: muted }]}>Contact number</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: inputBg, color: text },
                  focusBorder('contactNumber'),
                ]}
                value={contactNumber}
                onChangeText={(v) => setField('contactNumber', v)}
                onFocus={() => setFocusedField('contactNumber')}
                onBlur={() => setFocusedField(null)}
                placeholder="+44 7700 000000"
                placeholderTextColor={muted}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
              />
              {/* Why these two are asked (#24 keeps both required). Nothing in the app shows them. */}
              <Text style={[styles.whyNote, { color: muted }]}>
                We use your date of birth and number to keep Mahi safe for everyone, and never show
                them on your profile.
              </Text>
            </View>
          )}

          {/* ── View 4 — Fitness profile ──────────────────────────────────── */}
          {step === 4 && (
            <View style={styles.step}>
              <Text style={[styles.title, { color: text }]}>Your profile</Text>

              <Text style={[styles.label, { color: muted }]}>Username</Text>
              <View
                style={[styles.inputRow, { backgroundColor: inputBg }, focusBorder('username')]}
              >
                <Text style={[styles.atSign, { color: username ? text : muted }]}>@</Text>
                <TextInput
                  style={[styles.inputInner, { color: text }]}
                  value={username}
                  onChangeText={(v) => {
                    setField('username', v.replace('@', ''));
                    setUsernameStatus('idle');
                  }}
                  onFocus={() => setFocusedField('username')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="janesmith"
                  placeholderTextColor={muted}
                  // The @handle is not the login, so keep iOS from offering saved passwords here.
                  textContentType="none"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {usernameStatus === 'checking' && (
                <Text style={[styles.fieldNote, { color: muted }]}>Checking…</Text>
              )}
              {usernameStatus === 'available' && (
                <Text style={[styles.fieldNote, { color: green }]}>✓ Available</Text>
              )}
              {usernameStatus === 'taken' && (
                <Text style={[styles.fieldNote, { color: red }]}>✗ Already taken</Text>
              )}
              {usernameStatus === 'unknown' && (
                <Text style={[styles.fieldNote, { color: muted }]}>
                  Couldn’t check this name right now.
                </Text>
              )}

              <Text style={[styles.label, { color: muted }]}>
                Display name <Text style={[styles.optionalTag, { color: muted }]}>(optional)</Text>
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: inputBg, color: text },
                  focusBorder('displayName'),
                ]}
                value={displayName}
                onChangeText={(v) => setField('displayName', v)}
                onFocus={() => setFocusedField('displayName')}
                onBlur={() => setFocusedField(null)}
                placeholder="Jane Smith"
                placeholderTextColor={muted}
              />

              <Text style={[styles.label, { color: muted }]}>Fitness goals</Text>
              <Text style={[styles.subtitle, { color: muted }]}>Select all that apply</Text>
              <View style={styles.goalsGrid}>
                {GOALS.map((g) => {
                  const selected = fitnessGoals.includes(g);
                  return (
                    <Pressable
                      key={g}
                      style={({ pressed }) => [
                        styles.goalPill,
                        selected
                          ? { backgroundColor: text }
                          : {
                              backgroundColor: 'transparent',
                              borderWidth: BORDER_WIDTH.w1_5,
                              borderColor: text,
                            },
                        pressed && styles.pressed,
                      ]}
                      onPress={() => toggleGoal(g)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                    >
                      <Text style={[styles.goalText, { color: selected ? bg : text }]}>{g}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Inline error */}
          {error !== '' && <Text style={[styles.errorText, { color: red }]}>{error}</Text>}

          {/* Navigation */}
          <View style={styles.navRow}>
            {step > 1 && (
              <Pressable
                style={({ pressed }) => [
                  styles.navBtn,
                  styles.navBtnOutline,
                  { borderColor: text, flex: 1 },
                  pressed && styles.pressedStrong,
                ]}
                onPress={() => {
                  setError('');
                  setStep((s) => s - 1);
                }}
                disabled={loading}
                accessibilityRole="button"
                accessibilityState={{ disabled: loading }}
              >
                <Text style={[styles.navBtnText, { color: text }]}>Back</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.navBtn,
                { backgroundColor: text, flex: step > 1 ? 2 : 1, opacity: loading ? ALPHA.a60 : 1 },
                pressed && styles.pressedStrong,
              ]}
              onPress={
                step === 1
                  ? handleStep1Next
                  : step === 2
                    ? () => handleStep2Next()
                    : step === 3
                      ? handleStep3Next
                      : handleCreateAccount
              }
              disabled={loading}
              accessibilityRole="button"
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              {loading ? (
                <ActivityIndicator color={bg} />
              ) : (
                <Text style={[styles.navBtnText, { color: bg }]}>
                  {step === 4 ? 'Create account' : 'Next'}
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACE.s8,
    paddingTop: SPACE.s20,
    paddingBottom: SPACE.s4,
  },
  dot: { width: SIZE.z8, height: SIZE.z8, borderRadius: RADIUS.r4 },
  content: { padding: SPACE.s32, gap: SPACE.s12 },
  step: { gap: SPACE.s12 },

  title: {
    fontSize: FONT_SIZE.f32,
    fontFamily: FONTS.bold,
    letterSpacing: TRACKING.t2,
    marginBottom: SPACE.s8,
  },
  subtitle: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.regular,
    marginTop: -SPACE.s4,
    marginBottom: SPACE.s4,
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

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s8, marginTop: SPACE.s4 },
  pill: {
    borderWidth: BORDER_WIDTH.w1_5,
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s14,
    paddingVertical: SPACE.s8,
  },
  pillText: { fontSize: FONT_SIZE.f13, fontFamily: FONTS.semiBold },

  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s6, marginTop: -SPACE.s4 },
  strengthSegment: { flex: 1, height: SIZE.z4, borderRadius: RADIUS.r2 },
  strengthLabel: { fontSize: FONT_SIZE.f12, fontFamily: FONTS.semiBold, marginLeft: SPACE.s4 },

  countdown: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
    marginBottom: SPACE.s4,
  },
  resendText: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    marginTop: SPACE.s4,
  },

  otpRow: { flexDirection: 'row', gap: SPACE.s8, justifyContent: 'center' },
  otpBox: {
    width: SIZE.z46,
    height: SIZE.z60,
    borderRadius: RADIUS.r12,
    borderWidth: BORDER_WIDTH.w1_5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigit: { fontSize: FONT_SIZE.f24, fontFamily: FONTS.bold },
  // Near-zero (not zero) opacity keeps the field tappable and open to autofill.
  otpInput: { ...StyleSheet.absoluteFill, opacity: ALPHA.a01 },

  inviteCard: {
    borderRadius: RADIUS.r14,
    paddingHorizontal: SPACE.s16,
    paddingVertical: SPACE.s14,
    gap: SPACE.s4,
  },
  inviteWho: { fontSize: FONT_SIZE.f15, fontFamily: FONTS.bold, letterSpacing: TRACKING.t1 },
  inviteWhat: { fontSize: FONT_SIZE.f13, fontFamily: FONTS.regular, lineHeight: LINE_HEIGHT.l18 },
  inviteCodeInput: { letterSpacing: TRACKING.t4 },

  fieldNote: { fontSize: FONT_SIZE.f13, fontFamily: FONTS.semiBold, marginTop: -SPACE.s4 },
  errorText: { fontSize: FONT_SIZE.f13, fontFamily: FONTS.semiBold, marginTop: SPACE.s4 },
  passwordHint: { fontSize: FONT_SIZE.f12, fontFamily: FONTS.regular, marginTop: -SPACE.s4 },
  whyNote: { fontSize: FONT_SIZE.f12, fontFamily: FONTS.regular, marginTop: SPACE.s8 },

  atSign: { fontSize: FONT_SIZE.f16, fontFamily: FONTS.semiBold, paddingRight: SPACE.s2 },
  optionalTag: { fontSize: FONT_SIZE.f11, fontFamily: FONTS.regular },

  goalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s10, marginTop: SPACE.s4 },
  goalPill: { borderRadius: RADIUS.r50, paddingHorizontal: SPACE.s18, paddingVertical: SPACE.s12 },
  goalText: { fontSize: FONT_SIZE.f14, fontFamily: FONTS.semiBold },

  navRow: { flexDirection: 'row', gap: SPACE.s12, marginTop: SPACE.s16 },
  navBtn: { borderRadius: RADIUS.r50, paddingVertical: SPACE.s20, alignItems: 'center' },
  navBtnOutline: { backgroundColor: 'transparent', borderWidth: BORDER_WIDTH.w1_5 },
  navBtnText: { fontSize: FONT_SIZE.f18, fontFamily: FONTS.semiBold },

  dobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACE.s8,
  },
  // Until a date is picked the field shows a placeholder date, so it is dimmed.
  dobUnset: { opacity: ALPHA.a40 },
  dobHint: { fontSize: FONT_SIZE.f14, fontFamily: FONTS.regular },

  // Pressed feedback, matching the old TouchableOpacity activeOpacity values.
  pressed: { opacity: ALPHA.a70 },
  pressedStrong: { opacity: ALPHA.a80 },
});
