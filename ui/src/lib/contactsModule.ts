/**
 * The phone's contacts (expo-contacts), loaded only when this build has them.
 *
 * expo-contacts ships in build 13. OTA updates also reach builds 10 to 12, which don't have it;
 * requiring the package there throws at load (it calls requireNativeModule('ExpoContactsNext')
 * and, for its old API, requireNativeModule('ExpoContacts') at the top level). So nothing imports
 * it at the top level: `loadContacts()` checks for both native modules first and only then
 * requires the package. No module = no "Find friends in your contacts" anywhere. Same pattern as expoUiModule.ts.
 * Tested in src/lib/__tests__/nativeLoaders.test.ts.
 */
import { requireOptionalNativeModule } from 'expo';
import type * as ContactsPackage from 'expo-contacts';
import type { DeviceContact } from '@/lib/contactMatch';

export type ContactsSdk = typeof ContactsPackage;

let nativePresent: boolean | undefined;
let loaded: ContactsSdk | null | undefined;

/** True on a build that has expo-contacts' native modules. */
export function hasNativeContacts(): boolean {
  if (nativePresent === undefined) {
    try {
      nativePresent =
        requireOptionalNativeModule('ExpoContactsNext') != null &&
        requireOptionalNativeModule('ExpoContacts') != null;
    } catch {
      nativePresent = false;
    }
  }
  return nativePresent;
}

/** expo-contacts, or null without it. Required once, on first use. */
export function loadContacts(): ContactsSdk | null {
  if (loaded !== undefined) return loaded;
  if (!hasNativeContacts()) {
    loaded = null;
    return loaded;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('expo-contacts') as ContactsSdk;
  } catch {
    loaded = null;
  }
  return loaded;
}

/**
 * Every contact's name, numbers and emails, read fresh from the phone each time (never kept).
 * Null without the module; throws when the phone refuses (the caller reports it).
 */
export async function readDeviceContacts(): Promise<DeviceContact[] | null> {
  const sdk = loadContacts();
  if (!sdk) return null;
  const { ContactField } = sdk;
  const rows = await sdk.Contact.getAllDetails([
    ContactField.GIVEN_NAME,
    ContactField.FAMILY_NAME,
    ContactField.FULL_NAME,
    ContactField.PHONES,
    ContactField.EMAILS,
  ] as const);
  return rows.map((r) => ({
    id: r.id,
    name: r.fullName?.trim() || [r.givenName, r.familyName].filter(Boolean).join(' ').trim() || '',
    phones: (r.phones ?? []).flatMap((p) => (p.number ? [p.number] : [])),
    emails: (r.emails ?? []).flatMap((e) => (e.address ? [e.address] : [])),
  }));
}
