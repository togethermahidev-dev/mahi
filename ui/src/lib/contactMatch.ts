/**
 * Find your mates from your contacts (owner, 2026-10-07). Pure and SDK-free so the rules are
 * unit-tested; the screen is src/components/FindMatesSheet.tsx, the native loader
 * src/lib/contactsModule.ts.
 *
 * Contacts never leave the phone as they are: each number is written the international way
 * (E.164) and each email in lower case, then hashed (SHA-256), and only the hashes go to the
 * server's match_contacts (supabase/migrations/20261007270000_contact_match.sql). The number
 * rules here are the same as the server's normalise_phone, so both sides make the same hash.
 * Contacts and matches are read fresh on every open and never kept on the phone.
 */

/** Numbers written without a country code are taken as UK numbers (the server does the same). */
export const DEFAULT_COUNTRY_CODE = '44';
/** match_contacts takes at most this many hashes a call (app_config.contact_match_max_hashes). */
export const MAX_HASHES_PER_CALL = 2000;
/** At most this many calls per look, so one look never uses up the hourly limit (10). */
export const MAX_CALLS_PER_LOOK = 3;

/** A number written as +<country><number>, or null when it isn't one. */
export function normalisePhone(
  raw: string | null | undefined,
  countryCode: string = DEFAULT_COUNTRY_CODE
): string | null {
  const text = (raw ?? '').trim();
  const digits = (raw ?? '').replace(/\(0\)/g, '').replace(/[^0-9]/g, '');
  let e: string;
  if (text.startsWith('+')) e = `+${digits}`;
  else if (digits.startsWith('00')) e = `+${digits.slice(2)}`;
  else if (digits.startsWith('0')) e = `+${countryCode}${digits.slice(1)}`;
  else if (digits.length <= 10) e = `+${countryCode}${digits}`;
  else e = `+${digits}`;
  // "+44 07700 …": the 0 people write after their own country's code.
  if (e.startsWith(`+${countryCode}0`)) e = `+${countryCode}${e.slice(countryCode.length + 2)}`;
  return /^\+[1-9][0-9]{7,14}$/.test(e) ? e : null;
}

/** An email in lower case, or null when it isn't one. */
export function normaliseEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? '').trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+$/.test(e) ? e : null;
}

/** One contact as the phone gives it: what the screen needs and nothing more. */
export interface DeviceContact {
  id: string;
  name: string;
  phones: string[];
  emails: string[];
}

/** What goes to the server, and how to find a contact again from a hash that matched. */
export interface MatchPlan {
  hashes: string[];
  batches: string[][];
  contactIdsByHash: Record<string, string[]>;
}

/** Each number and email hashed once, split into calls the server accepts. */
export async function buildMatchPlan(
  contacts: readonly DeviceContact[],
  hash: (value: string) => Promise<string>,
  countryCode: string = DEFAULT_COUNTRY_CODE
): Promise<MatchPlan> {
  const idsByValue = new Map<string, Set<string>>();
  for (const c of contacts) {
    const values = [
      ...c.phones.map((p) => normalisePhone(p, countryCode)),
      ...c.emails.map(normaliseEmail),
    ];
    for (const v of values) {
      if (!v) continue;
      const ids = idsByValue.get(v) ?? new Set<string>();
      ids.add(c.id);
      idsByValue.set(v, ids);
    }
  }
  const values = [...idsByValue.keys()].slice(0, MAX_HASHES_PER_CALL * MAX_CALLS_PER_LOOK);
  const hashes = await Promise.all(values.map((v) => hash(v)));
  const contactIdsByHash: Record<string, string[]> = {};
  hashes.forEach((h, i) => {
    contactIdsByHash[h] = [...(idsByValue.get(values[i]) ?? [])];
  });
  const batches: string[][] = [];
  for (let i = 0; i < hashes.length; i += MAX_HASHES_PER_CALL) {
    batches.push(hashes.slice(i, i + MAX_HASHES_PER_CALL));
  }
  return { hashes, batches, contactIdsByHash };
}

/** A Mahi account one of your contacts belongs to, as match_contacts hands it back. */
export interface MatchedAccount {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_following: boolean;
  follows_you: boolean;
  /** Which of the hashes you sent found them. */
  matched_hashes: string[];
}

/** Someone in your contacts to invite: their name (or number) and the number to text. */
export interface InviteContact {
  id: string;
  name: string;
  phone: string;
}

export type FindMatesRow =
  | { kind: 'header'; key: string; title: string }
  | { kind: 'account'; key: string; account: MatchedAccount; contactName: string | null }
  | { kind: 'none'; key: string }
  | { kind: 'contact'; key: string; contact: InviteContact };

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/**
 * The list: "On Mahi" (or a line saying nobody is yet), then "Invite to Mahi": everyone else with
 * a number, A to Z, contacts without a name last. A search narrows both by name, username or
 * number, and leaves out a section it empties.
 */
