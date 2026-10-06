import { CAPTION_EDIT_MS, canEditPostCaption } from '@/lib/postPolicy';

describe('post caption policy', () => {
  const created = '2026-10-06T12:00:00.000Z';

  it('allows changes during the first hour', () => {
    expect(canEditPostCaption(created, Date.parse(created) + CAPTION_EDIT_MS - 1)).toBe(true);
  });

  it('ends exactly one hour after posting', () => {
    expect(canEditPostCaption(created, Date.parse(created) + CAPTION_EDIT_MS)).toBe(false);
  });
});
