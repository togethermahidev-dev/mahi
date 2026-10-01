import { parseInviteLink, normaliseInviteCode } from '@/lib/inviteLink';

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
