/**
 * Email API
 *
 * Currently backed by Supabase Edge Functions (send-otp, check-email).
 * When the Next.js backend is ready, swap each function body to call your
 * Next.js API routes (e.g. POST /api/email/send-otp) — nothing else changes.
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

/** Send a 6-digit OTP to the given email address via Resend. */
export async function sendOtp(email: string, code: string) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
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
