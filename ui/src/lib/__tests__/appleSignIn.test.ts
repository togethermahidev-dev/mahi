import { createHash, randomBytes } from 'crypto';
import {
  appleName,
  appleNonce,
  appleSignInError,
  appleSignInShown,
  isAppleUser,
  profileStep,
} from '../appleSignIn';

const sha256 = async (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('appleSignInShown (when the Apple button is on the welcome screen)', () => {
  const on = { flagOn: true, platform: 'ios', hasModule: true, available: true };

  it('shows on an iPhone with the module, Apple sign-in available and the switch on', () => {
    expect(appleSignInShown(on)).toBe(true);
  });

  it('is hidden when the owner turns the switch off', () => {
    expect(appleSignInShown({ ...on, flagOn: false })).toBe(false);
  });

  it('is hidden on builds 10 to 12, which lack the module', () => {
    expect(appleSignInShown({ ...on, hasModule: false })).toBe(false);
  });

  it('is hidden on Android and the web', () => {
    expect(appleSignInShown({ ...on, platform: 'android' })).toBe(false);
    expect(appleSignInShown({ ...on, platform: 'web' })).toBe(false);
  });

  it('is hidden until the phone says Apple sign-in works, and when it says no', () => {
    expect(appleSignInShown({ ...on, available: null })).toBe(false);
    expect(appleSignInShown({ ...on, available: false })).toBe(false);
  });
});

describe('appleNonce', () => {
  it('sends Apple the SHA-256 of the raw nonce, and keeps the raw one for Supabase', async () => {
    const { raw, hashed } = await appleNonce(new Uint8Array(randomBytes(32)), sha256);
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).toBe(createHash('sha256').update(raw).digest('hex'));
    expect(hashed).not.toBe(raw);
  });

  it('is different each time it gets different bytes', async () => {
    const a = await appleNonce(new Uint8Array(32).fill(1), sha256);
    const b = await appleNonce(new Uint8Array(32).fill(2), sha256);
    expect(a.raw).not.toBe(b.raw);
  });

  it('refuses too few random bytes', async () => {
    await expect(appleNonce(new Uint8Array(8), sha256)).rejects.toThrow();
  });
});

describe('appleSignInError', () => {
  it('says nothing when the person cancels', () => {
    expect(appleSignInError({ code: 'ERR_REQUEST_CANCELED' })).toBeNull();
  });

  it('gives the connection message for a lost connection', () => {
    expect(appleSignInError(new Error('Network request failed'))).toBe(
      'Couldn’t reach Mahi. Check your connection and try again.'
    );
  });

  it('gives one plain message for anything else, never the raw error', () => {
    const text = appleSignInError(new Error('Unacceptable audience in id_token'));
    expect(text).toBe('Couldn’t sign you in with Apple. Try again, or use your email.');
    expect(appleSignInError({ code: 'ERR_REQUEST_FAILED' })).toBe(text);
    expect(appleSignInError(null)).toBe(text);
  });
});

describe('appleName (the name Apple gives on the first sign-in only)', () => {
  it('splits into first, last and display name', () => {
    expect(appleName({ givenName: ' Sam ', familyName: 'Lee', middleName: null })).toEqual({
      firstName: 'Sam',
      lastName: 'Lee',
      displayName: 'Sam Lee',
    });
  });

  it('copes with a missing part or no name at all', () => {
    expect(appleName({ givenName: 'Sam', familyName: null })).toEqual({
      firstName: 'Sam',
      lastName: '',
      displayName: 'Sam',
    });
    expect(appleName(null)).toEqual({ firstName: '', lastName: '', displayName: '' });
  });

  it('reads the copy kept on the account (user metadata) the same way', () => {
    expect(appleName({ given_name: 'Sam', family_name: 'Lee' })).toEqual({
      firstName: 'Sam',
      lastName: 'Lee',
      displayName: 'Sam Lee',
    });
  });
});

describe('isAppleUser', () => {
  it('is true for an account made or linked with Apple', () => {
    expect(isAppleUser({ app_metadata: { provider: 'apple' } })).toBe(true);
    expect(
      isAppleUser({ app_metadata: { provider: 'email', providers: ['email', 'apple'] } })
    ).toBe(true);
  });

  it('is false for an email account or no account', () => {
    expect(isAppleUser({ app_metadata: { provider: 'email', providers: ['email'] } })).toBe(false);
    expect(isAppleUser({ app_metadata: {} })).toBe(false);
    expect(isAppleUser(null)).toBe(false);
  });
});

describe('profileStep (an Apple account with no profile yet goes through the profile steps)', () => {
  it('waits while the profile is loading, so the camera never flashes up first', () => {
    expect(profileStep({ apple: true, status: 'loading', hasProfile: false })).toBe('wait');
  });

  it('asks for the profile when an Apple account has none', () => {
    expect(profileStep({ apple: true, status: 'missing', hasProfile: false })).toBe('profile');
  });

  it('goes into the app once the profile is saved', () => {
    expect(profileStep({ apple: true, status: 'missing', hasProfile: true })).toBe('app');
    expect(profileStep({ apple: true, status: 'present', hasProfile: true })).toBe('app');
  });

  it('never blocks on a failed profile read', () => {
    expect(profileStep({ apple: true, status: 'error', hasProfile: false })).toBe('app');
  });

  it('leaves email accounts exactly as today (their sheet saves the profile itself)', () => {
    expect(profileStep({ apple: false, status: 'loading', hasProfile: false })).toBe('app');
    expect(profileStep({ apple: false, status: 'missing', hasProfile: false })).toBe('app');
  });
});
