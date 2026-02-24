import PostHog from 'posthog-react-native';

console.log('[PostHog] Initialising — host:', process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com');

export const posthog = new PostHog(process.env.EXPO_PUBLIC_POSTHOG_API_KEY!, {
  host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
});
