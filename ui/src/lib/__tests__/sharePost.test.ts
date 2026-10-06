import { postShareMessage, postShareUrl } from '@/lib/postShareLink';

describe('shared post links', () => {
  it('uses the universal post route', () => {
    expect(postShareUrl('post id')).toBe('https://togethermahi.com/p/post%20id');
  });

  it('includes the link and poster in the share message', () => {
    expect(
      postShareMessage({ id: 'abc', profiles: { username: 'sam', display_name: 'Sam' } } as never)
    ).toBe('See Sam’s workout on Mahi:\nhttps://togethermahi.com/p/abc');
  });
});
