import type { Metadata } from 'next';
import { APP_STORE_ID, appClipBanner } from '../_lib/links';
import { InviteLanding } from './InviteLanding';

const banner = appClipBanner(APP_STORE_ID);

// Every invite link (/i/<token>) lands here when Mahi isn't installed: Netlify serves this one
// page for all of them (netlify.toml) and it reads the token from the address. With Mahi on an
// iPhone, the link opens the app instead and this page is never seen.
export const metadata: Metadata = {
  title: "You're invited to Mahi",
  robots: { index: false, follow: false },
  // Safari's App Clip banner, once Mahi has an App Store id (links.ts APP_STORE_ID).
  ...(banner ? { other: { 'apple-itunes-app': banner } } : {}),
};

export default function InvitePage() {
  return <InviteLanding />;
}
