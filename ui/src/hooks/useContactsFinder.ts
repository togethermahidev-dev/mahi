import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { hasNativeContacts } from '@/lib/contactsModule';

/**
 * Whether "Find your mates" shows anywhere: this build has expo-contacts (build 13+) and the
 * `contacts-finder` switch is on (on for everyone; the owner's off switch, 2026-10-07). Builds 10 to 12 get OTA updates too and never
 * show it.
 */
export function useContactsFinder(): boolean {
  const on = useFeatureFlag('contacts-finder');
  return on && hasNativeContacts();
}
