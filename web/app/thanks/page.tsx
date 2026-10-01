import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '../_components/SiteFooter';
import { Wordmark } from '../_components/Wordmark';

// Where the waitlist form lands when JavaScript is off (the form's action).
export const metadata: Metadata = {
  title: "You're on the list — Mahi",
};

export default function Thanks() {
  return (
    <>
      <main className="mx-auto flex max-w-z420 flex-col items-start gap-s24 px-s24 pt-s80 pb-s96">
        <Wordmark />
        <div className="mt-s8 w-full rounded-r24 border-w1 border-off-white bg-white p-s24 shadow-b12 md:p-s32">
          <h1 className="text-f24 leading-l28 font-bold text-ink-deep">You&apos;re on the list</h1>
          <p className="mt-s8 text-f16 leading-l24 text-ios-grey-dark">
            Thanks for signing up. We&apos;ll email you as soon as Mahi&apos;s ready to download.
          </p>
          <Link
            href="/"
            className="mt-s24 inline-block rounded-r4 text-f16 leading-l24 font-semi-bold text-ink-deep underline decoration-accent decoration-w2 underline-offset-o4 hover:decoration-ink-deep focus-visible:outline-solid focus-visible:outline-w2 focus-visible:outline-accent focus-visible:outline-offset-o3"
          >
            Back to Mahi
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
