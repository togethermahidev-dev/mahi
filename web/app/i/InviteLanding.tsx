'use client';

import { useEffect, useState } from 'react';
import {
  appInviteLink,
  inviteFromPath,
  inviteHeadline,
  inviteLine,
  invitePreviewRequest,
  parseInvitePreview,
  webInviteLink,
  type InvitePreview,
} from '../_lib/links';
import {
  useCountPageOpen,
  GetMahiButton,
  LandingShell,
  secondaryButton,
  usePathname,
} from '../_components/LinkLanding';

const heading = 'text-f28 leading-l38 font-bold text-ink-deep';
const body = 'text-f16 leading-l24 text-ios-grey-dark';
const stepTitle = 'text-f18 leading-l24 font-semi-bold text-ink-deep';
const stepNumber =
  'flex size-z32 shrink-0 items-center justify-center rounded-pill bg-ink-deep text-f15 leading-l20 font-bold text-white';

/**
 * Who sent the invite, read fresh each time and never kept: null until it has loaded, then the
 * preview (null inside when it couldn't be read — the page says "a friend" instead).
 */
function useInvitePreview(invite: string | null): { preview: InvitePreview } | null {
  const [loaded, setLoaded] = useState<{ invite: string; preview: InvitePreview } | null>(null);

  useEffect(() => {
    if (!invite) return;
    let live = true;
    const { url, init } = invitePreviewRequest(invite);
    fetch(url, init)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((value) => {
        if (live) setLoaded({ invite, preview: parseInvitePreview(value) });
      });
    return () => {
      live = false;
    };
  }, [invite]);

  return loaded && loaded.invite === invite ? { preview: loaded.preview } : null;
}

export function InviteLanding() {
  useCountPageOpen('invite');
  const path = usePathname();
  const invite = path === null ? null : inviteFromPath(path);
  const loaded = useInvitePreview(invite);

  // Still building the page, or the invite hasn't loaded: a quiet placeholder, never a guess.
  if (path === null || (invite && !loaded)) {
    return (
      <LandingShell>
        <div aria-busy="true" aria-label="Loading your invite" className="flex flex-col gap-s12">
          <div className="h-z38 w-full rounded-r8 bg-surface-light" />
          <div className="h-z24 w-z200 rounded-r8 bg-surface-light" />
        </div>
      </LandingShell>
    );
  }

  if (!invite) {
    return (
      <LandingShell>
        <h1 className={heading}>This invite link isn&apos;t right</h1>
        <p className={body}>
          Check you have the whole link, or ask your friend to send it again. You can still get
          Mahi.
        </p>
        <GetMahiButton />
      </LandingShell>
    );
  }

  const preview = loaded?.preview ?? null;

  if (preview && !preview.open) {
    return (
      <LandingShell>
        <h1 className={heading}>{inviteHeadline(preview)}</h1>
        <p className={body}>
          {`This invite has already been used or has run out, but you can still get Mahi. Ask @${preview.username} for a new one.`}
        </p>
        <GetMahiButton />
      </LandingShell>
    );
  }

  return (
    <LandingShell>
      <h1 className={heading}>{inviteHeadline(preview)}</h1>
      <p className="text-f16 leading-l24 font-semi-bold text-ink-deep">{inviteLine(preview)}</p>

      <ol className="mt-s8 flex flex-col gap-s24">
        <li className="flex gap-s12">
          <span aria-hidden="true" className={stepNumber}>
            1
          </span>
          <div className="flex w-full flex-col gap-s12">
            <h2 className={stepTitle}>Get Mahi</h2>
            <GetMahiButton />
          </div>
        </li>
        <li className="flex gap-s12">
          <span aria-hidden="true" className={stepNumber}>
            2
          </span>
          <div className="flex w-full flex-col gap-s12">
            <h2 className={stepTitle}>Open this link again</h2>
            <p className={body}>
              Once Mahi is on your phone, tap this invite link again and it opens in Mahi. Or copy
              it and paste it into &ldquo;Got an invite link?&rdquo; when you create your account.
            </p>
            <CopyLink link={webInviteLink(invite)} />
            <a href={appInviteLink(invite)} className={secondaryButton}>
              Open in Mahi
            </a>
          </div>
        </li>
      </ol>
    </LandingShell>
  );
}

function CopyLink({ link }: { link: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  return (
    <div className="flex flex-col gap-s8">
      <p className="rounded-r12 bg-surface-light px-s16 py-s12 text-f14 leading-l20 break-all text-ink-deep select-all">
        {link}
      </p>
      <button type="button" onClick={copy} className={secondaryButton}>
        {state === 'copied' ? 'Copied' : 'Copy link'}
      </button>
      <p aria-live="polite" className="text-f14 leading-l20 text-ios-grey-dark">
        {state === 'failed' ? "Couldn't copy. Press and hold the link above to copy it." : ''}
      </p>
    </div>
  );
}
