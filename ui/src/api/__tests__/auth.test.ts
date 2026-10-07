const getSession = jest.fn();
const signOut = jest.fn();
const reportError = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => getSession(...a),
      signOut: (...a: unknown[]) => signOut(...a),
    },
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
