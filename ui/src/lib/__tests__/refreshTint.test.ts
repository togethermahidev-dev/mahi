import { refreshTint, themeColors } from '@/lib/themeColors';

describe('pull-to-refresh spinner', () => {
  it.each([false, true])('is the muted text colour on every list (dark: %s)', (dark) => {
    const { muted, bg } = themeColors(dark);
    expect(refreshTint(dark)).toEqual({
      tintColor: muted,
      colors: [muted],
      progressBackgroundColor: bg,
    });
  });
});
