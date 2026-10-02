import { symbolsAvailable, SF_SYMBOLS, sfSymbolFor } from '../sfSymbols';

describe('symbolsAvailable — iPhone AND the symbols native module in this build AND the flag', () => {
  it('is on only when all three are true', () => {
    expect(symbolsAvailable('ios', true, true)).toBe(true);
  });

  // Build 10 gets OTA updates too but has no symbols module: it must keep today's drawings.
  it('is off on a build without the native module, even with the flag on', () => {
    expect(symbolsAvailable('ios', false, true)).toBe(false);
  });

  it('is off when the flag is off', () => {
    expect(symbolsAvailable('ios', true, false)).toBe(false);
  });

  it('is off on Android and web, whatever else is true', () => {
    expect(symbolsAvailable('android', true, true)).toBe(false);
    expect(symbolsAvailable('web', true, true)).toBe(false);
  });
});

describe('SF_SYMBOLS — which Apple icon replaces each drawing', () => {
  it('maps the plain icons to their Apple equivalents', () => {
    expect(SF_SYMBOLS).toEqual({
      search: 'magnifyingglass',
      camera: 'camera',
      feed: 'text.alignleft',
      profile: 'person',
      settings: 'gearshape',
      notifications: 'bell',
      heart: 'heart',
      heartFilled: 'heart.fill',
      video: 'video',
      soundOn: 'speaker.wave.2',
      soundOff: 'speaker.slash',
      // Brand "echo" drawings (blue offset layer, like the MAHI logo) have no Apple match.
      like: null,
      comment: null,
      messages: null,
    });
  });
});

describe('sfSymbolFor — the symbol to show, or null to keep the drawing', () => {
  it('gives the symbol when symbols are available', () => {
    expect(sfSymbolFor('search', true)).toBe('magnifyingglass');
    expect(sfSymbolFor('heartFilled', true)).toBe('heart.fill');
  });

  it('keeps the drawing when symbols are not available', () => {
    expect(sfSymbolFor('search', false)).toBeNull();
    expect(sfSymbolFor('heartFilled', false)).toBeNull();
  });

  it('always keeps the brand echo drawings', () => {
    expect(sfSymbolFor('comment', true)).toBeNull();
    expect(sfSymbolFor('messages', true)).toBeNull();
    expect(sfSymbolFor('like', true)).toBeNull();
  });
});
