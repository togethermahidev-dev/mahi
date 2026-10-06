// The server-side staff check every portal page and action runs first.
// Signed in + on staff_users → allowed. Signed in but not staff → signed out (/signout).
// Not signed in → the sign-in page.

import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { ACCESS_COOKIE, supabaseAs } from './supabase';
import { accessFor, parseRole, type StaffRole } from './guard';

export type Staff = { db: SupabaseClient; user: User; role: StaffRole };

const readStaff = cache(async (): Promise<{ db: SupabaseClient; user: User | null; role: StaffRole | null }> => {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const db = supabaseAs(token);
  if (!token) return { db, user: null, role: null };
  // getUser checks the token with Supabase Auth; a forged or revoked cookie fails here.
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return { db, user: null, role: null };
  const { data: role } = await db.rpc('my_staff_role');
  return { db, user: data.user, role: parseRole(role) };
});

export async function requireStaff(): Promise<Staff> {
  const { db, user, role } = await readStaff();
  const access = accessFor({ signedIn: !!user, role });
  if (access === 'sign-in') redirect('/login');
  if (access === 'sign-out') redirect('/signout?reason=not-staff');
  return { db, user: user as User, role: role as StaffRole };
}