export function buildRows({
  contacts,
  matches,
  contactIdsByHash,
  query,
  countryCode = DEFAULT_COUNTRY_CODE,
}: {
  contacts: readonly DeviceContact[];
  matches: readonly MatchedAccount[];
  contactIdsByHash: Readonly<Record<string, string[]>>;
  query: string;
  countryCode?: string;
}): FindMatesRow[] {
  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/[^0-9]/g, '');
  const nameById = new Map(contacts.map((c) => [c.id, c.name.trim()]));

  const matchedIds = new Set<string>();
  const accounts = matches.map((account) => {
    const ids = account.matched_hashes.flatMap((h) => contactIdsByHash[h] ?? []);
    ids.forEach((id) => matchedIds.add(id));
    const contactName = ids.map((id) => nameById.get(id)).find((n) => !!n) ?? null;
    return { account, contactName };
  });

  const seen = new Set<string>();
  const invites: (InviteContact & { named: boolean; digits: string })[] = [];
  for (const c of contacts) {
    if (matchedIds.has(c.id) || seen.has(c.id)) continue;
    seen.add(c.id);
    const raw = c.phones.find((p) => normalisePhone(p, countryCode));
    const phone = raw ? normalisePhone(raw, countryCode) : null;
    if (!raw || !phone) continue;
    const name = c.name.trim();
    invites.push({
      id: c.id,
      name: name || raw.trim(),
      phone,
      named: !!name,
      digits: c.phones.map((p) => p.replace(/[^0-9]/g, '')).join(' ') + ' ' + phone,
    });
  }
  invites.sort((a, b) => (a.named === b.named ? byName(a.name, b.name) : a.named ? -1 : 1));

  const shownAccounts = q
    ? accounts.filter(
        ({ account, contactName }) =>
          account.username.toLowerCase().includes(q) ||
          (account.display_name ?? '').toLowerCase().includes(q) ||
          (contactName ?? '').toLowerCase().includes(q)
      )
    : accounts;
  const shownInvites = q
    ? invites.filter(
        (c) =>
          c.name.toLowerCase().includes(q) || (qDigits.length > 0 && c.digits.includes(qDigits))
      )
    : invites;

  const rows: FindMatesRow[] = [];
  if (!q || shownAccounts.length > 0) {
    rows.push({ kind: 'header', key: 'h-mahi', title: 'On Mahi' });
    if (shownAccounts.length === 0) rows.push({ kind: 'none', key: 'none' });
    for (const a of shownAccounts) rows.push({ kind: 'account', key: `a-${a.account.id}`, ...a });
  }
  if (shownInvites.length > 0) {
    rows.push({ kind: 'header', key: 'h-invite', title: 'Invite to Mahi' });
    for (const { id, name, phone } of shownInvites) {
      rows.push({ kind: 'contact', key: `c-${id}`, contact: { id, name, phone } });
    }
  }
  return rows;
}

/** The follow button's words. A follow is one-way; friends means you follow each other. */
export function followLabel(following: boolean, followsYou: boolean): string {
  if (following) return followsYou ? 'Friends' : 'Following';
  return followsYou ? 'Follow back' : 'Follow';
}

/** Where the phone's contacts permission is at: granted, can still be asked, or said no. */
export type ContactsAccess = 'granted' | 'ask' | 'denied';

export function contactsAccess(p: { granted: boolean; canAskAgain: boolean }): ContactsAccess {
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'ask' : 'denied';
}

export type MatchPhase = 'idle' | 'loading' | 'error' | 'ready';
export type FindMatesView = 'checking' | 'ask' | 'denied' | 'loading' | 'error' | 'results';

/** What the screen shows: the permission first, then loading, then the list (or what failed). */
export function findMatesView(access: ContactsAccess | null, phase: MatchPhase): FindMatesView {
  if (access === null) return 'checking';
  if (access !== 'granted') return access;
  if (phase === 'error') return 'error';
  if (phase === 'ready') return 'results';
  return 'loading';
}

/** True when the server's hourly limit said no (a known refusal, not a bug). */
export function isMatchRefusal(message: string): boolean {
  return message.includes('contact match: too many');
}

/** The words for a look that failed. */
export function matchErrorText(message: string): string {
  if (isMatchRefusal(message)) return 'You’ve checked a few times just now. Try again in an hour.';
  return 'Couldn’t check your contacts';
}

/** Opens Messages to one number with the invite already written. */
export function smsInviteUrl(phone: string, text: string, platform: 'ios' | 'android'): string {
  const body = encodeURIComponent(text);
  return platform === 'ios' ? `sms:${phone}&body=${body}` : `sms:${phone}?body=${body}`;
}
