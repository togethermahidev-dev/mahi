import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// Rules read from the source, each from a bug the owner found on a phone (2026-10-12). They are
// about how views sit and take touches on an iPhone, which the node-only tests can't draw.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx$/.test(name) ? [path] : [];
  });
}
const root = join(__dirname, '..', '..');
const files = sourceFiles(root).map((path) => ({
  name: path.slice(root.length + 1),
  text: readFileSync(path, 'utf8'),
}));
const tags = (text: string, tag: string) => text.match(new RegExp(`<${tag}\\b[^>]*>`, 'g')) ?? [];

describe('Apple views placed among ours', () => {
  // "There's a bigger white bar after the 2nd row" and "the writing overlaps": a SwiftUI host
  // keeps its content clear of the status bar and home bar by itself, so a grid tile or a points
  // number that scrolled under one was squashed or pushed out of place, and stayed that way.
  // Only a host that fills the screen (a sheet, a tip) keeps the phone's safe areas.
  it('ignore the safe areas unless they fill the screen', () => {
    const offenders = files
      .filter(({ text }) =>
        tags(text, 'Host').some(
          (tag) => !/ignoreSafeArea="all"/.test(tag) && !/StyleSheet\.absoluteFill/.test(tag)
        )
      )
      .map((f) => f.name);
    expect(offenders).toEqual([]);
  });
});

describe('full-screen pop-ups', () => {
  // "The screen looks like this and I can't escape": a chat opened from a profile inside a sheet
  // read the sheet's top inset (none), so its header and back button sat under the status bar.
  // A pop-up over the whole screen measures the screen itself.
  it('measure their own safe area', () => {
    const fullScreen = (tag: string) =>
      /\btransparent\b/.test(tag) && /statusBarTranslucent/.test(tag);
    // The camera's post preview only ever opens from the camera page, which is the screen.
    const onlyFromAPage = [join('screens', 'CameraScreen.tsx')];
    const offenders = files
      .filter(
        ({ name, text }) =>
          !onlyFromAPage.includes(name) &&
          tags(text, 'Modal').some(fullScreen) &&
          /useSafeAreaInsets\(/.test(text) &&
          !/<SafeAreaProvider\b/.test(text)
      )
      .map((f) => f.name);
    expect(offenders).toEqual([]);
  });
});

describe('swipes', () => {
  // "It's hard to swipe off the camera": a swipe that decides for itself (manual activation) is
  // held back by a guard the phone puts on its view. Every redraw of a screen re-sends the swipe's
  // settings, which takes that guard off and puts a new one on; mid-touch, the swipe underneath
  // then starts by itself and takes the touch from the page swipe. Built once (useMemo), its
  // settings are only sent when something it depends on changes.
  it('that decide for themselves are built once, not on every redraw', () => {
    const offenders: string[] = [];
    for (const { name, text } of files) {
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (!/\.manualActivation\(true\)/.test(line)) return;
        // Where this swipe's chain starts, and the few lines that open it.
        let start = i;
        while (start > 0 && !/Gesture\.\w+\(\)/.test(lines[start]!)) start--;
        const opening = lines.slice(Math.max(0, start - 6), start + 1).join('\n');
        if (!/use(Memo|Callback)\(/.test(opening)) offenders.push(`${name}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  // A swipe across the camera is not a tap: without a limit on how far the finger may travel, a
  // short swipe focused the camera and two in a row flipped it.
  it('are never read as taps on the camera', () => {
    const camera = files.find((f) => f.name === join('screens', 'CameraScreen.tsx'))!.text;
    const taps = camera.split('Gesture.Tap()').slice(1);
    expect(taps.length).toBeGreaterThan(0);
    const unlimited = taps
      .map((chain) => chain.split(';')[0]!)
      .filter((chain) => !/\.maxDistance\(/.test(chain))
      .map((chain) => chain.trim().split('\n')[0]);
    expect(unlimited).toEqual([]);
  });
});

describe('the emailed code', () => {
  // "If you tap off it just doesn't allow the user to tap back": sign-up had its own copy of the
  // code boxes. One field for every code, so a fix reaches all of them.
  it('has one field', () => {
    const withField = files
      .filter(({ text }) => /textContentType="oneTimeCode"/.test(text))
      .map((f) => f.name);
    expect(withField).toEqual([join('components', 'OtpCodeInput.tsx')]);
  });
});
