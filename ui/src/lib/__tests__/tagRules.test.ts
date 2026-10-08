import { cantTagReason, postTagsRequired, requiredTagCount } from '../tagRules';

describe('requiredTagCount', () => {
  const rules = { tagCount: 3, tagsRequired: true, inviteLinksEnabled: false };

  it('asks for as many friends as are available, up to the tag count', () => {
    expect(requiredTagCount(rules, 1)).toBe(1);
    expect(requiredTagCount(rules, 5)).toBe(3);
  });

  it('asks for the full tag count once invites can fill the gap', () => {
    expect(requiredTagCount({ ...rules, inviteLinksEnabled: true }, 0)).toBe(3);
  });

  it('asks for nothing when tags are not required', () => {
    expect(requiredTagCount({ ...rules, tagsRequired: false, inviteLinksEnabled: true }, 5)).toBe(
      0
    );
  });
});

describe('postTagsRequired — the first workout post needs no tags', () => {
  it('asks for nothing on your first workout, answering a tag or not', () => {
    expect(postTagsRequired(3, { firstPost: true })).toBe(0);
  });

  it('keeps the rule for every post after the first', () => {
    expect(postTagsRequired(3, { firstPost: false })).toBe(3);
  });

  it('keeps the rule while it isn’t known yet whether you have posted', () => {
    expect(postTagsRequired(3, { firstPost: null })).toBe(3);
  });
});

describe('cantTagReason — why a friend is greyed out in the tag list', () => {
  it('says nothing for a friend you can tag', () => {
    expect(cantTagReason({ has_open_tag: false })).toBeNull();
  });

  it('they tagged you: you can tag them back (Maximus, 2026-10-07)', () => {
    const friend = { has_open_tag: false, tagged_you: true };
    expect(cantTagReason(friend)).toBeNull();
  });

  it('you tagged them: says when you can tag them again', () => {
    expect(cantTagReason({ has_open_tag: true })).toBe('you tagged them, open until they answer');
  });
});
