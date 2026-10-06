import { toastDuration, toastLines } from '../toast';
import { LAYOUT, WAIT } from '@/constants/tokens';

describe('how long a toast stays: long enough to read', () => {
  it('a short toast stays the least time', () => {
    expect(toastDuration('Couldn’t like that post. Try again.', false)).toBe(WAIT.toastMin);
    expect(WAIT.toastMin).toBe(4000);
  });

  it('a second longer for each 5 words past 6', () => {
    // 11 words
    expect(toastDuration('That invite is for people new to Mahi. Ask @sam to', false)).toBe(5000);
    // 12 words
    expect(toastDuration('That invite is for people new to Mahi. Ask @sam to invite', false)).toBe(
      6000
    );
  });

  it('never longer than the most', () => {
    expect(toastDuration(Array(60).fill('word').join(' '), false)).toBe(WAIT.toastMax);
    expect(WAIT.toastMax).toBe(10000);
  });

  it('a toast with a button stays long enough to reach it', () => {
    expect(toastDuration('Couldn’t like that post.', true)).toBe(WAIT.toastAction);
    expect(WAIT.toastAction).toBe(8000);
  });

  it('extra spaces are not words', () => {
    expect(toastDuration('  Posted.   ', false)).toBe(WAIT.toastMin);
  });
});

// Design round 5 (gap 14): at the largest text sizes, 3 lines cut a toast off mid-sentence.
describe('how many lines a toast wraps to', () => {
  it('3 lines at the usual text sizes', () => {
    expect(toastLines(1)).toBe(LAYOUT.toastLines);
    expect(toastLines(1.3)).toBe(3);
  });

  it('more lines once the text is large, still a limit so it never fills the screen', () => {
    expect(toastLines(LAYOUT.largeTextScale)).toBe(LAYOUT.toastLinesLarge);
    expect(toastLines(3.1)).toBe(6);
  });
});
