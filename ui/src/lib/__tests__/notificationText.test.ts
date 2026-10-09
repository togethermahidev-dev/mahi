import {
  notificationAction,
  notificationSections,
  notificationTarget,
  notificationText,
} from '../notificationText';

// The same words the server puts in each push (20261002190000_tag_and_feed_pushes.sql), minus
// anything that goes out of date in a list: a push says "just" and how long is left at the
// moment it is sent; the list is read later.
describe('notification list wording', () => {
  it('names who did what, in sentence case', () => {
    expect(notificationText('like', 'sam')).toBe('@sam liked your post');
    expect(notificationText('comment', 'sam')).toBe('@sam commented on your post');
    expect(notificationText('follow', 'sam')).toBe('@sam started following you');
    expect(notificationText('invite_joined', 'sam')).toBe(
      '@sam joined Mahi from your invite. You follow each other now.'
    );
  });

  // Accepting a tag request no longer makes you follow each other (owner, 2026-10-08).
  it('an in-app invite and its yes say nothing about following', () => {
    expect(notificationText('tag_invite', 'sam')).toBe('@sam wants to tag you.');
    expect(notificationText('tag_invite_accepted', 'sam')).toBe('@sam accepted your tag request.');
  });

  // A mate invite from a private account: they joined, and their follow waits for your yes.
  it('an invite joined whose follow is a request', () => {
    expect(notificationText('invite_joined', 'sam', { followRequest: true })).toBe(
      '@sam joined Mahi from your invite and wants to follow you.'
    );
    expect(notificationText('invite_joined', 'sam', { followRequest: false })).toBe(
      '@sam joined Mahi from your invite. You follow each other now.'
    );
    // The row's `follow_request` is null on a row from before the field.
    expect(notificationText('invite_joined', 'sam', { followRequest: null })).toBe(
      '@sam joined Mahi from your invite. You follow each other now.'
    );
  });

  // A mate who joined from your tag link: the row has the tag's challenge_id (core workflow 15).
  it('a join from your tag says so, by first name when known', () => {
    expect(notificationText('invite_joined', 'sam', { fromTag: true })).toBe(
      '@sam joined Mahi from your tag 🎉'
    );
    expect(
      notificationText('invite_joined', 'sam', {
        fromTag: true,
        firstName: 'Sam',
        followRequest: true,
      })
    ).toBe('Sam joined Mahi from your tag 🎉');
    expect(notificationText('invite_joined', 'sam', { fromTag: true, firstName: ' ' })).toBe(
      '@sam joined Mahi from your tag 🎉'
    );
  });

  it('a follow request and its yes match their pushes', () => {
    expect(notificationText('follow_request', 'sam')).toBe('@sam wants to follow you');
    expect(notificationText('follow_accepted', 'sam')).toBe('@sam accepted your follow request');
  });

  // Usability walkthrough 2026-10-07: a row is read later, so no "48 hours" that is out of date.
  it('a tag says who tagged you and what to do', () => {
    expect(notificationText('tag', 'sam')).toBe('@sam tagged you. Post your answer.');
  });

  it('an answered and a missed tag', () => {
    expect(notificationText('tag_answered', 'sam')).toBe('@sam answered your tag');
    expect(notificationText('tag_missed', 'sam')).toBe(
      '@sam missed your tag. Tag them in your next post to get them going again.'
    );
  });

  it('a tag you missed says points, never streak', () => {
    expect(notificationText('streak_lost', 'sam')).toBe(
      "You missed @sam's tag. Your points are back to 0."
    );
  });

  it('an unknown kind still names the person', () => {
    expect(notificationText('something_new', 'sam')).toBe('@sam');
  });
});

// Where tapping a row goes (round 3 gap 1): the row opens what it says. Who owns a post is read
// from the migrations: likes and comments are on your post, an answer is the answerer's post, a
// tag is the tagger's post.
describe('where a notification row opens', () => {
  const me = 'me-id';
  const row = (type: string, post_id: string | null = 'post-1') => ({
    type,
    actor_id: 'sam-id',
    post_id,
  });

  it('a like opens your post', () => {
    expect(notificationTarget(row('like'), me, false)).toEqual({
      to: 'post',
      ownerId: me,
      postId: 'post-1',
      comments: false,
    });
  });

  it('a comment opens your post, with its comments', () => {
    expect(notificationTarget(row('comment'), me, false)).toEqual({
      to: 'post',
      ownerId: me,
      postId: 'post-1',
      comments: true,
    });
  });

  it('an answer opens the post that answered your tag', () => {
    expect(notificationTarget(row('tag_answered'), me, false)).toEqual({
      to: 'post',
      ownerId: 'sam-id',
      postId: 'post-1',
      comments: false,
    });
  });

  it('a tag still open goes to the camera; once over, to the tagger', () => {
    expect(notificationTarget(row('tag'), me, true)).toEqual({ to: 'camera' });
    expect(notificationTarget(row('tag'), me, false)).toEqual({ to: 'profile', userId: 'sam-id' });
  });

  it.each([
    'follow',
    'tag_missed',
    'streak_lost',
    'invite_joined',
    'tag_invite',
    'tag_invite_accepted',
    'something_new',
  ])('%s opens the other person’s profile', (type) => {
    expect(notificationTarget(row(type), me, false)).toEqual({ to: 'profile', userId: 'sam-id' });
  });

  it('a tag with no post (it was a request) opens the tagger once over', () => {
    expect(notificationTarget(row('tag', null), me, false)).toEqual({
      to: 'profile',
      userId: 'sam-id',
    });
  });

  it('a post row with no post opens the other person’s profile', () => {
    expect(notificationTarget(row('like', null), me, false)).toEqual({
      to: 'profile',
      userId: 'sam-id',
    });
  });
});

describe('notification row action', () => {
  it('plainly names every supported destination', () => {
    expect(notificationAction({ to: 'post', ownerId: 'me', postId: 'p1', comments: false })).toBe(
      'View post'
    );
    expect(notificationAction({ to: 'post', ownerId: 'me', postId: 'p1', comments: true })).toBe(
      'View comments'
    );
    expect(notificationAction({ to: 'camera' })).toBe('Answer tag');
    expect(notificationAction({ to: 'profile', userId: 'sam' })).toBe('View profile');
  });
});

// Round 3 gap 2: what needs an answer comes first, then everything else, each in time order.
describe('the notification list, in two parts', () => {
  const n = (id: string) => ({ id });

  it('rows that need an answer first, under their label; then the rest', () => {
    const rows = [n('like'), n('request'), n('follow'), n('tag')];
    const needs = (r: { id: string }) => r.id === 'request' || r.id === 'tag';
    expect(notificationSections(rows, needs)).toEqual([
      { kind: 'header', title: 'Needs your answer' },
      { kind: 'row', item: n('request') },
      { kind: 'row', item: n('tag') },
      { kind: 'header', title: 'Earlier' },
      { kind: 'row', item: n('like') },
      { kind: 'row', item: n('follow') },
    ]);
  });

  it('no labels when nothing needs an answer', () => {
    expect(notificationSections([n('like'), n('follow')], () => false)).toEqual([
      { kind: 'row', item: n('like') },
      { kind: 'row', item: n('follow') },
    ]);
  });

  it('only the answer label when everything needs one', () => {
    expect(notificationSections([n('tag')], () => true)).toEqual([
      { kind: 'header', title: 'Needs your answer' },
      { kind: 'row', item: n('tag') },
    ]);
  });

  it('an empty list stays empty', () => {
    expect(notificationSections([], () => true)).toEqual([]);
  });
});
