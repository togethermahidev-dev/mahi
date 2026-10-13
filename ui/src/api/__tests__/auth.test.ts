const getSession = jest.fn();
const signOut = jest.fn();
const reportError = jest.fn();
const rpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => getSession(...a),
      signOut: (...a: unknown[]) => signOut(...a),
    },
    rpc: (...a: unknown[]) => rpc(...a),
  },
}));
jest.mock('@/lib/env', () => ({ env: { supabaseUrl: 'https://x.test', supabaseAnonKey: 'anon' } }));
jest.mock('@/lib/sentry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
jest.mock('@/api/push', () => ({ unregisterPushToken: jest.fn() }));

import { deleteAccount, saveAppleToken } from '@/api/auth';

const fetchMock = jest.fn();
beforeAll(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
});
beforeEach(() => {
  fetchMock.mockReset();
  reportError.mockReset();
  signOut.mockReset().mockResolvedValue({ error: null });
  rpc.mockReset().mockResolvedValue({ error: null });
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'tok' } } });
});

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('saveAppleToken', () => {
  it("sends Apple's code to apple-token as the signed-in person", async () => {
    fetchMock.mockResolvedValue(reply(200, { saved: true }));
    await saveAppleToken('apple-code');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://x.test/functions/v1/apple-token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok', apikey: 'anon' }),
        body: JSON.stringify({ code: 'apple-code' }),
      })
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  it('a refusal is reported as a warning and never thrown', async () => {
    fetchMock.mockResolvedValue(reply(503, { error: 'not set up' }));
    await expect(saveAppleToken('apple-code')).resolves.toBeUndefined();
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ flow: 'auth', action: 'appleSaveToken', level: 'warning' })
    );
  });

  it('no connection is reported as a warning and never thrown', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(saveAppleToken('apple-code')).resolves.toBeUndefined();
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('no code or no session: nothing is sent', async () => {
    await saveAppleToken(null);
    getSession.mockResolvedValue({ data: { session: null } });
    await saveAppleToken('apple-code');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('deleteAccount and Apple', () => {
  it.each(['revoked', 'skip', undefined])('apple %s: deleted, nothing reported', async (apple) => {
    fetchMock.mockResolvedValue(reply(200, { deleted: true, apple }));
    expect(await deleteAccount()).toEqual({ error: null });
    expect(reportError).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it.each(['failed', 'not_configured'])('apple %s: still deleted, reported', async (apple) => {
    fetchMock.mockResolvedValue(reply(200, { deleted: true, apple }));
    expect(await deleteAccount()).toEqual({ error: null });
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ flow: 'account', action: 'appleRevoke', level: 'warning' })
    );
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it("a refused deletion keeps the server's words and doesn't sign out", async () => {
    fetchMock.mockResolvedValue(
      reply(500, { error: 'Couldn’t delete your photos. Please try again.' })
    );
    expect((await deleteAccount()).error?.message).toBe(
      'Couldn’t delete your photos. Please try again.'
    );
    expect(signOut).not.toHaveBeenCalled();
  });
});

// Owner, 2026-10-13: a reason on the way out. It waits with the account on the server and is
// kept, with nothing that says who, once the account is gone.
describe('deleteAccount with a reason', () => {
  it('leaves the reason with the account first, then deletes', async () => {
    fetchMock.mockResolvedValue(reply(200, { deleted: true }));
    expect(await deleteAccount({ reason: 'other', note: 'It got boring' })).toEqual({
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith('set_account_deletion_reason', {
      p_reason: 'other',
      p_note: 'It got boring',
    });
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://x.test/functions/v1/delete-account',
      expect.objectContaining({ method: 'POST' })
    );
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('a reason the server refuses never stops the deletion: reported as a warning', async () => {
    rpc.mockResolvedValue({ error: { message: 'unknown reason', code: '22023' } });
    fetchMock.mockResolvedValue(reply(200, { deleted: true }));
    expect(await deleteAccount({ reason: 'privacy', note: null })).toEqual({ error: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ flow: 'account', action: 'setDeletionReason', level: 'warning' })
    );
  });

  it('nor does a lost connection while leaving it', async () => {
    rpc.mockRejectedValue(new Error('offline'));
    fetchMock.mockResolvedValue(reply(200, { deleted: true }));
    expect(await deleteAccount({ reason: 'privacy', note: null })).toEqual({ error: null });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('with no reason (the one-step pop-up) nothing is left: the account is just deleted', async () => {
    fetchMock.mockResolvedValue(reply(200, { deleted: true }));
    expect(await deleteAccount()).toEqual({ error: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('signed out: nothing is sent at all', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    expect((await deleteAccount({ reason: 'privacy', note: null })).error?.message).toBe(
      'Log in again, then try again.'
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
