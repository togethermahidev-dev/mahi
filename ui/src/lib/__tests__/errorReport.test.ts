import { buildErrorReport, sentryEnvironment } from '@/lib/errorReport';

/** Shaped like supabase-js 2.x errors: real Error subclasses with extra fields. */
function supabaseError(name: string, message: string, fields: Record<string, unknown>) {
  return Object.assign(Object.assign(new Error(message), { name }), fields);
}

describe('buildErrorReport', () => {
  it('names the flow, action and database code in the title', () => {
    const raw = supabaseError('PostgrestError', 'new row violates row-level security policy', {
      code: '42501',
      details: 'Failing row contains (…)',
      hint: '',
    });
    const r = buildErrorReport(raw, { flow: 'posts', action: 'create' });
    expect(r.error.message).toBe(
      'posts.create failed: new row violates row-level security policy [code 42501]'
    );
    expect(r.error.name).toBe('PostgrestError');
    expect(r.tags).toMatchObject({ flow: 'posts', action: 'create', kind: 'database', code: '42501' });
    expect(r.context).toMatchObject({ details: 'Failing row contains (…)' });
    expect(r.level).toBe('error');
  });

  it('keeps the original error as the cause so its stack is not lost', () => {
    const raw = new TypeError("Cannot read property 'id' of undefined");
    const r = buildErrorReport(raw, { flow: 'feed', action: 'load' });
    expect((r.error as Error & { cause?: unknown }).cause).toBe(raw);
    expect(r.error.name).toBe('TypeError');
    expect(r.tags.kind).toBe('app');
  });

  it('turns a plain object or string into a readable error', () => {
    const obj = buildErrorReport({ message: 'duplicate key', code: '23505' }, { flow: 'follow', action: 'set' });
    expect(obj.error.message).toBe('follow.set failed: duplicate key [code 23505]');
    expect(obj.error.name).toBe('DatabaseError');
    expect(buildErrorReport('boom', { flow: 'x', action: 'y' }).error.message).toBe('x.y failed: boom');
    expect(buildErrorReport(undefined, { flow: 'x', action: 'y' }).error.message).toBe(
      'x.y failed: unknown error (undefined)'
    );
  });

  it('sorts auth, server function, storage and network failures', () => {
    expect(
      buildErrorReport(supabaseError('AuthApiError', 'Invalid login credentials', { status: 400, code: 'invalid_credentials' }), {
        flow: 'auth',
        action: 'signIn',
      }).tags
    ).toMatchObject({ kind: 'auth', http_status: '400', code: 'invalid_credentials' });
    expect(
      buildErrorReport(supabaseError('FunctionsHttpError', 'Edge Function returned a non-2xx status code', {}), {
        flow: 'f',
        action: 'a',
      }).tags.kind
    ).toBe('server-function');
    expect(
      buildErrorReport(supabaseError('StorageApiError', 'Payload too large', { status: 413 }), { flow: 'f', action: 'a' }).tags
        .kind
    ).toBe('storage');
    const net = buildErrorReport(new TypeError('Network request failed'), { flow: 'f', action: 'a' });
    expect(net.tags.kind).toBe('network');
    expect(net.level).toBe('warning');
  });

  it('groups by place and cause, not by ids inside the message', () => {
    const a = buildErrorReport(new Error('post 1b2c3d4e-0000-4000-8000-000000000001 not found'), { flow: 'p', action: 'open' });
    const b = buildErrorReport(new Error('post 9f8e7d6c-0000-4000-8000-000000000002 not found'), { flow: 'p', action: 'open' });
    expect(a.fingerprint).toEqual(b.fingerprint);
    expect(a.fingerprint).not.toEqual(
      buildErrorReport(new Error('post 1 not found'), { flow: 'p', action: 'other' }).fingerprint
    );
  });

  it('adds extra details but never passwords, tokens or codes typed by the person', () => {
    const r = buildErrorReport(new Error('x'), {
      flow: 'f',
      action: 'a',
      extra: { postId: 'p1', password: 'hunter2', accessToken: 't', otp: '123456' },
    });
    expect(r.context).toMatchObject({ postId: 'p1', password: '[removed]', accessToken: '[removed]', otp: '[removed]' });
  });

  it('lets the caller choose the level', () => {
    expect(buildErrorReport(new Error('x'), { flow: 'f', action: 'a', level: 'fatal' }).level).toBe('fatal');
  });
});

describe('sentryEnvironment', () => {
  it('follows the update channel, and is development on a dev machine', () => {
    expect(sentryEnvironment('preview', false)).toBe('preview');
    expect(sentryEnvironment('production', false)).toBe('production');
    expect(sentryEnvironment(null, false)).toBe('development');
    expect(sentryEnvironment('production', true)).toBe('development');
  });
});
