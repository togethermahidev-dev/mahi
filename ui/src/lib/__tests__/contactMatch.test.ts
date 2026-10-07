import { createHash } from 'crypto';
import {
  MAX_HASHES_PER_CALL,
  buildMatchPlan,
  buildRows,
  contactsAccess,
  findMatesSeenKey,
  findMatesView,
  followLabel,
  isMatchRefusal,
  matchErrorText,
  normaliseEmail,
  normalisePhone,
  showFindMatesStep,
  smsInviteUrl,
  type DeviceContact,
  type MatchedAccount,
} from '../contactMatch';

const sha256 = async (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('normalisePhone (the same rules as the server’s normalise_phone)', () => {
  it.each([
    ['07700 900111', '+447700900111'],
    ['+44 (0)7700 900111', '+447700900111'],
    ['+44 07700 900111', '+447700900111'],
    ['0044 7700 900111', '+447700900111'],
    ['447700900111', '+447700900111'],
    ['7700900111', '+447700900111'],
    ['+1 (212) 555-1234', '+12125551234'],
  ])('%s → %s', (raw, e164) => {
    expect(normalisePhone(raw)).toBe(e164);
  });

  it.each(['call me', '12345', '', null, undefined])('%p is not a number', (raw) => {
    expect(normalisePhone(raw)).toBeNull();
  });
});

describe('normaliseEmail', () => {
  it('trims and lowercases', () => {
    expect(normaliseEmail('  C@Example.com ')).toBe('c@example.com');
  });
  it.each(['', 'nope', '@x', 'x@', null])('%p is not an email', (raw) => {
    expect(normaliseEmail(raw)).toBeNull();
  });
});

const contacts: DeviceContact[] = [
  { id: '1', name: 'Bea', phones: ['07700 900111', '+44 7700 900111'], emails: [] },
  { id: '2', name: 'Cal', phones: [], emails: ['C@Example.com'] },
  { id: '3', name: 'zoe', phones: ['07700 900555'], emails: ['zoe@example.invalid'] },
  { id: '4', name: 'Al', phones: ['0044 7700 900666'], emails: [] },
  { id: '5', name: '', phones: ['07700 900777'], emails: [] },
  { id: '6', name: 'Nobody', phones: ['call me'], emails: [] },
];

describe('buildMatchPlan', () => {
  it('hashes each number and email once and remembers whose it was', async () => {
    const plan = await buildMatchPlan(contacts, sha256);
    expect(plan.hashes).toContain(
      '5c72716d8852e555b8ed05b0d1b12ed5c12c3dec8cb609dfb99b77e6c592e5cb'
    );
    expect(plan.hashes).toContain(
      '50b313b4b64bd2a2ab9305ad1965147e85239555815da6857bf532010c74b0d6'
    );
    // Bea's two ways of writing one number are one hash.
    expect(new Set(plan.hashes).size).toBe(plan.hashes.length);
    expect(plan.hashes).toHaveLength(6);
    expect(
      plan.contactIdsByHash['5c72716d8852e555b8ed05b0d1b12ed5c12c3dec8cb609dfb99b77e6c592e5cb']
    ).toEqual(['1']);
  });

  it('never sends a raw number or email', async () => {
    const plan = await buildMatchPlan(contacts, sha256);
    for (const h of plan.hashes) expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('splits into calls of at most the server’s limit', async () => {
    const many: DeviceContact[] = Array.from({ length: MAX_HASHES_PER_CALL + 5 }, (_, i) => ({
      id: String(i),
      name: `P${i}`,
      phones: [`+4477009${String(i).padStart(5, '0')}`],
      emails: [],
    }));
    const plan = await buildMatchPlan(many, async (s) => sha256(s));
    expect(plan.batches.map((b) => b.length)).toEqual([MAX_HASHES_PER_CALL, 5]);
  });
});

const account = (over: Partial<MatchedAccount> = {}): MatchedAccount => ({
  id: 'u-b',
  username: 'bea',
  display_name: 'Bea B',
  avatar_url: null,
  is_following: false,
  follows_you: false,
  matched_hashes: ['h1'],
  ...over,
});

describe('buildRows', () => {
  const contactIdsByHash = { h1: ['1'], h2: ['2'] };
  const matches = [
    account(),
    account({ id: 'u-c', username: 'cal', display_name: null, matched_hashes: ['h2'] }),
  ];

  it('puts mates on Mahi first, then everyone else with a number, A to Z, no-name last', () => {
    const rows = buildRows({ contacts, matches, contactIdsByHash, query: '' });
    expect(
      rows.map((r) =>
        r.kind === 'header'
          ? `# ${r.title}`
          : r.kind === 'account'
            ? `@${r.account.username}`
            : r.kind === 'contact'
              ? r.contact.name
              : '(none)'
      )
    ).toEqual(['# On Mahi', '@bea', '@cal', '# Invite to Mahi', 'Al', 'zoe', '07700 900777']);
  });

  it('a contact found on Mahi is not also offered an invite; one with no number can’t be texted', () => {
    const rows = buildRows({ contacts, matches, contactIdsByHash, query: '' });
    const invite = rows.flatMap((r) => (r.kind === 'contact' ? [r.contact.id] : []));
    expect(invite).not.toContain('1');
    expect(invite).not.toContain('2');
    expect(invite).not.toContain('6');
  });

  it('texts the number written the international way', () => {
    const rows = buildRows({ contacts, matches, contactIdsByHash, query: '' });
    const al = rows.find((r) => r.kind === 'contact' && r.contact.id === '4');
    expect(al?.kind === 'contact' && al.contact.phone).toBe('+447700900666');
  });

  it('says so when nobody is on Mahi yet', () => {
    const rows = buildRows({ contacts, matches: [], contactIdsByHash: {}, query: '' });
    expect(rows[0]).toEqual({ kind: 'header', key: 'h-mahi', title: 'On Mahi' });
    expect(rows[1]).toEqual({ kind: 'none', key: 'none' });
  });

  it('search narrows both lists by name, username or number', () => {
    const byName = buildRows({ contacts, matches, contactIdsByHash, query: 'ZO' });
    expect(byName.filter((r) => r.kind !== 'header')).toEqual([
      expect.objectContaining({ kind: 'contact', contact: expect.objectContaining({ id: '3' }) }),
    ]);
    const byUser = buildRows({ contacts, matches, contactIdsByHash, query: 'cal' });
    expect(byUser.filter((r) => r.kind === 'account')).toHaveLength(1);
    const byNumber = buildRows({ contacts, matches, contactIdsByHash, query: '900666' });
    expect(byNumber.filter((r) => r.kind === 'contact')).toHaveLength(1);
  });

  it('a search that finds nothing shows no headers at all', () => {
    expect(buildRows({ contacts, matches, contactIdsByHash, query: 'qqq' })).toEqual([]);
  });
});

describe('followLabel (one-way follow; friends when both)', () => {
  it.each([
    [false, false, 'Follow'],
    [false, true, 'Follow back'],
    [true, false, 'Following'],
    [true, true, 'Friends'],
  ])('following %p, follows you %p → %s', (following, followsYou, label) => {
    expect(followLabel(following, followsYou)).toBe(label);
  });
});

describe('contactsAccess', () => {
  it('reads the phone’s answer', () => {
    expect(contactsAccess({ granted: true, canAskAgain: true })).toBe('granted');
    expect(contactsAccess({ granted: false, canAskAgain: true })).toBe('ask');
    expect(contactsAccess({ granted: false, canAskAgain: false })).toBe('denied');
  });
});

describe('findMatesView', () => {
  it('waits for the phone, then asks, then loads, then shows results', () => {
    expect(findMatesView(null, 'idle')).toBe('checking');
    expect(findMatesView('ask', 'idle')).toBe('ask');
    expect(findMatesView('denied', 'idle')).toBe('denied');
    expect(findMatesView('granted', 'idle')).toBe('loading');
    expect(findMatesView('granted', 'loading')).toBe('loading');
    expect(findMatesView('granted', 'error')).toBe('error');
    expect(findMatesView('granted', 'ready')).toBe('results');
  });
});

describe('errors', () => {
  it('the hourly limit is a calm line, not a bug', () => {
    expect(isMatchRefusal('contact match: too many tries')).toBe(true);
    expect(matchErrorText('contact match: too many tries')).toBe(
      'You’ve checked a few times just now. Try again in an hour.'
    );
    expect(isMatchRefusal('network down')).toBe(false);
    expect(matchErrorText('network down')).toBe('Couldn’t check your contacts');
  });
});

describe('smsInviteUrl', () => {
  it('opens Messages to that number with the words written', () => {
    expect(smsInviteUrl('+447700900666', 'Join me & go', 'ios')).toBe(
      'sms:+447700900666&body=Join%20me%20%26%20go'
    );
    expect(smsInviteUrl('+447700900666', 'Hi', 'android')).toBe('sms:+447700900666?body=Hi');
  });
});

describe('the step after sign-up', () => {
  const now = Date.parse('2026-10-07T12:00:00Z');
  const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();

  it('shows once, to a new account, on a build and switch that have it', () => {
    expect(showFindMatesStep({ available: true, createdAt: ago(0.1), seen: false, now })).toBe(
      true
    );
    expect(showFindMatesStep({ available: true, createdAt: ago(0.1), seen: true, now })).toBe(
      false
    );
    expect(showFindMatesStep({ available: false, createdAt: ago(0.1), seen: false, now })).toBe(
      false
    );
  });

  it('never to an account that was already here (they find it in Settings and Your invites)', () => {
    expect(showFindMatesStep({ available: true, createdAt: ago(25), seen: false, now })).toBe(
      false
    );
    expect(showFindMatesStep({ available: true, createdAt: undefined, seen: false, now })).toBe(
      false
    );
  });

  it('remembers per account', () => {
    expect(findMatesSeenKey('u1')).toBe('@mahi:find_mates_seen:u1');
  });
});
