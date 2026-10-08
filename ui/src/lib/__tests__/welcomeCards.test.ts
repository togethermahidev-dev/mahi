import {
  WELCOME_CARDS,
  welcomeSeenKey,
  isLastCard,
  pageFromOffset,
  cardButtonLabel,
  cardPositionLabel,
  welcomeInvite,
  welcomeCardsFor,
} from '../welcomeCards';

describe('welcome cards', () => {
  it('has the three owner-approved cards, in order', () => {
    expect(WELCOME_CARDS.map((c) => c.title)).toEqual([
      '1. Show up',
      '2. Get tagged',
      '3. Pass it on',
    ]);
  });

  // Design review 2026-10-05 (Q1): a newcomer read "post when a friend tags you" and waited for a
  // tag that couldn't come, so card 1 says the first post needs no tag and any workout counts,
  // and says what a miss costs.
  it('card 1: the first check-in needs no tag and any workout counts', () => {
    expect(WELCOME_CARDS[0].body).toBe(
      'Post your first workout to earn your first Mahi point and open your feed. Take a workout photo, then a selfie. Any movement counts.'
    );
  });

  it('card 2 says that answering the tag is the next post', () => {
    expect(WELCOME_CARDS[1].body).toBe(
      'After your first workout, a friend’s tag unlocks your next check-in. You have 48 hours to train. Posting the workout answers their tag.'
    );
  });

  it('card 3 makes passing accountability on the outcome', () => {
    expect(WELCOME_CARDS[2].body).toBe(
      'Choose 3 friends to hold accountable. Your answer earns a point, opens your feed and calls them to show up next. Your best always stays.'
    );
  });

  it('never says streak and never shouts', () => {
    for (const card of WELCOME_CARDS) {
      expect(`${card.title} ${card.body}`).not.toMatch(/streak|!/i);
    }
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

  // Design round 5 (gap 17): "training" says gym to a walker or a beginner.
  it('labels the button Next, then Get started on the last card', () => {
    expect(cardButtonLabel(0, 3)).toBe('Next');
    expect(cardButtonLabel(1, 3)).toBe('Next');
    expect(cardButtonLabel(2, 3)).toBe('Get started');
  });

  // Usability walkthrough 2026-10-07: Settings → Help shows the cards again; that ends on Done.
  it('the replay from Help ends on Done', () => {
    expect(cardButtonLabel(1, 3, true)).toBe('Next');
    expect(cardButtonLabel(2, 3, true)).toBe('Done');
  });

  // Usability walkthrough 2026-10-07: someone a mate tagged by link starts with who and how long.
  describe('welcomeCardsFor', () => {
    it('someone tagged by a friend: card 1 says who, and the 48 hours to answer', () => {
      const cards = welcomeCardsFor('sam');
      expect(cards[0]).toEqual({
        icon: 'camera',
        title: '1. Show up for @sam',
        body: 'They called you to train. Post any workout in the next 48 hours to answer their tag, earn your first point and open your feed.',
      });
      expect(cards.slice(1)).toEqual(WELCOME_CARDS.slice(1));
    });

    it('everyone else: the usual cards', () => {
      expect(welcomeCardsFor(null)).toEqual(WELCOME_CARDS);
    });
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

  // Design round 5 (gap 4): the friend who tapped a link sees who sent it on the first screen.
  describe('welcomeInvite', () => {
    it('says who invited you, and that any workout counts', () => {
      expect(welcomeInvite({ username: 'sam', open: true })).toEqual({
        who: '@sam invited you to Mahi',
        line: 'Join and you’ll automatically follow each other. Any workout counts.',
      });
    });

    it('says plainly when the invite has ended, and that you can still join', () => {
      expect(welcomeInvite({ username: 'sam', open: false })).toEqual({
        who: '@sam invited you to Mahi',
        line: 'That invite has ended, but you can still join.',
      });
    });

    it('shows nothing until the invite is loaded', () => {
      expect(welcomeInvite(null)).toBeNull();
    });

    it('never names the 48 hours on this screen', () => {
      for (const open of [true, false]) {
        const text = welcomeInvite({ username: 'sam', open });
        expect(`${text?.who} ${text?.line}`).not.toMatch(/48|hour/);
      }
    });
  });
});
