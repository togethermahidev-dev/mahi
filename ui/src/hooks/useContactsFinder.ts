import { hasNativeContacts } from '@/lib/contactsModule';

/**
 * Whether "Find your mates" shows anywhere: this build has expo-contacts (build 13+). No switch
 * (owner, 2026-10-07): on for everyone on the build. Builds 10 to 12 get OTA updates too and never
 * show it.
 */
export function useContactsFinder(): boolean {
  return hasNativeContacts();
}
