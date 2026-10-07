import { answerTimingLine } from '../answerTiming';

const MIN = 60;
const HOUR = 60 * MIN;
const answered = (seconds_taken: number, seconds_to_spare: number | null) => ({
  answered: { tagger_username: 'sam', seconds_taken, seconds_to_spare },
});

describe('the on-time line under a poster’s name', () => {
  it('says whose tag was answered and how fast, in whole hours', () => {
    expect(answerTimingLine(answered(2 * HOUR + 40 * MIN, 30 * HOUR))).toBe('Answered @sam in 2h');
    expect(answerTimingLine(answered(47 * HOUR, 61 * MIN))).toBe('Answered @sam in 47h');
  });

  it('under an hour, in minutes; under a minute, says so', () => {
    expect(answerTimingLine(answered(20 * MIN, 47 * HOUR))).toBe('Answered @sam in 20 min');
    expect(answerTimingLine(answered(1 * MIN, 47 * HOUR))).toBe('Answered @sam in 1 min');
    expect(answerTimingLine(answered(30, 47 * HOUR))).toBe('Answered @sam in under a minute');
  });

  it('in the last hour, says how much time was left instead', () => {
    expect(answerTimingLine(answered(47 * HOUR + 40 * MIN, 20 * MIN))).toBe(
      'Answered @sam with 20 min to spare'
    );
    expect(answerTimingLine(answered(47 * HOUR, HOUR - 1))).toBe(
      'Answered @sam with 59 min to spare'
    );
    expect(answerTimingLine(answered(48 * HOUR - 10, 10))).toBe(
      'Answered @sam with seconds to spare'
    );
  });

  it('nothing left on the clock reads as the time taken', () => {
    expect(answerTimingLine(answered(48 * HOUR, 0))).toBe('Answered @sam in 48h');
  });

  it('a first ever post that answered no one is a first Mahi', () => {
    expect(answerTimingLine({ answered: null, first_post: true })).toBe('First Mahi');
  });

  it('a first post that answered a tag names the friend', () => {
    expect(answerTimingLine({ ...answered(2 * HOUR, 46 * HOUR), first_post: true })).toBe(
      'Answered @sam in 2h'
    );
  });

  it('any other post has no line', () => {
    expect(answerTimingLine({ answered: null, first_post: false })).toBeNull();
    expect(answerTimingLine({})).toBeNull();
  });

  it('a server without the new fields still names the friend and the time from the old one', () => {
    expect(answerTimingLine({ response: { tagger_username: 'ali', seconds: 3 * HOUR } })).toBe(
      'Answered @ali in 3h'
    );
    expect(
      answerTimingLine({
        response: { tagger_username: 'ali', seconds: 3 * HOUR },
        ...answered(HOUR, 20 * MIN),
      })
    ).toBe('Answered @sam with 20 min to spare');
  });
});
