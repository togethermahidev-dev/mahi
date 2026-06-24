import AsyncStorage from '@react-native-async-storage/async-storage';
import { env } from '@/lib/env';

const OTP_KEY = '@mahi:otp_state';
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute between resends

const SUPABASE_URL = env.supabaseUrl;

/**
 * Minimal OTP state for client-side resend cooldown tracking.
 * The actual code is never stored on the client anymore — it's generated,
 * stored, and verified entirely server-side (send-otp / complete-signup).
 * The cooldown timestamp is not security-sensitive, so it stays local.
 */
export interface OTPState {
  email: string;
  sentAt: number; // Unix ms — used for resend cooldown only
}

/**
 * Send an OTP to the given email address.
 * The server generates the code, stores it securely, and emails it.
 * The client only tracks the send timestamp for cooldown purposes —
 * it never sees or stores the code.
 */
export async function sendOTP(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();

  // Call send-otp Edge Function — it generates the code server-side.
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalizedEmail }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Failed to send verification email.');
  }

  // Store only the send timestamp for cooldown purposes.
  const state: OTPState = {
    email: normalizedEmail,
    sentAt: Date.now(),
  };
  await AsyncStorage.setItem(OTP_KEY, JSON.stringify(state));
}

/**
 * Check if the user can resend the OTP (respects the 1-minute cooldown).
 */
export async function canResend(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(OTP_KEY);
  if (!raw) return true;
  const state: OTPState = JSON.parse(raw);
  return Date.now() - state.sentAt >= RESEND_COOLDOWN_MS;
}

/**
 * Get the stored OTP state (for UI to show resend status).
 */
export async function getOTPState(): Promise<OTPState | null> {
  const raw = await AsyncStorage.getItem(OTP_KEY);
  return raw ? (JSON.parse(raw) as OTPState) : null;
}

/**
 * Clear OTP state from AsyncStorage.
 */
export async function clearOTP(): Promise<void> {
  await AsyncStorage.removeItem(OTP_KEY);
}
