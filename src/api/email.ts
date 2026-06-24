/**
 * Email API
 *
 * Currently backed by Supabase Edge Functions (send-otp, check-email).
 * When the Next.js backend is ready, swap each function body to call your
 * Next.js API routes (e.g. POST /api/email/send-otp) — nothing else changes.
 */

import { env } from '@/lib/env';

const SUPABASE_URL = env.supabaseUrl;

/**
 * Send an OTP to the given email address via Resend.
 * The server generates the code and sends it — the code is NEVER passed by the client.
 */
export async function sendOtp(email: string) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? 'Failed to send OTP');
  }

  return response.json();
}

/**
 * Check whether an email address already has an account.
 * Returns { exists: boolean }.
 */
export async function checkEmail(email: string): Promise<{ exists: boolean }> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/check-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) return { exists: false };

  return response.json();
}
