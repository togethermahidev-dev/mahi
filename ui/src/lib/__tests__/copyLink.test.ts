/**
 * Copy link uses React Native's own clipboard module until build 14 brings expo-clipboard.
 * OTA safety: look for the native module first (null, never a throw), and never offer the button
 * on a build without it.
 */
const turboGet = jest.fn();
jest.mock('react-native', () => ({
  TurboModuleRegistry: { get: (name: string) => turboGet(name) },
}));

function load(): typeof import('../copyLink') {
  let mod!: typeof import('../copyLink');
  jest.isolateModules(() => {
    mod = jest.requireActual('../copyLink');
  });
  return mod;
}

beforeEach(() => {
  turboGet.mockReset();
});

describe('copy link', () => {
  it('looks for the native module by its name', () => {
    turboGet.mockReturnValue(null);
    load().canCopyLink();
    expect(turboGet).toHaveBeenCalledWith('Clipboard');
  });

  it('a build without the module: no button, and a copy does nothing', () => {
    turboGet.mockReturnValue(null);
    const m = load();
    expect(m.canCopyLink()).toBe(false);
    expect(m.copyLink('https://togethermahi.com/p/abc')).toBe(false);
  });

  it('a lookup that throws reads as no module', () => {
    turboGet.mockImplementation(() => {
      throw new Error('no registry');
    });
    const m = load();
    expect(m.canCopyLink()).toBe(false);
    expect(m.copyLink('x')).toBe(false);
  });

  it('copies the link with the module', () => {
    const setString = jest.fn();
    turboGet.mockReturnValue({ setString });
    const m = load();
    expect(m.canCopyLink()).toBe(true);
    expect(m.copyLink('https://togethermahi.com/p/abc')).toBe(true);
    expect(setString).toHaveBeenCalledWith('https://togethermahi.com/p/abc');
  });

  it('a copy that throws says it didn’t copy', () => {
    turboGet.mockReturnValue({
      setString: () => {
        throw new Error('pasteboard');
      },
    });
    expect(load().copyLink('x')).toBe(false);
  });

  it('asks the phone once, however often the sheet opens', () => {
    turboGet.mockReturnValue({ setString: jest.fn() });
    const m = load();
    m.canCopyLink();
    m.canCopyLink();
    m.copyLink('x');
    expect(turboGet).toHaveBeenCalledTimes(1);
  });
});
