'use client';

import { appPostLink, postIdFromPath } from '../_lib/links';
import {
  GetMahiButton,
  LandingShell,
  secondaryButton,
  usePathname,
} from '../_components/LinkLanding';

export function PostLanding() {
  const path = usePathname();
  const postId = path === null ? null : postIdFromPath(path);

  return (
    <LandingShell>
      <h1 className="text-f28 leading-l38 font-bold text-ink-deep">See this workout on Mahi</h1>
      <p className="text-f16 leading-l24 text-ios-grey-dark">
        Workouts on Mahi open in the app. Get Mahi to post your own and keep up with your friends.
      </p>
      <GetMahiButton />
      {postId ? (
        <a href={appPostLink(postId)} className={secondaryButton}>
          Open in Mahi
        </a>
      ) : null}
    </LandingShell>
  );
}
