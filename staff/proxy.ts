// Runs before every page (Next 16's name for middleware). Two jobs only:
//   1. No session cookies at all → the sign-in page (remembering where they were going).
//   2. The access token is about to end → swap the refresh token for a new pair, so pages always
//      see a live session. A refresh that fails clears the cookies.
// It does not decide who is staff: each page does that on the server (lib/staff.ts), against
// staff_users, and signs non-staff out.

import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieOptions, supabaseAs } from '@/lib/supabase';
import { tokenExpiresSoon } from '@/lib/guard';

const OPEN_PATHS = ['/login', '/signout'];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  const open = OPEN_PATHS.includes(pathname);

  if (!access && !refresh) {
    if (open) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (refresh && (!access || tokenExpiresSoon(access))) {
    const { data, error } = await supabaseAs().auth.refreshSession({ refresh_token: refresh });
    if (error || !data.session) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = '';
      const response = open ? NextResponse.next() : NextResponse.redirect(url);
      response.cookies.delete(ACCESS_COOKIE);
      response.cookies.delete(REFRESH_COOKIE);
      return response;
    }
    // Hand the new tokens to this request's pages and to the browser.
    request.cookies.set(ACCESS_COOKIE, data.session.access_token);
    request.cookies.set(REFRESH_COOKIE, data.session.refresh_token);
    const response = NextResponse.next({ request });
    response.cookies.set(ACCESS_COOKIE, data.session.access_token, cookieOptions());
    response.cookies.set(REFRESH_COOKIE, data.session.refresh_token, cookieOptions());
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png).*)'],
};
