import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ScrollView, useColorScheme,
  ActivityIndicator, TextInput as RNTextInput, Keyboard,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { sendOTP, verifyOTP, canResend as canResendOTP, clearOTP } from '@/lib/otp';
import { useSignUpStore } from '@/store';
import { Sentry } from '@/lib/sentry';
import { posthog } from '@/lib/posthog';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

const DOMAINS = ['gmail.com', 'hotmail.com', 'icloud.com', 'outlook.com', 'yahoo.com'];
const GOALS = ['Lose weight', 'Build muscle', 'Improve endurance', 'Flexibility', 'General fitness', 'Sports performance'];
const DAYS = [
  { label: 'Mon', full: 'Monday' },
  { label: 'Tue', full: 'Tuesday' },
  { label: 'Wed', full: 'Wednesday' },
  { label: 'Thu', full: 'Thursday' },
  { label: 'Fri', full: 'Friday' },
  { label: 'Sat', full: 'Saturday' },
  { label: 'Sun', full: 'Sunday' },
];

// ─── Password strength ────────────────────────────────────────────────────────
type Strength = 'low' | 'medium' | 'high';

function getPasswordStrength(pw: string): Strength | null {
  if (!pw) return null;
  const hasUpper   = /[A-Z]/.test(pw);
  const hasNumber  = /[0-9]/.test(pw);
  const hasSpecial = /[!@#$%^&*()\-_=+\[\]{};:'",.<>/?\\|`~]/.test(pw);
  const classes    = [hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
  if (pw.length < 8 || classes <= 1) return 'low';
  if (classes === 3)                  return 'high';
  return 'medium';
}

// ─── Props ───────────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onDismiss: () => void;
  onAuthComplete: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function CreateAccountSheet({ visible, onDismiss, onAuthComplete }: Props): React.JSX.Element {
  const dark    = useColorScheme() === 'dark';
  const bg      = dark ? '#1C1C19' : '#FFFFFF';
  const text    = dark ? '#FFFFFF' : '#0F0F0D';
  const inputBg = dark ? '#2A2A27' : '#F5F5F0';
  const muted   = dark ? '#888'    : '#999';
  const green   = dark ? '#5DB075' : '#2D7A4F';
  const red     = dark ? '#E06060' : '#C03030';
  const amber   = dark ? '#D4963A' : '#B07020';

  // ── UI state (local) ───────────────────────────────────────────────────────
  const [step, setStep]               = useState(1);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Step 2 — OTP boxes (6 digits, single entry)
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs       = useRef<(RNTextInput | null)[]>(Array(6).fill(null));

  // Step 2 — countdown timer & resend cooldown
  const [secondsLeft, setSecondsLeft]   = useState(600);
  const [resendReady, setResendReady]   = useState(false);

  // Step 3 — native date picker
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Step 4 — username availability
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 1 — email-exists hint (debounced, non-blocking)
  const [emailExists, setEmailExists] = useState(false);
  const emailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Zustand form state ─────────────────────────────────────────────────────
  const {
    email, password,
    firstName, lastName, dobDD, dobMM, dobYYYY, contactNumber,
    username, displayName, fitnessGoals, fitnessRoutine,
    setField, toggleGoal, toggleRoutineDay, reset: resetForm,
  } = useSignUpStore();

  // ── Step logging ──────────────────────────────────────────────────────────
  useEffect(() => {
    const names: Record<number, string> = {
      1: 'Email & Password',
      2: 'OTP Verification',
      3: 'Getting Started (personal details)',
      4: 'Your Profile (fitness)',
    };
    console.log(`[SignUp] Step ${step} — ${names[step]}`);
  }, [step]);

  // ── Countdown timer (resets each time we enter step 2) ────────────────────
  useEffect(() => {
    if (step !== 2) return;
    setSecondsLeft(600);
    setResendReady(false);
    const countdown = setInterval(() => {
      setSecondsLeft(s => (s <= 1 ? 0 : s - 1));
    }, 1000);
    const resendTimer = setTimeout(() => setResendReady(true), 60_000);
    return () => { clearInterval(countdown); clearTimeout(resendTimer); };
  }, [step]);

  // ── Username availability (real query against profiles table) ─────────────
  useEffect(() => {
    if (!username) { setUsernameStatus('idle'); return; }
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    setUsernameStatus('checking');
    usernameTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', username.toLowerCase())
        .maybeSingle();
      setUsernameStatus(data ? 'taken' : 'available');
    }, 500);
  }, [username]);

  // ── Email-exists check (debounced, non-blocking UX hint) ──────────────────
  useEffect(() => {
    if (!email || !email.includes('@')) { setEmailExists(false); return; }
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
      } catch {
        setEmailExists(false); // never block sign-up on error
      }
    }, 700);
  }, [email]);

  // ── OTP input handler ──────────────────────────────────────────────────────
  const handleOtpChange = (
    val: string,
    i: number,
    arr: string[],
    setArr: (a: string[]) => void,
    refs: React.MutableRefObject<(RNTextInput | null)[]>,
  ) => {
    const next = [...arr];
    next[i] = val.slice(-1);
    setArr(next);
    if (val && i < 5) refs.current[i + 1]?.focus();
    // Auto-advance when last digit is entered (pass code directly to avoid stale state)
    if (val && i === 5) handleStep2Next(next.join(''));
  };

  const handleOtpKeyPress = (
    e: { nativeEvent: { key: string } },
    i: number,
    arr: string[],
    refs: React.MutableRefObject<(RNTextInput | null)[]>,
  ) => {
    if (e.nativeEvent.key === 'Backspace' && arr[i] === '' && i > 0) {
      refs.current[i - 1]?.focus();
    }
  };

  // ── Reset everything on close ──────────────────────────────────────────────
  const handleDismiss = useCallback(() => {
    setStep(1);
    setError('');
    setLoading(false);
    setShowPassword(false);
    setOtp(Array(6).fill(''));
    setUsernameStatus('idle');
    setEmailExists(false);
    clearOTP();
    resetForm();
    onDismiss();
  }, [onDismiss, resetForm]);

  // ── Step handlers ──────────────────────────────────────────────────────────

  // Step 1 → 2: send OTP
  const handleStep1Next = async () => {
    if (!email.trim())    { setError('Email is required.'); return; }
    if (!password.trim()) { setError('Password is required.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (getPasswordStrength(password) === 'low') {
      setError('Password is too weak. Add uppercase letters, numbers, or symbols.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await sendOTP(email.trim());
      Sentry.addBreadcrumb({ category: 'signup', message: 'OTP sent', level: 'info' });
      posthog.capture('signup_otp_sent');
      setStep(2);
    } catch (e: any) {
      Sentry.captureException(e, { tags: { flow: 'signup', step: 'send_otp' }, extra: { email: email.trim().toLowerCase() } });
      setError(e.message ?? 'Failed to send verification email.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 → 3: verify OTP (client-side)
  // codeOverride used by auto-advance (avoids stale otp state after setOtp)
  const handleStep2Next = async (codeOverride?: string) => {
    const code = codeOverride ?? otp.join('');
    if (code.length < 6) { setError('Enter the 6-digit code.'); return; }
    setError('');
    setLoading(true);
    const result = await verifyOTP(code);
    setLoading(false);
    if (!result.success) {
      Sentry.addBreadcrumb({ category: 'signup', message: `OTP verify failed: ${result.error}`, level: 'warning' });
      posthog.capture('signup_otp_failed', { error: result.error });
      setError(result.error ?? 'Incorrect code.');
      return;
    }
    Sentry.addBreadcrumb({ category: 'signup', message: 'OTP verified', level: 'info' });
    posthog.capture('signup_otp_verified');
    setStep(3);
  };

  // Resend OTP
  const handleResend = async () => {
    if (!resendReady) return;
    setError('');
    setLoading(true);
    try {
      await sendOTP(email.trim());
      setOtp(Array(6).fill(''));
      setResendReady(false);
      setSecondsLeft(600);
      setTimeout(() => setResendReady(true), 60_000);
    } catch (e: any) {
      setError(e.message ?? 'Failed to resend code.');
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
    if (!username.trim())               { setError('Username is required.'); return; }
    if (usernameStatus === 'taken')     { setError('That username is already taken.'); return; }
    if (usernameStatus === 'checking')  { setError('Checking username…'); return; }
    if (fitnessGoals.length === 0)      { setError('Select at least one fitness goal.'); return; }
    setError('');
    setLoading(true);
    try {
      // 1. Create auth user with email already confirmed (OTP verified above)
      const signupRes = await fetch(`${SUPABASE_URL}/functions/v1/complete-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const signupJson = await signupRes.json();
      if (!signupRes.ok || signupJson.error) {
        throw new Error(signupJson.error ?? 'Failed to create account.');
      }

      // 2. Sign in to obtain a session
      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
      if (signInError || !signInData.session) {
        throw new Error(signInError?.message ?? 'Sign in failed.');
      }

      // 3. Insert profile row (auth.uid() is now set via RLS)
      const dob = `${dobYYYY}-${dobMM.padStart(2, '0')}-${dobDD.padStart(2, '0')}`;
      const { error: profileError } = await supabase.from('profiles').insert({
        id:              signInData.session.user.id,
        username:        username.trim().toLowerCase(),
        display_name:    displayName.trim() || null,
        first_name:      firstName.trim(),
        last_name:       lastName.trim(),
        date_of_birth:   dob,
        contact_number:  contactNumber.trim() || null,
        fitness_goals:   fitnessGoals.length > 0 ? fitnessGoals : null,
        fitness_routine: fitnessRoutine.length > 0 ? fitnessRoutine.join(',') : null,
      });
      if (profileError) throw new Error('Profile save failed: ' + profileError.message);

      // 4. Track completed sign-up — fitness_goals and training_days arrays
      //    are used in PostHog dashboards for popularity heatmaps.
      posthog.capture('signup_completed', {
        username:      username.trim().toLowerCase(),
        fitness_goals: fitnessGoals,
        training_days: fitnessRoutine,
      });
      Sentry.addBreadcrumb({ category: 'signup', message: 'Account created', level: 'info' });

      // 5. onAuthStateChange in App.tsx fires from signInWithPassword above,
      //    switching to CameraScreen. onAuthComplete triggers the exit animation.
      onAuthComplete();
    } catch (e: any) {
      Sentry.captureException(e, { tags: { flow: 'signup', step: 'create_account' }, extra: { email: email.trim().toLowerCase(), username: username.trim() } });
      setError(e.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const strength        = getPasswordStrength(password);
  const strengthColour  = strength === 'high' ? green : strength === 'medium' ? amber : red;
  const strengthLabel   = strength === 'high' ? 'High' : strength === 'medium' ? 'Medium' : 'Low';

  const atIndex   = email.indexOf('@');
  const showPills = atIndex !== -1 && email.slice(atIndex + 1).length <= 1;
  const localPart = atIndex !== -1 ? email.slice(0, atIndex + 1) : email + '@';

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
          {[1, 2, 3, 4].map(n => (
            <View
              key={n}
              style={[styles.dot, { backgroundColor: text, opacity: step === n ? 1 : 0.2 }]}
            />
          ))}
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── View 1 — Email + Password ─────────────────────────────────── */}
          {step === 1 && (
            <View style={styles.step}>
              <Text style={[styles.title, { color: text }]}>Create account</Text>

              {/* Email */}
              <Text style={[styles.label, { color: muted }]}>Email</Text>
              <TextInput
                style={[styles.input, { backgroundColor: inputBg, color: text }]}
                value={email}
                onChangeText={v => { setField('email', v); setError(''); }}
                placeholder="your@email.com"
                placeholderTextColor={muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* Email domain suggestion pills */}
              {showPills && (
                <View style={styles.pillRow}>
                  {DOMAINS.map(domain => (
                    <TouchableOpacity
                      key={domain}
                      style={[styles.pill, { borderColor: text }]}
                      onPress={() => setField('email', localPart + domain)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.pillText, { color: text }]}>@{domain}</Text>
                    </TouchableOpacity>
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
              <View style={[styles.inputRow, { backgroundColor: inputBg }]}>
                <TextInput
                  style={[styles.inputInner, { color: text }]}
                  value={password}
                  onChangeText={v => { setField('password', v); setError(''); }}
                  placeholder="Min. 8 characters"
                  placeholderTextColor={muted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowPassword(p => !p)} activeOpacity={0.7}>
                  <Text style={[styles.toggle, { color: muted }]}>
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>

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
              <Text style={[styles.subtitle, { color: muted }]}>
                Code sent to {email}
              </Text>

              {/* Countdown */}
              <Text style={[styles.countdown, { color: secondsLeft < 60 ? red : muted }]}>
                {secondsLeft > 0 ? `Expires in ${mins}:${secs}` : 'Code expired — please resend'}
              </Text>

              <Text style={[styles.label, { color: muted }]}>Code</Text>
              <View style={styles.otpRow}>
                {otp.map((val, i) => (
                  <TextInput
                    key={i}
                    ref={r => { otpRefs.current[i] = r; }}
                    style={[styles.otpBox, { backgroundColor: inputBg, color: text, borderColor: val ? text : 'transparent' }]}
                    value={val}
                    onChangeText={v => handleOtpChange(v, i, otp, setOtp, otpRefs)}
                    onKeyPress={e => handleOtpKeyPress(e, i, otp, otpRefs)}
                    keyboardType="number-pad"
                    maxLength={1}
                    textAlign="center"
                    // iOS autofill — place on last input so it triggers after all 6 digits fill
                    textContentType={i === 5 ? 'oneTimeCode' : 'none'}
                  />
                ))}
              </View>

              {/* Resend */}
              <TouchableOpacity
                onPress={handleResend}
                disabled={!resendReady || loading}
                activeOpacity={0.7}
              >
                <Text style={[styles.resendText, { color: resendReady ? text : muted }]}>
                  {resendReady ? 'Resend code' : 'Resend available in 1 min'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── View 3 — Personal details ─────────────────────────────────── */}
          {step === 3 && (
            <View style={styles.step}>
              <Text style={[styles.title, { color: text }]}>Getting started</Text>

              <Text style={[styles.label, { color: muted }]}>First name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: inputBg, color: text }]}
                value={firstName}
                onChangeText={v => setField('firstName', v)}
                placeholder="Jane"
                placeholderTextColor={muted}
              />

              <Text style={[styles.label, { color: muted }]}>Last name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: inputBg, color: text }]}
                value={lastName}
                onChangeText={v => setField('lastName', v)}
                placeholder="Smith"
                placeholderTextColor={muted}
              />

              <Text style={[styles.label, { color: muted }]}>Date of birth</Text>
              <TouchableOpacity
                style={[styles.input, { backgroundColor: inputBg }]}
                onPress={() => { Keyboard.dismiss(); setShowDatePicker(true); }}
                activeOpacity={0.8}
              >
                <Text style={{ color: (dobDD && dobMM && dobYYYY) ? text : muted, fontSize: 16, fontFamily: 'JosefinSans_600SemiBold' }}>
                  {(dobDD && dobMM && dobYYYY) ? `${dobDD}/${dobMM}/${dobYYYY}` : 'DD/MM/YYYY'}
                </Text>
              </TouchableOpacity>

              <Text style={[styles.label, { color: muted }]}>Contact number</Text>
              <TextInput
                style={[styles.input, { backgroundColor: inputBg, color: text }]}
                value={contactNumber}
                onChangeText={v => setField('contactNumber', v)}
                placeholder="+44 7700 000000"
                placeholderTextColor={muted}
                keyboardType="phone-pad"
              />
            </View>
          )}

          {/* ── View 4 — Fitness profile ──────────────────────────────────── */}
          {step === 4 && (
            <View style={styles.step}>
              <Text style={[styles.title, { color: text }]}>Your profile</Text>

              <Text style={[styles.label, { color: muted }]}>Username</Text>
              <View style={[styles.inputRow, { backgroundColor: inputBg }]}>
                <Text style={[styles.atSign, { color: username ? text : muted }]}>@</Text>
                <TextInput
                  style={[styles.inputInner, { color: text }]}
                  value={username}
                  onChangeText={v => { setField('username', v.replace('@', '')); setUsernameStatus('idle'); }}
                  placeholder="janesmith"
                  placeholderTextColor={muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {usernameStatus === 'checking'  && <Text style={[styles.fieldNote, { color: muted  }]}>Checking…</Text>}
              {usernameStatus === 'available' && <Text style={[styles.fieldNote, { color: green  }]}>✓ Available</Text>}
              {usernameStatus === 'taken'     && <Text style={[styles.fieldNote, { color: red    }]}>✗ Already taken</Text>}

              <Text style={[styles.label, { color: muted }]}>Display name <Text style={[styles.optionalTag, { color: muted }]}>(optional)</Text></Text>
              <TextInput
                style={[styles.input, { backgroundColor: inputBg, color: text }]}
                value={displayName}
                onChangeText={v => setField('displayName', v)}
                placeholder="Jane Smith"
                placeholderTextColor={muted}
              />

              <Text style={[styles.label, { color: muted }]}>Fitness goals</Text>
              <Text style={[styles.subtitle, { color: muted }]}>Select all that apply</Text>
              <View style={styles.goalsGrid}>
                {GOALS.map(g => {
                  const selected = fitnessGoals.includes(g);
                  return (
                    <TouchableOpacity
                      key={g}
                      style={[
                        styles.goalPill,
                        selected
                          ? { backgroundColor: text }
                          : { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: text },
                      ]}
                      onPress={() => toggleGoal(g)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.goalText, { color: selected ? bg : text }]}>{g}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: muted }]}>Training days</Text>
              <Text style={[styles.subtitle, { color: muted }]}>Which days do you train?</Text>
              <View style={styles.daysRow}>
                {DAYS.map(({ label, full }) => {
                  const selected = fitnessRoutine.includes(full);
                  return (
                    <TouchableOpacity
                      key={full}
                      style={[
                        styles.dayPill,
                        selected
                          ? { backgroundColor: text }
                          : { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: text },
                      ]}
                      onPress={() => toggleRoutineDay(full)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dayText, { color: selected ? bg : text }]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Inline error */}
          {error !== '' && (
            <Text style={[styles.errorText, { color: red }]}>{error}</Text>
          )}

          {/* Navigation */}
          <View style={styles.navRow}>
            {step > 1 && (
              <TouchableOpacity
                style={[styles.navBtn, styles.navBtnOutline, { borderColor: text, flex: 1 }]}
                onPress={() => { setError(''); setStep(s => s - 1); }}
                activeOpacity={0.8}
                disabled={loading}
              >
                <Text style={[styles.navBtnText, { color: text }]}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.navBtn, { backgroundColor: text, flex: step > 1 ? 2 : 1, opacity: loading ? 0.6 : 1 }]}
              onPress={
                step === 1 ? handleStep1Next :
                step === 2 ? () => handleStep2Next() :
                step === 3 ? handleStep3Next :
                handleCreateAccount
              }
              activeOpacity={0.8}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={bg} />
                : <Text style={[styles.navBtnText, { color: bg }]}>
                    {step === 4 ? 'Create account' : 'Next'}
                  </Text>
              }
            </TouchableOpacity>
          </View>

        </ScrollView>
        </KeyboardAvoidingView>

        {/* Native date picker — sits at the bottom like a keyboard */}
        {step === 3 && showDatePicker && (
          <View style={styles.datePickerOverlay}>
            <View style={[styles.datePickerToolbar, { backgroundColor: dark ? '#3A3A3C' : '#E5E5EA' }]}>
              <TouchableOpacity onPress={() => setShowDatePicker(false)} activeOpacity={0.7}>
                <Text style={styles.datePickerDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={
                (dobDD && dobMM && dobYYYY)
                  ? new Date(Number(dobYYYY), Number(dobMM) - 1, Number(dobDD))
                  : new Date(2000, 0, 1)
              }
              mode="date"
              display="spinner"
              maximumDate={new Date()}
              themeVariant={dark ? 'dark' : 'light'}
              onChange={(_event, date) => {
                if (date) {
                  setField('dobDD',   String(date.getDate()).padStart(2, '0'));
                  setField('dobMM',   String(date.getMonth() + 1).padStart(2, '0'));
                  setField('dobYYYY', String(date.getFullYear()));
                }
              }}
            />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:    { flex: 1 },
  dots:    { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingTop: 20, paddingBottom: 4 },
  dot:     { width: 8, height: 8, borderRadius: 4 },
  content: { padding: 32, gap: 12 },
  step:    { gap: 12 },

  title:    { fontSize: 32, fontFamily: 'JosefinSans_700Bold', letterSpacing: 2, marginBottom: 8 },
  subtitle: { fontSize: 14, fontFamily: 'JosefinSans_400Regular_Italic', marginTop: -4, marginBottom: 4 },
  label:    { fontSize: 13, fontFamily: 'JosefinSans_600SemiBold', letterSpacing: 1, marginBottom: -4 },

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
  inputInner: { flex: 1, fontSize: 16, fontFamily: 'JosefinSans_600SemiBold', paddingVertical: 10 },
  toggle:     { fontSize: 13, fontFamily: 'JosefinSans_600SemiBold', paddingHorizontal: 4 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  pill:    { borderWidth: 1.5, borderRadius: 50, paddingHorizontal: 14, paddingVertical: 8 },
  pillText:{ fontSize: 13, fontFamily: 'JosefinSans_600SemiBold' },

  strengthRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -4 },
  strengthSegment:{ flex: 1, height: 4, borderRadius: 2 },
  strengthLabel:  { fontSize: 12, fontFamily: 'JosefinSans_600SemiBold', marginLeft: 4 },

  countdown:   { fontSize: 13, fontFamily: 'JosefinSans_600SemiBold', textAlign: 'center', marginBottom: 4 },
  resendText:  { fontSize: 14, fontFamily: 'JosefinSans_400Regular_Italic', textAlign: 'center', marginTop: 4 },

  otpRow: { flexDirection: 'row', gap: 8 },
  otpBox: {
    flex: 1,
    height: 54,
    borderRadius: 14,
    fontSize: 22,
    fontFamily: 'JosefinSans_700Bold',
    borderWidth: 1.5,
  },

  fieldNote:  { fontSize: 13, fontFamily: 'JosefinSans_600SemiBold', marginTop: -4 },
  errorText:  { fontSize: 13, fontFamily: 'JosefinSans_600SemiBold', marginTop: 4 },

  atSign: { fontSize: 16, fontFamily: 'JosefinSans_600SemiBold', paddingRight: 2 },
  optionalTag: { fontSize: 11, fontFamily: 'JosefinSans_400Regular_Italic' },

  goalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  goalPill:  { borderRadius: 50, paddingHorizontal: 18, paddingVertical: 12 },
  goalText:  { fontSize: 14, fontFamily: 'JosefinSans_600SemiBold' },

  daysRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  dayPill: { flex: 1, borderRadius: 50, paddingVertical: 12, alignItems: 'center' },
  dayText: { fontSize: 12, fontFamily: 'JosefinSans_600SemiBold' },

  navRow:        { flexDirection: 'row', gap: 12, marginTop: 16 },
  navBtn:        { borderRadius: 50, paddingVertical: 20, alignItems: 'center' },
  navBtnOutline: { backgroundColor: 'transparent', borderWidth: 1.5 },
  navBtnText:    { fontSize: 18, fontFamily: 'JosefinSans_600SemiBold' },

  datePickerOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  datePickerToolbar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 10 },
  datePickerDone:    { fontSize: 17, fontFamily: 'JosefinSans_600SemiBold', color: '#007AFF' },
});
