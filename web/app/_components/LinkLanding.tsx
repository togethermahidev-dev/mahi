'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { storeFor } from '../_lib/links';
import { Wordmark } from './Wordmark';

// Shared parts of the pages an invite or post link falls back to when Mahi isn't installed.

const noSubscribe = () => () => {};

/** The page's own path, read in the browser; null while the static page is being built. */
export function usePathname(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => window.location.pathname,
    () => null
  );
}

/** The store for this phone, once the browser has said what phone it is. */
function useStore(): { name: string; url: string } {
  const agent = useSyncExternalStore(
    noSubscribe,
    () => navigator.userAgent,
    () => ''
  );
  return storeFor(agent);
}

const focus =
  'focus-visible:outline-solid focus-visible:outline-w2 focus-visible:outline-accent focus-visible:outline-offset-o3';

export const primaryButton =
  'inline-block w-full rounded-pill bg-ink-deep px-s24 py-s18 text-center text-f17 leading-l22 font-semi-bold text-white transition-colors hover:bg-border-dark ' +
  focus;

export const secondaryButton =
  'inline-block w-full rounded-pill border-w1 border-off-white bg-paper px-s24 py-s16 text-center text-f16 leading-l22 font-semi-bold text-ink-deep transition-colors hover:border-grey999 ' +
  focus;

export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-z420 flex-col items-start gap-s24 px-s24 pt-s80 pb-s96">
      <Wordmark />
      <div className="mt-s8 flex w-full flex-col gap-s16 rounded-r24 border-w1 border-off-white bg-white p-s24 shadow-b12 md:p-s32">
        {children}
      </div>
    </main>
  );
}

export function GetMahiButton() {
  const store = useStore();
  return (
    <a href={store.url} className={primaryButton}>
      Get Mahi on {store.name}
    </a>
  );
}
