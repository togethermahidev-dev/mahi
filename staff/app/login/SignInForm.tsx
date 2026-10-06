'use client';

import { useActionState } from 'react';
import { signIn, type SignInState } from './actions';
import { inputClass, primaryButtonClass } from '@/components/styles';

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, null);
  return (
    <form action={action} className="mt-s24 flex flex-col gap-s12">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-s4 text-f14 font-semi-bold">
        Email
        <input name="email" type="email" required autoComplete="email" className={inputClass} />
      </label>
      <label className="flex flex-col gap-s4 text-f14 font-semi-bold">
        Password
        <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
      </label>
      {state?.error && (
        <p role="alert" className="text-f14 text-danger-deep">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
