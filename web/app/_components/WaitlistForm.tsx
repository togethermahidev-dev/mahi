'use client';

import { useRef, useState, type FormEvent } from 'react';

// Netlify Forms reads this form from the exported HTML at deploy time (form name "waitlist").
// With JavaScript it posts in the background and shows the result in the card; without it, the
// browser posts the form and Netlify sends the visitor to /thanks/.
const FORM_NAME = 'waitlist';

const TRAINING = [
  'Gym',
  'Running',
  'Walking',
  'Home workouts',
  'Classes',
  'Sport',
  'Just starting out',
  'Something else',
];

type Status = 'idle' | 'sending' | 'done' | 'error';

const label = 'text-f14 leading-l20 font-semi-bold text-ink-deep';
const field =
  'w-full rounded-r12 border-w1 border-off-white bg-paper px-s16 py-s14 text-f16 leading-l22 text-ink-deep ' +
  'placeholder:text-grey888 transition-colors hover:border-grey999 ' +
  'focus-visible:border-accent focus-visible:bg-white focus-visible:outline-solid focus-visible:outline-w2 ' +
  'focus-visible:outline-accent focus-visible:outline-offset-o3';
const optional = 'font-regular text-ios-grey-dark';

export function WaitlistForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [firstName, setFirstName] = useState('');
  const doneHeading = useRef<HTMLHeadingElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value === 'string') body.append(key, value);
    }

    setStatus('sending');
    try {
      const response = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!response.ok) throw new Error(`Form post failed: ${response.status}`);
      setFirstName(String(body.get('first-name') ?? '').trim());
      setStatus('done');
      requestAnimationFrame(() => doneHeading.current?.focus());
    } catch {
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <div className="flex flex-col items-start gap-s16" aria-live="polite">
        <span className="flex size-z48 items-center justify-center rounded-pill bg-accent text-white">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-i22"
            style={{ strokeWidth: 'var(--mahi-border-width-w2)' }}
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h2
          ref={doneHeading}
          tabIndex={-1}
          className="text-f24 leading-l28 font-bold text-ink-deep focus:outline-none"
        >
          You&apos;re on the list{firstName ? `, ${firstName}` : ''}
        </h2>
        <p className="text-f16 leading-l24 text-ios-grey-dark">
          Thanks for signing up. We&apos;ll email you as soon as Mahi&apos;s ready to download.
        </p>
        <p className="text-f16 leading-l24 text-ios-grey-dark">
          Mahi works best with friends. Send this site to the people you&apos;d like to train with.
        </p>
      </div>
    );
  }

  const sending = status === 'sending';

  return (
    <form
      name={FORM_NAME}
      method="POST"
      action="/thanks/"
      data-netlify="true"
      netlify-honeypot="bot-field"
      onSubmit={handleSubmit}
      className="flex flex-col gap-s20"
    >
      <input type="hidden" name="form-name" value={FORM_NAME} />
      <p className="hidden" aria-hidden="true">
        <label>
          Leave this empty: <input name="bot-field" tabIndex={-1} autoComplete="off" />
        </label>
      </p>

      <div className="flex flex-col gap-s8">
        <label htmlFor="first-name" className={label}>
          First name
        </label>
        <input
          id="first-name"
          name="first-name"
          type="text"
          required
          autoComplete="given-name"
          className={field}
        />
      </div>

      <div className="flex flex-col gap-s8">
        <label htmlFor="email" className={label}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          className={field}
        />
      </div>

      <div className="flex flex-col gap-s8">
        <label htmlFor="training" className={label}>
          How do you train? <span className={optional}>(optional)</span>
        </label>
        <div className="relative">
          <select
            id="training"
            name="training"
            defaultValue=""
            className={`${field} appearance-none pr-s48`}
          >
            <option value="">Choose one</option>
            {TRAINING.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute top-1/2 right-o16 size-i16 -translate-y-1/2 text-ios-grey-dark"
            style={{ strokeWidth: 'var(--mahi-border-width-w2)' }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      <label className="flex items-start gap-s12 text-f15 leading-l22 text-ink-deep">
        <input
          type="checkbox"
          name="early-tester"
          value="yes"
          className="mt-s1 size-i20 shrink-0 accent-ink-deep focus-visible:outline-solid focus-visible:outline-w2 focus-visible:outline-accent focus-visible:outline-offset-o3"
        />
        <span>
          I&apos;m happy to test early versions <span className={optional}>(optional)</span>
        </span>
      </label>

      {status === 'error' ? (
        <p role="alert" className="rounded-r12 bg-surface-light px-s16 py-s12 text-f15 leading-l22 text-danger-deep">
          Something went wrong and we couldn&apos;t add you. Please check your connection and try again.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={sending}
        aria-disabled={sending}
        className="mt-s4 w-full rounded-pill bg-ink-deep px-s24 py-s18 text-f17 leading-l22 font-semi-bold text-white transition-colors hover:bg-border-dark disabled:cursor-wait disabled:bg-border-dark focus-visible:outline-solid focus-visible:outline-w2 focus-visible:outline-accent focus-visible:outline-offset-o3"
      >
        {sending ? 'Adding you…' : 'Join the waitlist'}
      </button>
    </form>
  );
}
