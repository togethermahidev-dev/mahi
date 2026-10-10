import {
  BIO_MAX,
  bioCounter,
  bioErrorText,
  bioLength,
  bioLine,
  canSaveBio,
  cleanBio,
  countTap,
  countWords,
  draftBio,
  formatCount,
} from '@/lib/profileAbout';

// Follower and following counts and the bio on a profile (owner, 2026-10-10; switch
// `profile-bio-and-counts`). The server has the last word (set_bio, get_profile_about,
// supabase/tests/profile_bio_test.sql uses the same examples); these are the app's side.

describe('count wording', () => {
  it('says "1 follower" and "N followers"', () => {
    expect(countWords(1, 'followers')).toMatchObject({ number: '1', word: 'follower' });
    expect(countWords(0, 'followers')).toMatchObject({ number: '0', word: 'followers' });
    expect(countWords(12, 'followers')).toMatchObject({ number: '12', word: 'followers' });
  });

  it('says "N following" whatever the number', () => {
    expect(countWords(1, 'following')).toMatchObject({ number: '1', word: 'following' });
    expect(countWords(8, 'following')).toMatchObject({ number: '8', word: 'following' });
  });

  it('shows a dash, never a made-up zero, until the server has answered', () => {
    expect(countWords(null, 'followers')).toEqual({
      number: '–',
      word: 'followers',
      label: 'Followers loading',
    });
    expect(countWords(null, 'following').label).toBe('Following loading');
  });

  it('reads the whole number aloud', () => {
    expect(countWords(1, 'followers').label).toBe('1 follower');
    expect(countWords(12345, 'followers').label).toBe('12,345 followers');
    expect(countWords(3, 'following').label).toBe('3 following');
  });

  it('keeps big numbers short so the line stays one line', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1000)).toBe('1,000');
    expect(formatCount(9999)).toBe('9,999');
    expect(formatCount(10000)).toBe('10k');
    expect(formatCount(12345)).toBe('12.3k');
    // Never rounded up: 12,399 is not yet 12.4 thousand.
    expect(formatCount(12399)).toBe('12.3k');
    expect(formatCount(999999)).toBe('999.9k');
    expect(formatCount(1000000)).toBe('1m');
    expect(formatCount(2540000)).toBe('2.5m');
  });

  it('a broken number is shown as 0, not as nonsense', () => {
    expect(formatCount(-3)).toBe('0');
    expect(formatCount(Number.NaN)).toBe('0');
    expect(formatCount(4.7)).toBe('4');
  });
});

describe('what a tap on a count does', () => {
  it('your own counts always open your lists', () => {
    expect(countTap(true, null)).toBe('open');
    expect(countTap(true, false)).toBe('open');
  });

  it('someone else’s open only when the server says their lists are open to you', () => {
    expect(countTap(false, true)).toBe('open');
    expect(countTap(false, false)).toBe('none');
  });

  it('not known yet, or a server that cannot say: plain text', () => {
    expect(countTap(false, null)).toBe('none');
    expect(countTap(false, undefined)).toBe('none');
  });
});

describe('bio tidy-up (the same rules as set_bio on the server)', () => {
  it('trims, and turns line breaks and runs of spaces into one space', () => {
    expect(cleanBio('  Lifting   heavy\n\nthings\t every \r\n day  ')).toBe(
      'Lifting heavy things every day'
    );
  });

  it('other kinds of space and line break collapse too', () => {
    expect(cleanBio('a\u00A0\u2028\u3000b')).toBe('a b');
  });

  it('takes out invisible and direction-flipping characters', () => {
    expect(cleanBio('a\u200B\u202E\uFEFF\u0007b')).toBe('ab');
    expect(cleanBio('a\u0000b')).toBe('ab');
  });

  it('keeps an emoji made of joined parts whole', () => {
    const lifter = 'Lift \u{1F3CB}\uFE0F\u200D\u2640\uFE0F';
    expect(cleanBio(lifter)).toBe(lifter);
  });

  it('nothing anyone could see is no bio', () => {
    expect(cleanBio('  \n\t ')).toBe('');
    expect(cleanBio('\u200B\u200D\uFE0F \u3164')).toBe('');
    expect(cleanBio(null)).toBe('');
    expect(cleanBio(undefined)).toBe('');
  });
});

describe('bio length and the counter', () => {
  it('allows 150 characters', () => {
    expect(BIO_MAX).toBe(150);
  });

  it('counts what would be saved: spaces around it do not count', () => {
    expect(bioLength('   hello \n ')).toBe(5);
  });

  it('counts an emoji once, as the server does', () => {
    expect(bioLength('\u{1F4AA}'.repeat(150))).toBe(150);
    expect(bioLength('\u{1F4AA}')).toBe(1);
  });

  it('the counter reads N/150 and says when it is over', () => {
    expect(bioCounter('hello')).toEqual({ text: '5/150', over: false });
    expect(bioCounter('a'.repeat(150))).toEqual({ text: '150/150', over: false });
    expect(bioCounter('a'.repeat(151))).toEqual({ text: '151/150', over: true });
  });

  it('Save is for a changed bio that fits', () => {
    expect(canSaveBio('New words', null)).toBe(true);
    expect(canSaveBio('New words', 'Old words')).toBe(true);
    // Clearing a bio is a change too.
    expect(canSaveBio('', 'Old words')).toBe(true);
    expect(canSaveBio('  Old   words ', 'Old words')).toBe(false);
    expect(canSaveBio('   ', null)).toBe(false);
    expect(canSaveBio('a'.repeat(151), null)).toBe(false);
  });

  it('typing: a line break becomes a space at once, and a space at the end stays', () => {
    expect(draftBio('one\ntwo')).toBe('one two');
    expect(draftBio('one\r\ntwo ')).toBe('one two ');
  });
});

describe('which bio line a profile shows', () => {
  it('a server without bios yet: nothing, on anyone’s profile', () => {
    expect(bioLine({ supported: false, bio: null, isSelf: true })).toBe('none');
    expect(bioLine({ supported: false, bio: null, isSelf: false })).toBe('none');
  });

  it('your own: your bio, or "Add a bio"', () => {
    expect(bioLine({ supported: true, bio: 'Up at 5', isSelf: true })).toBe('show');
    expect(bioLine({ supported: true, bio: null, isSelf: true })).toBe('add');
    expect(bioLine({ supported: true, bio: '', isSelf: true })).toBe('add');
  });

  it('someone else’s: their bio, or no line at all', () => {
    expect(bioLine({ supported: true, bio: 'Up at 5', isSelf: false })).toBe('show');
    expect(bioLine({ supported: true, bio: null, isSelf: false })).toBe('none');
  });
});

describe('when saving a bio fails', () => {
  it('says the limit when the server refuses the length', () => {
    expect(bioErrorText('bio is too long: 150 characters at most')).toBe(
      'Your bio can be 150 characters at most.'
    );
  });

  it('otherwise says it could not be saved', () => {
    expect(bioErrorText('Network request failed')).toBe('Couldn’t save your bio. Try again.');
    expect(bioErrorText('not allowed')).toBe('Couldn’t save your bio. Try again.');
  });
});
