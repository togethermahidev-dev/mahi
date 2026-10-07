import { answeredStamp, answeredMorph } from '../answerStamp';

describe('the "Answered" stamp (design research, 2026-10-07)', () => {
  it('names the friend whose tag the post answers', () => {
    expect(answeredStamp(['sam'])).toBe('Answered @sam');
  });
  it('counts the others when one post answers several tags', () => {
    expect(answeredStamp(['sam', 'jo'])).toBe('Answered @sam and 1 more');
    expect(answeredStamp(['sam', 'jo', 'al'])).toBe('Answered @sam and 2 more');
  });
  it('has no stamp for a post that answers nothing', () => {
    expect(answeredStamp([])).toBeNull();
  });
});

describe('answeredMorph: Apple’s glass morph on iOS 26 with @expo/ui, our spring elsewhere', () => {
  it('morphs on an iPhone with Liquid Glass and @expo/ui', () => {
    expect(answeredMorph({ glass: true, expoUiPresent: true, reduceMotion: false })).toBe('glass');
  });
  it('springs without glass or @expo/ui, and fades with Reduce Motion', () => {
    expect(answeredMorph({ glass: false, expoUiPresent: true, reduceMotion: false })).toBe(
      'spring'
    );
    expect(answeredMorph({ glass: true, expoUiPresent: false, reduceMotion: false })).toBe(
      'spring'
    );
    expect(answeredMorph({ glass: true, expoUiPresent: true, reduceMotion: true })).toBe('fade');
  });
});
