import { type NextRequest, NextResponse } from 'next/server';

const IOS_STORE = 'https://apps.apple.com/gb/search?term=Mahi%20fitness';
const ANDROID_STORE = 'https://play.google.com/store/search?q=Mahi%20fitness&c=apps';

/** Universal-link fallback for people who do not have Mahi installed. */
export function GET(request: NextRequest) {
  const agent = request.headers.get('user-agent') ?? '';
  const destination = /android/i.test(agent) ? ANDROID_STORE : IOS_STORE;
  return NextResponse.redirect(destination);
}
