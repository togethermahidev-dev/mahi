import {
  parseInviteLink,
  normaliseInviteCode,
  typedInvite,
  claimedText,
  claimFailText,
  claimOnReturn,
  invitePreviewLine,
} from '@/lib/inviteLink';

const TOKEN = '48bafaef17afd63e5c8c6390e2dee7f5';

describe('parseInviteLink', () => {
  it('reads the token out of a web link', () => {
    expect(parseInviteLink(`https://togethermahi.com/i/${TOKEN}`)).toBe(TOKEN);
    expect(parseInviteLink(`https://www.togethermahi.com/i/${TOKEN}`)).toBe(TOKEN);
    expect(parseInviteLink(`http://togethermahi.com/i/${TOKEN}`)).toBe(TOKEN);
  });

  it('reads it out of the app link the installed app is opened with', () => {
    expect(parseInviteLink(`mahi://i/${TOKEN}`)).toBe(TOKEN);
    expect(parseInviteLink(`mahi:///i/${TOKEN}`)).toBe(TOKEN);
  });

  it('ignores what comes after the token', () => {
    expect(parseInviteLink(`https://togethermahi.com/i/${TOKEN}?utm_source=x`)).toBe(TOKEN);
    expect(parseInviteLink(`https://togethermahi.com/i/${TOKEN}#top`)).toBe(TOKEN);
    expect(parseInviteLink(`  https://togethermahi.com/i/${TOKEN}  `)).toBe(TOKEN);
  });

  it('takes a code in the link as well as a token', () => {
    expect(parseInviteLink('https://togethermahi.com/i/9acwlh')).toBe('9ACWLH');
  });

  it('turns away anything that is not one of our links', () => {
    expect(parseInviteLink(`https://example.com/i/${TOKEN}`)).toBeNull();
    expect(parseInviteLink('https://togethermahi.com/about')).toBeNull();
    expect(parseInviteLink('https://togethermahi.com/i/')).toBeNull();
    expect(parseInviteLink(`https://togethermahi.com.evil.test/i/${TOKEN}`)).toBeNull();
    expect(parseInviteLink('mahi://camera')).toBeNull();
    expect(parseInviteLink(null)).toBeNull();
    expect(parseInviteLink('')).toBeNull();
  });

  it('turns away a link whose token is the wrong shape', () => {
    expect(parseInviteLink('https://togethermahi.com/i/abc')).toBeNull();
    expect(parseInviteLink(`https://togethermahi.com/i/${TOKEN}ff`)).toBeNull();
  });
});

describe('normaliseInviteCode', () => {
  it('forgives case, spaces and dashes', () => {
    expect(normaliseInviteCode('9acwlh')).toBe('9ACWLH');
    expect(normaliseInviteCode(' 9AC WLH ')).toBe('9ACWLH');
    expect(normaliseInviteCode('9AC-WLH')).toBe('9ACWLH');
  });

  it('rejects the wrong length and the letters we never issue', () => {
    expect(normaliseInviteCode('9ACWL')).toBeNull();
    expect(normaliseInviteCode('9ACWLHX')).toBeNull();
    expect(normaliseInviteCode('0ACWLH')).toBeNull();
    expect(normaliseInviteCode('IACWLH')).toBeNull();
    expect(normaliseInviteCode('')).toBeNull();
  });
});

// Review, 2026-10-05: the sign-up field took only a code (a pasted link was cut off), and
// joining said nothing when it didn't work.
describe('typedInvite', () => {
  it('takes a code, however it was typed', () => {
    expect(typedInvite(' abc-234 ')).toBe('ABC234');
  });

  it('takes a pasted link', () => {
    const token = 'a'.repeat(32);
    expect(typedInvite(`https://togethermahi.com/i/${token}`)).toBe(token);
  });

  it('is null for anything else', () => {
    expect(typedInvite('hello')).toBeNull();
    expect(typedInvite('')).toBeNull();
  });
});

describe('claimedText', () => {
  it('a tag that started: the 48 hours', () => {
    expect(claimedText({ inviter: 'sam', expiresAt: '2026-10-07T12:00:00Z' })).toBe(
      'You and @sam follow each other now. You have 48 hours to answer their tag.'
    );
  });

  it('no post yet: friends now, the tag starts when they post', () => {
    expect(claimedText({ inviter: 'sam', expiresAt: null })).toBe(
      'You and @sam follow each other now. Their tag starts when they post.'
    );
  });

  it('an invite for a mate, with no tag: just following each other', () => {
    expect(claimedText({ inviter: 'sam', expiresAt: null, tag: false })).toBe(
      'You and @sam follow each other now.'
    );
  });
});

describe('invitePreviewLine (said before joining)', () => {
  it('an invite for a mate: following each other, and no tag', () => {
    expect(invitePreviewLine({ open: true, tag: false })).toBe(
      'Join and you’ll automatically follow each other.'
    );
  });

  it('a tag invite: following each other, then the 48 hours', () => {
    const line =
      'Join and you’ll automatically follow each other. Their tag starts when you join — you’ll have 48 hours to post back.';
    expect(invitePreviewLine({ open: true, tag: true })).toBe(line);
    // An older server that doesn't say: as before, a tag.
    expect(invitePreviewLine({ open: true })).toBe(line);
  });

  it('a used or ended invite', () => {
    expect(invitePreviewLine({ open: false, tag: false })).toBe(
      'That invite has already been used, but you can still sign up.'
    );
  });
});

describe('claimFailText', () => {
  it('an older account: ask for an in-app invite', () => {
    expect(claimFailText('invites are for new accounts', 'sam')).toBe(
      'That invite is for people new to Mahi. Ask @sam to invite you in the app.'
    );
  });

  it('used, expired, or not a real invite', () => {
    expect(claimFailText('that invite has been used', 'sam')).toBe(
      'That invite has already been used.'
    );
    expect(claimFailText('that invite has expired', null)).toBe('That invite has expired.');
    expect(claimFailText('that invite is not valid', null)).toBe("That invite code isn't right.");
    expect(claimFailText('that invite is your own', null)).toBe("That's your own invite.");
  });

  it('anything else: a plain try-again', () => {
    expect(claimFailText('network', null)).toBe("Couldn't use that invite. Try again.");
  });
});

describe('claimOnReturn (a kept invite is tried again when Mahi comes back to the front)', () => {
  const kept = { signedIn: true, pendingToken: 'ABC234', isClaiming: false };

  it('tries again when the app comes back with an invite still kept', () => {
    expect(claimOnReturn('active', kept)).toBe(true);
  });
  it('waits for the app to be in front', () => {
    expect(claimOnReturn('background', kept)).toBe(false);
    expect(claimOnReturn('inactive', kept)).toBe(false);
  });
  it('does nothing without an invite, before sign-in, or while a claim is on its way', () => {
    expect(claimOnReturn('active', { ...kept, pendingToken: null })).toBe(false);
    expect(claimOnReturn('active', { ...kept, signedIn: false })).toBe(false);
    expect(claimOnReturn('active', { ...kept, isClaiming: true })).toBe(false);
  });
});
