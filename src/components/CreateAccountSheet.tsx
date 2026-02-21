import React, { useState, useRef, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ScrollView, useColorScheme, TextInput as RNTextInput,
} from 'react-native';

const GOALS = ['Lose weight', 'Build muscle', 'Improve endurance', 'Flexibility', 'General fitness', 'Sports performance'];

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onAuthComplete: () => void;
}

export default function CreateAccountSheet({ visible, onDismiss, onAuthComplete }: Props): React.JSX.Element {
  const dark = useColorScheme() === 'dark';
  const bg      = dark ? '#1C1C19' : '#FFFFFF';
  const text    = dark ? '#FFFFFF' : '#0F0F0D';
  const inputBg = dark ? '#2A2A27' : '#F5F5F0';
  const muted   = dark ? '#888' : '#999';
  const green   = dark ? '#5DB075' : '#2D7A4F';
  const red     = dark ? '#E06060' : '#C03030';

  const [step, setStep] = useState(1);

  // Step 1
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone]             = useState('');
  const [dobDD, setDobDD]             = useState('');
  const [dobMM, setDobMM]             = useState('');
  const [dobYYYY, setDobYYYY]         = useState('');

  // Step 2 — OTP
  const [otp, setOtp]               = useState(['', '', '', '']);
  const [confirmOtp, setConfirmOtp] = useState(['', '', '', '']);
  const otpRefs        = useRef<(RNTextInput | null)[]>([null, null, null, null]);
  const confirmOtpRefs = useRef<(RNTextInput | null)[]>([null, null, null, null]);

  // Step 3
  const [firstName, setFirstName]   = useState('');
  const [lastName, setLastName]     = useState('');
  const [username, setUsername]     = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'available' | 'taken'>('idle');
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 4
  const [goals, setGoals] = useState<string[]>([]);

  useEffect(() => {
    if (!username) { setUsernameStatus('idle'); return; }
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    usernameTimer.current = setTimeout(() => {
      setUsernameStatus(username.length % 2 === 0 ? 'taken' : 'available');
    }, 500);
  }, [username]);

  const handleOtp = (
    val: string,
    i: number,
    arr: string[],
    setArr: (a: string[]) => void,
    refs: React.MutableRefObject<(RNTextInput | null)[]>,
  ) => {
    const next = [...arr];
    next[i] = val.slice(-1);
    setArr(next);
    if (val && i < 3) refs.current[i + 1]?.focus();
  };

  const toggleGoal = (g: string) =>
    setGoals(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);

  // Reset state when sheet is closed
  const handleDismiss = () => {
    setStep(1);
    onDismiss();
  };

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
            <View key={n} style={[styles.dot, { backgroundColor: text, opacity: step === n ? 1 : 0.2 }]} />
          ))}
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Step 1 ── */}
          {step === 1 && (
            <View style={styles.step}>
              <Text style={[styles.title, { color: text }]}>Create account</Text>

              <Text style={[styles.label, { color: muted }]}>Email</Text>
              <TextInput style={[styles.input, { backgroundColor: inputBg, color: text }]}
                value={email} onChangeText={setEmail}
                placeholder="your@email.com" placeholderTextColor={muted}
                keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />

              <Text style={[styles.label, { color: muted }]}>Password</Text>
              <View style={[styles.inputRow, { backgroundColor: inputBg }]}>
                <TextInput style={[styles.inputInner, { color: text }]}
                  value={password} onChangeText={setPassword}
                  placeholder="••••••••" placeholderTextColor={muted}
                  secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} />
                <TouchableOpacity onPress={() => setShowPassword(p => !p)} activeOpacity={0.7}>
                  <Text style={[styles.toggle, { color: muted }]}>{showPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.label, { color: muted }]}>Phone number</Text>
              <TextInput style={[styles.input, { backgroundColor: inputBg, color: text }]}
                value={phone} onChangeText={setPhone}
                placeholder="+44 7700 000000" placeholderTextColor={muted}
                keyboardType="phone-pad" />

              <Text style={[styles.label, { color: muted }]}>Date of birth</Text>
              <View style={styles.dobRow}>
                {[
                  { val: dobDD, set: setDobDD, ph: 'DD', max: 2 },
                  { val: dobMM, set: setDobMM, ph: 'MM', max: 2 },
                  { val: dobYYYY, set: setDobYYYY, ph: 'YYYY', max: 4 },
                ].map(({ val, set, ph, max }) => (
                  <TextInput key={ph}
                    style={[styles.dobInput, { backgroundColor: inputBg, color: text, flex: max === 4 ? 2 : 1 }]}
                    value={val} onChangeText={set}
                    placeholder={ph} placeholderTextColor={muted}
                    keyboardType="number-pad" maxLength={max} />
                ))}
              </View>
            </View>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <View style={styles.step}>
              <Text style={[styles.title, { color: text }]}>Verify</Text>
              <Text style={[styles.subtitle, { color: muted }]}>Enter the OTP sent to your email</Text>

              <Text style={[styles.label, { color: muted }]}>OTP</Text>
              <View style={styles.otpRow}>
                {otp.map((val, i) => (
                  <TextInput key={i}
                    ref={r => { otpRefs.current[i] = r; }}
                    style={[styles.otpBox, { backgroundColor: inputBg, color: text, borderColor: val ? text : 'transparent' }]}
                    value={val}
                    onChangeText={v => handleOtp(v, i, otp, setOtp, otpRefs)}
                    keyboardType="number-pad" maxLength={1} textAlign="center" />
                ))}
              </View>

              <Text style={[styles.label, { color: muted }]}>Confirm OTP</Text>
              <View style={styles.otpRow}>
                {confirmOtp.map((val, i) => (
                  <TextInput key={i}
                    ref={r => { confirmOtpRefs.current[i] = r; }}
                    style={[styles.otpBox, { backgroundColor: inputBg, color: text, borderColor: val ? text : 'transparent' }]}
                    value={val}
                    onChangeText={v => handleOtp(v, i, confirmOtp, setConfirmOtp, confirmOtpRefs)}
                    keyboardType="number-pad" maxLength={1} textAlign="center" />
                ))}
              </View>
            </View>
          )}

          {/* ── Step 3 ── */}
          {step === 3 && (
            <View style={styles.step}>
              <Text style={[styles.title, { color: text }]}>About you</Text>

              <Text style={[styles.label, { color: muted }]}>First name</Text>
              <TextInput style={[styles.input, { backgroundColor: inputBg, color: text }]}
                value={firstName} onChangeText={setFirstName}
                placeholder="Jane" placeholderTextColor={muted} />

              <Text style={[styles.label, { color: muted }]}>Last name</Text>
              <TextInput style={[styles.input, { backgroundColor: inputBg, color: text }]}
                value={lastName} onChangeText={setLastName}
                placeholder="Smith" placeholderTextColor={muted} />

              <Text style={[styles.label, { color: muted }]}>Username</Text>
              <TextInput style={[styles.input, { backgroundColor: inputBg, color: text }]}
                value={username} onChangeText={setUsername}
                placeholder="@janesmith" placeholderTextColor={muted}
                autoCapitalize="none" autoCorrect={false} />
              {usernameStatus !== 'idle' && (
                <Text style={[styles.usernameStatus, { color: usernameStatus === 'available' ? green : red }]}>
                  {usernameStatus === 'available' ? '✓ Available' : '✗ Already taken'}
                </Text>
              )}
            </View>
          )}

          {/* ── Step 4 ── */}
          {step === 4 && (
            <View style={styles.step}>
              <Text style={[styles.title, { color: text }]}>Your goals</Text>
              <Text style={[styles.subtitle, { color: muted }]}>Select all that apply</Text>
              <View style={styles.goalsGrid}>
                {GOALS.map(g => {
                  const selected = goals.includes(g);
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
            </View>
          )}

          {/* Navigation */}
          <View style={styles.navRow}>
            {step > 1 && (
              <TouchableOpacity
                style={[styles.navBtn, styles.navBtnOutline, { borderColor: text, flex: 1 }]}
                onPress={() => setStep(s => s - 1)}
                activeOpacity={0.8}
              >
                <Text style={[styles.navBtnText, { color: text }]}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.navBtn, { backgroundColor: text, flex: step > 1 ? 2 : 1 }]}
              onPress={() => step < 4 ? setStep(s => s + 1) : onAuthComplete()}
              activeOpacity={0.8}
            >
              <Text style={[styles.navBtnText, { color: bg }]}>
                {step === 4 ? 'Create account' : 'Next'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingTop: 20, paddingBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  content: { padding: 32, gap: 12 },
  step: { gap: 12 },
  title: { fontSize: 32, fontFamily: 'JosefinSans_700Bold', letterSpacing: 4, marginBottom: 8 },
  subtitle: { fontSize: 14, fontFamily: 'JosefinSans_400Regular_Italic', marginTop: -4, marginBottom: 4 },
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
  inputInner: { flex: 1, fontSize: 16, fontFamily: 'JosefinSans_600SemiBold', paddingVertical: 10 },
  toggle: { fontSize: 13, fontFamily: 'JosefinSans_600SemiBold', paddingHorizontal: 4 },
  dobRow: { flexDirection: 'row', gap: 8 },
  dobInput: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'JosefinSans_600SemiBold',
    textAlign: 'center',
  },
  otpRow: { flexDirection: 'row', gap: 12 },
  otpBox: {
    flex: 1,
    height: 60,
    borderRadius: 14,
    fontSize: 24,
    fontFamily: 'JosefinSans_700Bold',
    borderWidth: 1.5,
  },
  usernameStatus: { fontSize: 13, fontFamily: 'JosefinSans_600SemiBold', marginTop: -4 },
  goalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  goalPill: { borderRadius: 50, paddingHorizontal: 18, paddingVertical: 12 },
  goalText: { fontSize: 14, fontFamily: 'JosefinSans_600SemiBold' },
  navRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  navBtn: { borderRadius: 50, paddingVertical: 20, alignItems: 'center' },
  navBtnOutline: { backgroundColor: 'transparent', borderWidth: 1.5 },
  navBtnText: { fontSize: 16, fontFamily: 'JosefinSans_600SemiBold' },
});
