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
  await syncAnalyticsIdentity({ id: 'user-1', email: 'someone@example.com' });
  expect(identify).toHaveBeenCalledTimes(1);
  expect(identify.mock.calls[0][0]).toBe('user-1');
  expect(JSON.stringify(identify.mock.calls[0].slice(1))).not.toContain('someone@example.com');
});

it('every event turns off PostHog working out a city or postcode', () => {
  expect(appUpdateProperties()).toMatchObject({ $geoip_disable: true });
});
