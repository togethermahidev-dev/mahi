import {
  WELCOME_CARDS,
  welcomeSeenKey,
  isLastCard,
  pageFromOffset,
  cardButtonLabel,
  cardPositionLabel,
  welcomeInvite,
} from '../welcomeCards';

describe('welcome cards', () => {
  it('has the three owner-approved cards, in order', () => {
    expect(WELCOME_CARDS.map((c) => c.title)).toEqual([
      'Your first post is free.',
      'Every post tags 3 mates.',
      'Post to open your feed.',
    ]);
  });

  // Design review 2026-10-05 (Q1): a newcomer read "post when a friend tags you" and waited for a
  // tag that couldn't come, so card 1 says the first post needs no tag and any workout counts,
  // and says what a miss costs.
  it('card 1: the first post needs no tag, any workout counts, and a miss resets points', () => {
    expect(WELCOME_CARDS[0].body).toBe(
      'Post your first Mahi to get your first point and tag 3 mates. After that, you post when a friend tags you: 48 hours to answer with a photo, back camera then selfie. Any workout counts. Each answer earns a Mahi point. Miss a tag and your points go back to 0, but your best stays. Open Mahi each day to see if you’ve been tagged.'
    );
  });

  it('card 2 says friends the same way as the rest of the app', () => {
    expect(WELCOME_CARDS[1].body).toBe(
      'They have 48 hours to answer with a workout of their own. Follow each other and you can tag each other.'
    );
  });

  it('card 3: a tag in the 24 hours locks the feed when they end, not at once', () => {
    expect(WELCOME_CARDS[2].body).toBe(
      'Posting your answer opens your feed for 24 hours. Get tagged in that time and it locks when they end, until you answer.'
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
