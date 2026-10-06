import { pageActions, pageForAction, pageTitle } from '../pageActions';

// Design round 5 (gap 3): with the glass rail and no phone tab bar, Feed and Profile can only be
// left by a sideways swipe. VoiceOver and Switch Control users get a named action for each page.
describe('page actions for screen readers', () => {
  it('offers every other page, in the swipe order', () => {
    expect(pageActions('feed').map((a) => a.label)).toEqual([
      'Go to Camera',
      'Go to Profile',
      'Go to Messages',
    ]);
    expect(pageActions('camera').map((a) => a.label)).toEqual([
      'Go to Feed',
      'Go to Profile',
      'Go to Messages',
    ]);
  });

  it('never offers the page you are on', () => {
    expect(pageActions('messages').map((a) => a.label)).not.toContain('Go to Messages');
  });

  it('turns an action back into its page', () => {
    expect(pageActions('profile').map((a) => pageForAction(a.name))).toEqual([
      'camera',
      'feed',
      'messages',
    ]);
  });

  it('names the page it arrived on, for the screen reader to say', () => {
    expect(pageTitle('feed')).toBe('Feed');
    expect(pageTitle('messages')).toBe('Messages');
  });

  it('ignores actions it does not know', () => {
    expect(pageForAction('activate')).toBeNull();
    expect(pageForAction('go-settings')).toBeNull();
  });
});
