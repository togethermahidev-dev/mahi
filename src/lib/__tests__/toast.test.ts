import { toastDuration } from '../toast';
import { WAIT } from '@/constants/tokens';

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
