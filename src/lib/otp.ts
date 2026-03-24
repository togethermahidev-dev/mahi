import AsyncStorage from '@react-native-async-storage/async-storage';

const OTP_KEY = '@mahi:otp_state';
const OTP_EXPIRY_MS = 10 * 60 * 1000;   // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000;    // 1 minute between resends
const MAX_ATTEMPTS = 3;

// App Store review bypass — allows review team to sign up without a real email
const BYPASS_EMAIL = 'appreview@togethermahi.com';
const BYPASS_CODE = '123456';


const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

export interface OTPState {
  email: string;
  code: string;
  expiresAt: number;  // Unix ms
  attempts: number;
  sentAt: number;     // Unix ms — used for resend cooldown
}

export async function sendOTP(email: string): Promise<void> {
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  const state: OTPState = {
    email: email.toLowerCase(),
    code,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    attempts: 0,
    sentAt: Date.now(),
  };

  await AsyncStorage.setItem(OTP_KEY, JSON.stringify(state));

  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.toLowerCase(), code }),
  });

  if (!res.ok) {
    await AsyncStorage.removeItem(OTP_KEY);
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to send verification email.');
  }
}

export async function verifyOTP(
  inputCode: string,
): Promise<{ success: boolean; error?: string }> {
  const raw = await AsyncStorage.getItem(OTP_KEY);
  if (!raw) {
    return { success: false, error: 'No code found. Please request a new one.' };
  }

  const state: OTPState = JSON.parse(raw);

  // App Store review bypass
  if (state.email === BYPASS_EMAIL && inputCode === BYPASS_CODE) {
    await AsyncStorage.removeItem(OTP_KEY);
    return { success: true };
  }

  if (Date.now() > state.expiresAt) {
    await AsyncStorage.removeItem(OTP_KEY);
    return { success: false, error: 'Code expired. Please request a new one.' };
  }

  if (state.attempts >= MAX_ATTEMPTS) {
    return { success: false, error: 'Too many attempts. Please request a new code.' };
  }

  if (inputCode !== state.code) {
    await AsyncStorage.setItem(
      OTP_KEY,
      JSON.stringify({ ...state, attempts: state.attempts + 1 }),
    );
    const remaining = MAX_ATTEMPTS - (state.attempts + 1);
    return {
      success: false,
      error: `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
    };
  }

  await AsyncStorage.removeItem(OTP_KEY);
  return { success: true };
}

export async function canResend(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(OTP_KEY);
  if (!raw) return true;
  const state: OTPState = JSON.parse(raw);
  return Date.now() - state.sentAt >= RESEND_COOLDOWN_MS;
}

export async function getOTPState(): Promise<OTPState | null> {
  const raw = await AsyncStorage.getItem(OTP_KEY);
  return raw ? (JSON.parse(raw) as OTPState) : null;
}

export async function clearOTP(): Promise<void> {
  await AsyncStorage.removeItem(OTP_KEY);
}
