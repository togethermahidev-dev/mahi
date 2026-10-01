import PostHog from 'posthog-react-native';
import { env } from '@/lib/env';

export const posthog = new PostHog(env.posthogKey ?? '', {
  host: env.posthogHost,
});
