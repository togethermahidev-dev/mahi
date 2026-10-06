// Signs out: ends the Supabase session, clears the cookies, back to the sign-in page.
// POST from the "Sign out" button; GET when a page finds the person isn't staff.

import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE, revokeSession } from '@/lib/supabase';

async function signOut(request: NextRequest) {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (token) await revokeSession(token);
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = request.nextUrl.searchParams.get('reason') === 'not-staff' ? '?reason=not-staff' : '';
  const response = NextResponse.redirect(url, 303);
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
  return response;
}

export const GET = signOut;
export const POST = signOut;
