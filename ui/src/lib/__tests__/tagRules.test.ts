import { cantTagReason, requiredTagCount } from '../tagRules';

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

describe('cantTagReason — why a friend is greyed out in the tag list', () => {
  it('says nothing for a friend you can tag', () => {
    expect(cantTagReason({ has_open_tag: false })).toBeNull();
    expect(cantTagReason({ has_open_tag: false, tagged_you: false })).toBeNull();
  });

  it('they tagged you: you cannot tag back', () => {
    expect(cantTagReason({ has_open_tag: true, tagged_you: true })).toBe(
      'tagged you, can’t tag back'
    );
  });

  it('you tagged them: says when you can tag them again', () => {
    expect(cantTagReason({ has_open_tag: true })).toBe('you tagged them, open until they answer');
  });
});
