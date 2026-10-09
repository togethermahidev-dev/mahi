import { pendingInvites, replyingTo, replyingToText } from '../postPeople';

// Core workflow step 21 (owner, 2026-10-09): the post shows who you're replying to,
// "Replying to @joe, @sam.", from the server's answered_taggers, oldest first.
describe('replyingTo — whose tags a post answered', () => {
  it('lists every tag the post answered, oldest first, with their ids for the profile link', () => {
    expect(
      replyingTo({
        answered_taggers: [
          { user_id: 'u1', username: 'joe' },
          { user_id: 'u2', username: 'sam' },
        ],
      })
    ).toEqual([
      { user_id: 'u1', username: 'joe' },
      { user_id: 'u2', username: 'sam' },
    ]);
  });

  it('names each person once', () => {
    expect(
      replyingTo({
        answered_taggers: [
          { user_id: 'u1', username: 'joe' },
          { user_id: 'u1', username: 'joe' },
        ],
      })
    ).toEqual([{ user_id: 'u1', username: 'joe' }]);
  });

  it('an older server: the single answered tag, with no id to link', () => {
    expect(
      replyingTo({
        answered: { tagger_username: 'sam' },
      })
    ).toEqual([{ user_id: null, username: 'sam' }]);
    expect(replyingTo({ response: { tagger_username: 'ali' } })).toEqual([
      { user_id: null, username: 'ali' },
    ]);
  });

  it('an empty list from a new server falls back to the older fields', () => {
    expect(
      replyingTo({
        answered_taggers: [],
        answered: { tagger_username: 'sam' },
      })
    ).toEqual([{ user_id: null, username: 'sam' }]);
  });

  it('nothing answered: no one', () => {
    expect(replyingTo({})).toEqual([]);
    expect(replyingTo({ answered_taggers: [], answered: null, response: null })).toEqual([]);
    // answered: null on the new server means "answered nothing", even if response is set.
    expect(replyingTo({ answered: null, response: { tagger_username: 'x' } })).toEqual([]);
  });
});

describe('replyingToText — the line as one string (VoiceOver)', () => {
  it('reads as the owner wrote it', () => {
    expect(replyingToText(['joe', 'sam'])).toBe('Replying to @joe, @sam.');
    expect(replyingToText(['joe'])).toBe('Replying to @joe.');
  });

  it('nothing to say with no one', () => {
    expect(replyingToText([])).toBeNull();
  });
});

// Step 13 on the post: link invites nobody has joined from yet show as grey initials circles.
describe('pendingInvites — the grey "Invited ⏳" circles', () => {
  it('keeps the initials the server sent, or none', () => {
    expect(pendingInvites({ pending_invites: [{ initials: 'SL' }, { initials: null }] })).toEqual([
      { key: 'invite-0', initials: 'SL' },
      { key: 'invite-1', initials: null },
    ]);
  });

  it('a missing field (older server) is no invites', () => {
    expect(pendingInvites({})).toEqual([]);
    expect(pendingInvites({ pending_invites: null })).toEqual([]);
  });

  it('blank initials draw a plain circle', () => {
    expect(pendingInvites({ pending_invites: [{ initials: '  ' }] })).toEqual([
      { key: 'invite-0', initials: null },
    ]);
  });
});
