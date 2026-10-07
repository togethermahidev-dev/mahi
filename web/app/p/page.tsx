import type { Metadata } from 'next';
import { PostLanding } from './PostLanding';

// Every shared post link (/p/<id>) lands here when Mahi isn't installed: Netlify serves this one
// page for all of them (netlify.toml). With Mahi on an iPhone, the link opens the app instead.
export const metadata: Metadata = {
  title: 'A workout on Mahi',
  robots: { index: false, follow: false },
};

export default function PostPage() {
  return <PostLanding />;
}
