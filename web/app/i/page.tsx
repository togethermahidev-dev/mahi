import type { Metadata } from 'next';
import { InviteLanding } from './InviteLanding';

// Every invite link (/i/<token>) lands here when Mahi isn't installed: Netlify serves this one
// page for all of them (netlify.toml) and it reads the token from the address. With Mahi on an
// iPhone, the link opens the app instead and this page is never seen.
export const metadata: Metadata = {
  title: "You're invited to Mahi",
  robots: { index: false, follow: false },
};

export default function InvitePage() {
  return <InviteLanding />;
}
