import {
  authErrorText,
  DELETE_ACCOUNT_CONFIRM,
  PASSWORD_CHANGED_NOTICE,
  resetFormError,
  WEAK_PASSWORD_MESSAGE,
} from '../account';

describe('resetFormError (new password step)', () => {
  it('asks for the whole code first', () => {
    expect(resetFormError({ code: '', password: 'Abcdef1!' })).toBe('Enter the 6-digit code.');
    expect(resetFormError({ code: '12345', password: 'Abcdef1!' })).toBe('Enter the 6-digit code.');
  });

  it('uses the sign-up strength rule for the new password', () => {
    expect(resetFormError({ code: '123456', password: '' })).toBe(WEAK_PASSWORD_MESSAGE);
    expect(resetFormError({ code: '123456', password: 'Abcdefgh' })).toBe(WEAK_PASSWORD_MESSAGE);
    expect(resetFormError({ code: '123456', password: 'Abcdefg1' })).toBeNull();
  });

  it('says the same thing the server says about a weak password', () => {
    expect(WEAK_PASSWORD_MESSAGE).toBe(
      'Use 8 or more characters with two of: a capital letter, a number, a symbol.'
    );
  });
});

describe('DELETE_ACCOUNT_CONFIRM', () => {
  it('says plainly what goes and that it cannot be undone', () => {
    const { message } = DELETE_ACCOUNT_CONFIRM;
    for (const word of ['profile', 'posts', 'photos', 'messages', 'points']) {
      expect(message).toContain(word);
    }
    expect(message).toMatch(/can.t be undone/);
  });

  it('names the action on the button, in sentence case', () => {
    expect(DELETE_ACCOUNT_CONFIRM.confirm).toBe('Delete account');
    expect(DELETE_ACCOUNT_CONFIRM.title).toBe('Delete your account?');
  });
});

describe('authErrorText (log in, reset and sign up never show raw server text)', () => {
  it('says plainly when the email and password do not match, with reset only when it exists', () => {
    expect(authErrorText('Invalid login credentials', 'login', { canReset: true })).toBe(
      'That email and password don’t match. Check them, or reset your password.'
    );
    expect(authErrorText('Invalid login credentials', 'login')).toBe(
      'That email and password don’t match. Check them and try again.'
    );
  });

  it('blames the connection, not the person, when the network fails', () => {
    for (const raw of [
      'Network request failed',
      'TypeError: Failed to fetch',
      'No connection. Check your internet and try again.',
    ]) {
      expect(authErrorText(raw, 'login')).toBe(
        'Couldn’t reach Mahi. Check your connection and try again.'
      );
    }
  });

  it('turns a bad or old code into one next step', () => {
    for (const raw of [
      'Invalid or expired code',
      'Your code has expired. Go back and ask for a new one.',
    ]) {
      expect(authErrorText(raw, 'check-code')).toBe(
        'That code didn’t work or has run out. Check the latest email, or send a new one.'
      );
    }
  });

  it('keeps the known, already-plain answers in the app’s words', () => {
    expect(authErrorText('Please wait a minute before asking for another code.', 'send-code')).toBe(
      'Wait a minute before asking for another code.'
    );
    expect(authErrorText('Too many codes requested. Please try again later.', 'send-code')).toBe(
      'Too many tries. Wait a while, then try again.'
    );
    expect(authErrorText('This email already has an account. Log in instead.', 'create')).toBe(
      'That email already has an account. Log in instead.'
    );
    expect(authErrorText('Valid email required', 'send-code')).toBe('Enter a valid email.');
    expect(
      authErrorText(
        'Use 8 or more characters with two of: a capital letter, a number, a symbol.',
        'reset'
      )
    ).toBe(WEAK_PASSWORD_MESSAGE);
  });

  it('never passes unknown server text through', () => {
    const raw = 'Profile save failed: duplicate key value violates unique constraint';
    expect(authErrorText(raw, 'create')).toBe('Couldn’t create your account. Try again.');
    expect(authErrorText(undefined, 'login')).toBe('Couldn’t log you in. Try again.');
    expect(authErrorText('Method not allowed', 'send-code')).toBe(
      'Couldn’t send the code. Try again.'
    );
    expect(authErrorText('', 'check-code')).toBe('Couldn’t check the code. Try again.');
    expect(authErrorText('boom', 'reset')).toBe('Couldn’t change your password. Try again.');
  });
});

describe('PASSWORD_CHANGED_NOTICE', () => {
  it('reads as good news with the next step', () => {
    expect(PASSWORD_CHANGED_NOTICE).toBe(
      'Your password is changed. Log in with your new password.'
    );
  });
});
