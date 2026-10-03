import { notificationText } from '../notificationText';

// The same words the server puts in each push (20261002190000_tag_and_feed_pushes.sql), minus
// anything that goes out of date in a list: a push says "just" and how long is left at the
// moment it is sent; the list is read later.
describe('notification list wording', () => {
  it('names who did what, in sentence case', () => {
    expect(notificationText('like', 'sam')).toBe('@sam liked your post');
    expect(notificationText('comment', 'sam')).toBe('@sam commented on your post');
    expect(notificationText('follow', 'sam')).toBe('@sam started following you');
    expect(notificationText('invite_joined', 'sam')).toBe('@sam joined Mahi from your invite');
  });

  it('an in-app invite and its yes match their pushes', () => {
    expect(notificationText('tag_invite', 'sam')).toBe('@sam wants to tag you');
    expect(notificationText('tag_invite_accepted', 'sam')).toBe('@sam accepted your tag');
  });

  it('a tag says who tagged you and the 48 hours', () => {
    expect(notificationText('tag', 'sam')).toBe(
      "You've been tagged by @sam. 48 hours to post your Mahi!"
    );
  });

  it('an answered and a missed tag', () => {
    expect(notificationText('tag_answered', 'sam')).toBe('@sam answered your tag');
    expect(notificationText('tag_missed', 'sam')).toBe('@sam missed your tag');
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
