/**
 * What PostHog learns about a person (docs/security.md): their account id and the app update,
 * never their email, and no city or postcode worked out from their network address.
 */
const identify = jest.fn();
const register = jest.fn(async (_props: unknown) => undefined);
jest.mock('@/lib/posthog', () => ({
  posthog: {
    ready: async () => undefined,
    getDistinctId: () => 'anon',
    getAnonymousId: () => 'anon',
    reset: jest.fn(),
    identify: (...args: unknown[]) => identify(...args),
    register: (props: unknown) => register(props),
  },
}));
jest.mock('@/lib/appBuild', () => ({ APP_BUILD: 13 }));

import { appUpdateProperties, syncAnalyticsIdentity } from '@/lib/analytics';

it('identifies a person by their account id only, never their email', async () => {
  // A signed-in Supabase user carries an email; only the id may reach PostHog.
  const user = { id: 'user-1', email: 'someone@example.com' };
  await syncAnalyticsIdentity(user);
  expect(identify).toHaveBeenCalledTimes(1);
  expect(identify.mock.calls[0][0]).toBe('user-1');
  expect(JSON.stringify(identify.mock.calls[0].slice(1))).not.toContain('someone@example.com');
});

it('every event turns off PostHog working out a city or postcode', () => {
  expect(appUpdateProperties()).toMatchObject({ $geoip_disable: true });
});

// docs/security.md: the account id only — no usernames, emails or phone numbers in PostHog events
// or Sentry breadcrumbs. Scans the source so a new call can't slip one in.
describe('no personal details in analytics or breadcrumbs', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  const roots = [path.join(__dirname, '..', '..'), path.join(__dirname, '..', '..', '..', 'App.tsx')];
  const files: string[] = [];
  const walk = (p: string) => {
    if (p.includes('__tests__')) return;
    const st = fs.statSync(p);
    if (st.isDirectory()) fs.readdirSync(p).forEach((f) => walk(path.join(p, f)));
    else if (/\.(ts|tsx)$/.test(p)) files.push(p);
  };
  roots.forEach(walk);
  // Each capture/identify/addBreadcrumb/track call, from its opening bracket to the matching close.
  const calls = files.flatMap((f) => {
    const src = fs.readFileSync(f, 'utf8');
    const found: { where: string; text: string }[] = [];
    const re = /(posthog\.(?:capture|identify)|addBreadcrumb|\btrack)\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      let depth = 0;
      let end = m.index + m[0].length - 1;
      for (; end < src.length; end++) {
        if (src[end] === '(') depth++;
        else if (src[end] === ')' && --depth === 0) break;
      }
      const line = src.slice(0, m.index).split('\n').length;
      found.push({ where: `${path.basename(f)}:${line}`, text: src.slice(m.index, end + 1) });
    }
    return found;
  });

  it('finds the calls it checks', () => {
    expect(calls.length).toBeGreaterThan(10);
  });

  it.each(['username', 'email', 'contact_number', 'phone'])('no %s', (field) => {
    // A field or variable named that way; a quoted word (e.g. method: 'email') is a value, not data.
    const named = new RegExp(`(?<!['"])\\b${field}\\b(?!['"])`);
    const bad = calls.filter((c) => named.test(c.text)).map((c) => c.where);
    expect(bad).toEqual([]);
  });
});
