import { DELETE_ACCOUNT_CONFIRM, resetFormError, WEAK_PASSWORD_MESSAGE } from '../account';

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
