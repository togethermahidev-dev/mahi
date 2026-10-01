import { requiredTagCount } from '../tagRules';

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
    expect(requiredTagCount({ ...rules, tagsRequired: false, inviteLinksEnabled: true }, 5)).toBe(0);
  });
});
