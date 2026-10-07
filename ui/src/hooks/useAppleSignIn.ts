import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { CryptoDigestAlgorithm, digestStringAsync, getRandomBytes } from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { hasNativeAppleAuth, loadAppleAuth, type AppleAuthSdk } from '@/lib/appleAuthModule';
import { appleName, appleNonce, appleSignInError, appleSignInShown } from '@/lib/appleSignIn';
import { useSignUpStore } from '@/store';
import { Sentry, reportError } from '@/lib/sentry';
import { posthog } from '@/lib/posthog';

const NONCE_BYTES = 32;

/**
 * Sign in with Apple on the welcome screen. `shown` follows the rule in appleSignIn.ts (switch
 * `auth-apple-signin`, iPhone, build 13+, Apple says it works). `signIn` asks Apple, then signs in
 * to Supabase with the identity token and the raw nonce. A new account has no profile yet: App.tsx
 * then opens the same profile steps as an email sign-up, pre-filled with the name Apple gave.
 */
export function useAppleSignIn(): {
  shown: boolean;
  sdk: AppleAuthSdk | null;
  busy: boolean;
  error: string;
  signIn: () => Promise<void>;
} {
  const flagOn = useFeatureFlag('auth-apple-signin');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sdk = loadAppleAuth();

  useEffect(() => {
    if (!sdk) return;
    let live = true;
    sdk
      .isAvailableAsync()
      .then((ok) => live && setAvailable(ok))
      .catch((err) => {
        reportError(err, { flow: 'auth', action: 'appleAvailable', level: 'warning' });
        if (live) setAvailable(false);
      });
    return () => {
      live = false;
    };
  }, [sdk]);

  const signIn = useCallback(async () => {
    if (!sdk || busy) return;
    setError('');
    setBusy(true);
    try {
      const nonce = await appleNonce(getRandomBytes(NONCE_BYTES), (s) =>
        digestStringAsync(CryptoDigestAlgorithm.SHA256, s)
      );
      const credential = await sdk.signInAsync({
        requestedScopes: [
          sdk.AppleAuthenticationScope.FULL_NAME,
          sdk.AppleAuthenticationScope.EMAIL,
        ],
        nonce: nonce.hashed,
      });
      if (!credential.identityToken) throw new Error('Apple gave no identity token');

      // Apple gives the name on the first sign-in only. Keep it for the profile step before
      // signing in (signing in moves straight on to that step).
      const name = appleName(credential.fullName);
      if (name.firstName || name.lastName) {
        const form = useSignUpStore.getState();
        form.setField('firstName', name.firstName);
        form.setField('lastName', name.lastName);
        form.setField('displayName', name.displayName);
      }

      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: nonce.raw,
      });
      if (signInError) throw signInError;
      Sentry.addBreadcrumb({ category: 'auth', message: 'Signed in with Apple', level: 'info' });
      posthog.capture('apple_signin_completed');

      // Also kept on the account, so a closed app still has it (Supabase's own advice).
      if (name.firstName || name.lastName) {
        const { error: nameError } = await supabase.auth.updateUser({
          data: {
            full_name: name.displayName,
            given_name: name.firstName,
            family_name: name.lastName,
          },
        });
        if (nameError) {
          reportError(nameError, { flow: 'auth', action: 'appleSaveName', level: 'warning' });
        }
      }
    } catch (e) {
      const text = appleSignInError(e);
      if (text) {
        reportError(e, { flow: 'auth', action: 'appleSignIn' });
        setError(text);
      }
    } finally {
      setBusy(false);
    }
  }, [sdk, busy]);

  return {
    shown: appleSignInShown({
      flagOn,
      platform: Platform.OS,
      hasModule: hasNativeAppleAuth(),
      available,
    }),
    sdk,
    busy,
    error,
    signIn,
  };
}
