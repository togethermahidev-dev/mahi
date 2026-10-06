'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieOptions, revokeSession, supabaseAs } from '@/lib/supabase';
import { parseRole, safeNext } from '@/lib/guard';

export type SignInState = { error: string } | null;

// Signs in with Supabase Auth on the server, then keeps the session only if the account is on
// staff_users. Anyone else is signed straight back out and never gets a cookie.
export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.' };

  const { data, error } = await supabaseAs().auth.signInWithPassword({ email, password });
  if (error || !data.session) return { error: "That email and password don't match a Mahi account." };

  const token = data.session.access_token;
  const { data: role, error: roleError } = await supabaseAs(token).rpc('my_staff_role');
  if (roleError || !parseRole(role)) {
    await revokeSession(token);
    return { error: "This account isn't on the staff list." };
  }

  const jar = await cookies();
  jar.set(ACCESS_COOKIE, token, cookieOptions());
  jar.set(REFRESH_COOKIE, data.session.refresh_token, cookieOptions());
  redirect(safeNext(String(form.get('next') ?? '')));
}
