/**
 * Identity checks API (Didit, flag `identity-verification`).
 *
 * - `createIdentitySession` asks the `didit-session` Edge Function for a Didit session token for
 *   the signed-in person (the function holds the Didit API key; the app never sees it).
 * - `getMyIdentityVerifications` reads the person's own rows of `identity_verifications`, which
 *   only the `didit-webhook` function (service role) writes. That is the real result.
 */

import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';

export type IdentitySession =
  { alreadyApproved: true } | { alreadyApproved: false; sessionId: string; sessionToken: string };

export type IdentityVerificationRow = {
  session_id: string;
  status: string;
  updated_at: string;
};

/** Start a Didit session on the server. `{ error }` carries the server's own message. */
export async function createIdentitySession(): Promise<{
  data: IdentitySession | null;
  error: Error | null;
}> {
  const { data: auth } = await supabase.auth.getSession();
  const token = auth.session?.access_token;
  if (!token) return { data: null, error: new Error('Log in again, then try again.') };

  try {
    const res = await fetch(`${env.supabaseUrl}/functions/v1/didit-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
      body: '{}',
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      alreadyApproved?: boolean;
      sessionId?: string;
      sessionToken?: string;
    };
    if (!res.ok) {
      return {
        data: null,
        error: new Error(json.error ?? 'Something went wrong. Please try again.'),
      };
    }
    if (json.alreadyApproved) return { data: { alreadyApproved: true }, error: null };
    if (!json.sessionId || !json.sessionToken) {
      return { data: null, error: new Error('Something went wrong. Please try again.') };
    }
    return {
      data: { alreadyApproved: false, sessionId: json.sessionId, sessionToken: json.sessionToken },
      error: null,
    };
  } catch {
    return { data: null, error: new Error('No connection. Check your internet and try again.') };
  }
}

/** The signed-in person's identity checks (RLS returns only their own rows). */
export async function getMyIdentityVerifications(
  userId: string
): Promise<{ data: IdentityVerificationRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('identity_verifications')
    .select('session_id, status, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) return { data: null, error: new Error(error.message) };
  return { data: (data ?? []) as IdentityVerificationRow[], error: null };
}
