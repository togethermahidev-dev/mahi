/**
 * OTA safety: builds 10–12 have no ExtensionStorage native module (it comes with
 * @bacons/apple-targets in build 13). Without it, the hand-over is simply never there.
 */
const expoModules: Record<string, unknown> = {};
const platform = { OS: 'ios' };

jest.mock('react-native', () => ({ Platform: platform }));
jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => expoModules[name] ?? null,
}));

beforeEach(() => {
  platform.OS = 'ios';
  for (const k of Object.keys(expoModules)) delete expoModules[k];
});

function load(): typeof import('../clipHandoverModule') {
  let mod!: typeof import('../clipHandoverModule');
  jest.isolateModules(() => {
    mod = jest.requireActual('../clipHandoverModule');
  });
  return mod;
}

describe('clip hand-over loader', () => {
  it('finds nothing on a build without ExtensionStorage', () => {
    const m = load();
    expect(m.hasClipHandover()).toBe(false);
    expect(m.takeClipHandover()).toBeNull();
  });

  it('finds nothing on Android', () => {
    platform.OS = 'android';
    expoModules.ExtensionStorage = { get: jest.fn(() => 'x'), remove: jest.fn() };
    const m = load();
    expect(m.hasClipHandover()).toBe(false);
    expect(m.takeClipHandover()).toBeNull();
  });

  it('reads the saved value from the App Group and deletes it at once', () => {
    const get = jest.fn(() => '{"link":"x","savedAt":1}');
    const remove = jest.fn();
    expoModules.ExtensionStorage = { get, remove };
    const m = load();
    expect(m.takeClipHandover()).toBe('{"link":"x","savedAt":1}');
    expect(get).toHaveBeenCalledWith('mahi.clipInvite', 'group.com.mahi.app');
    expect(remove).toHaveBeenCalledWith('mahi.clipInvite', 'group.com.mahi.app');
  });

  it('treats a native call that throws as nothing saved', () => {
    expoModules.ExtensionStorage = {
      get: jest.fn(() => {
        throw new Error('no');
      }),
      remove: jest.fn(),
    };
    expect(load().takeClipHandover()).toBeNull();
  });
});
