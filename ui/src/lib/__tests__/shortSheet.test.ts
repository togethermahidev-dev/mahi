import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { shortSheetKind } from '../shortSheet';

// A short sheet at the bottom of the screen (Invite a friend, an invite to accept, a caption).
// Owner, 2026-10-10, on Invite a friend: "The sheet have like a weird overlay does it use the
// native sheet?" It did not: the grey layer was part of the sheet and slid up with it.
describe('which short sheet shows', () => {
  it("is the phone's own sheet where the sheet asks for it, the switch is on and the build has it", () => {
    expect(shortSheetKind({ wantsNative: true, switchOn: true, hasNative: true })).toBe('native');
  });

  it('is our own sheet on a build without it (build 10, Android)', () => {
    expect(shortSheetKind({ wantsNative: true, switchOn: true, hasNative: false })).toBe('ours');
  });

  it('is our own sheet with the switch off', () => {
    expect(shortSheetKind({ wantsNative: true, switchOn: false, hasNative: true })).toBe('ours');
  });

  // A sheet with a text field, or the invite to accept, stays ours until it is proven on a phone.
  it("is our own sheet where the sheet has not asked for the phone's", () => {
    expect(shortSheetKind({ wantsNative: false, switchOn: true, hasNative: true })).toBe('ours');
  });
});

describe('our own short sheets', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
      return /\.tsx$/.test(name) ? [path] : [];
    });
  }
  const root = join(__dirname, '..', '..');

  // A see-through Modal that slides carries its grey layer up with it. Every short sheet goes
  // through ShortSheet, where the grey fades in on its own and only the card slides.
  it('never slide their grey layer up with the sheet', () => {
    const slides = (tag: string) =>
      /\btransparent\b/.test(tag) && /animationType="slide"/.test(tag);
    const offenders = sourceFiles(root)
      .filter((f) => (readFileSync(f, 'utf8').match(/<Modal\b[^>]*>/g) ?? []).some(slides))
      .map((f) => f.slice(root.length + 1));
    expect(offenders).toEqual([]);
  });
});
