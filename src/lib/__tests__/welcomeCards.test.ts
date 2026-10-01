import {
  WELCOME_CARDS,
  welcomeSeenKey,
  isLastCard,
  pageFromOffset,
  cardButtonLabel,
  cardPositionLabel,
} from '../welcomeCards';

describe('welcome cards', () => {
  it('has the three owner-approved cards, in order', () => {
    expect(WELCOME_CARDS.map((c) => c.title)).toEqual([
      'Post your workout every day.',
      'Every post tags 3 friends.',
      'Post to open your feed.',
    ]);
  });

  it('explains friends on card 2 and how the feed opens and locks on card 3', () => {
    expect(WELCOME_CARDS[1].body).toBe(
      'They have 48 hours to answer with a workout of their own. Friends are people who follow each other.'
    );
    expect(WELCOME_CARDS[2].body).toBe(
      'Posting opens your feed. It stays open until a friend tags you — then post your answer to open it again.'
    );
  });

  it('remembers "seen" per account', () => {
    expect(welcomeSeenKey('user-a')).toBe('@mahi:welcome_cards_seen:user-a');
    expect(welcomeSeenKey('user-a')).not.toBe(welcomeSeenKey('user-b'));
  });

  it('knows which card is last', () => {
    expect(isLastCard(0, 3)).toBe(false);
    expect(isLastCard(1, 3)).toBe(false);
    expect(isLastCard(2, 3)).toBe(true);
  });

  it('labels the button Next, then Start training on the last card', () => {
    expect(cardButtonLabel(0, 3)).toBe('Next');
    expect(cardButtonLabel(1, 3)).toBe('Next');
    expect(cardButtonLabel(2, 3)).toBe('Start training');
  });

  it('announces the position as "Card N of 3"', () => {
    expect(cardPositionLabel(0, 3)).toBe('Card 1 of 3');
    expect(cardPositionLabel(2, 3)).toBe('Card 3 of 3');
  });

  describe('pageFromOffset', () => {
    const width = 390;

    it('maps a settled scroll offset to its page', () => {
      expect(pageFromOffset(0, width, 3)).toBe(0);
      expect(pageFromOffset(390, width, 3)).toBe(1);
      expect(pageFromOffset(780, width, 3)).toBe(2);
    });

    it('rounds to the nearest page', () => {
      expect(pageFromOffset(200, width, 3)).toBe(1);
      expect(pageFromOffset(190, width, 3)).toBe(0);
    });

    it('stays inside the cards when the scroll bounces past either end', () => {
      expect(pageFromOffset(-60, width, 3)).toBe(0);
      expect(pageFromOffset(900, width, 3)).toBe(2);
    });

    it('is page 0 before the width is known', () => {
      expect(pageFromOffset(100, 0, 3)).toBe(0);
    });
  });
});
