import { pushDestination } from '../pushRoute';

describe('where a tapped push opens', () => {
  it('a follow or an invite joined opens that person', () => {
    expect(pushDestination({ route: 'profile', user_id: 'u1' })).toBe('profile');
  });

  it('a profile push with nobody to open falls back to the notifications list', () => {
    expect(pushDestination({ route: 'profile' })).toBe('notifications');
  });

  it('a tag, a reminder and the feed-lock pushes open the camera', () => {
    expect(pushDestination({ route: 'camera' })).toBe('camera');
  });

  it('a message opens Messages', () => {
    expect(pushDestination({ route: 'conversation', conversation_id: 'c1' })).toBe('messages');
  });

  it('everything else opens the notifications list', () => {
    expect(pushDestination({ route: 'post', post_id: 'p1' })).toBe('notifications');
    expect(pushDestination({})).toBe('notifications');
  });
});
