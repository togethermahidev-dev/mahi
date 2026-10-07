/**
 * OTA safety: build 10 (and any build without these native modules) gets OTA updates too.
 * Requiring @didit-protocol/sdk-react-native there throws at load (getEnforcing), so the loaders
 * must check for the native module first and never require the package when it's missing.
 */
const turboGet = jest.fn();
const nativeModules: Record<string, unknown> = {};
const diditRequired = jest.fn();
const purchasesRequired = jest.fn();
const purchasesUiRequired = jest.fn();
const screensRequired = jest.fn();
const widgetsRequired = jest.fn();
const expoModules: Record<string, unknown> = {};
const platform = { OS: 'ios' };
const optionalGet = jest.fn();
const contactsRequired = jest.fn();

jest.mock('react-native', () => ({
  TurboModuleRegistry: { get: (name: string) => turboGet(name) },
  NativeModules: nativeModules,
  Platform: platform,
}));
jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => expoModules[name] ?? optionalGet(name) ?? null,
}));
jest.mock('../../widgets/liveTagWidgets', () => {
  widgetsRequired();
  return { tagWidget: {}, tagActivity: {} };
});
jest.mock('expo-contacts', () => {
  contactsRequired();
  return { getPermissionsAsync: jest.fn() };
});
jest.mock('@didit-protocol/sdk-react-native', () => {
  diditRequired();
  return { startVerification: jest.fn() };
});
jest.mock('react-native-purchases', () => {
  purchasesRequired();
  return { __esModule: true, default: { configure: jest.fn() } };
});
jest.mock('react-native-screens', () => {
  screensRequired();
  return { Tabs: { Host: jest.fn(), Screen: jest.fn() } };
});
jest.mock('react-native-purchases-ui', () => {
  purchasesUiRequired();
  return { __esModule: true, default: { presentPaywall: jest.fn() } };
});

beforeEach(() => {
  jest.resetModules();
  turboGet.mockReset();
  diditRequired.mockReset();
  purchasesRequired.mockReset();
  purchasesUiRequired.mockReset();
  screensRequired.mockReset();
  widgetsRequired.mockReset();
  platform.OS = 'ios';
  optionalGet.mockReset();
  contactsRequired.mockReset();
  for (const k of Object.keys(nativeModules)) delete nativeModules[k];
  for (const k of Object.keys(expoModules)) delete expoModules[k];
});

function loadDiditModule(): typeof import('../diditModule') {
  let mod!: typeof import('../diditModule');
  jest.isolateModules(() => {
    mod = jest.requireActual('../diditModule');
  });
  return mod;
}

function loadPurchasesModule(): typeof import('../purchasesModule') {
  let mod!: typeof import('../purchasesModule');
  jest.isolateModules(() => {
    mod = jest.requireActual('../purchasesModule');
  });
  return mod;
}

describe('Didit loader', () => {
  it('looks for the TurboModule by its native name', () => {
    turboGet.mockReturnValue(null);
    loadDiditModule().hasNativeDidit();
    expect(turboGet).toHaveBeenCalledWith('SdkReactNative');
  });

  it('never requires the package on a build without the module', () => {
    turboGet.mockReturnValue(null);
    const m = loadDiditModule();
    expect(m.hasNativeDidit()).toBe(false);
    expect(m.loadDidit()).toBeNull();
    expect(diditRequired).not.toHaveBeenCalled();
  });

  it('treats a lookup that throws as missing', () => {
    turboGet.mockImplementation(() => {
      throw new Error('no');
    });
    const m = loadDiditModule();
    expect(m.hasNativeDidit()).toBe(false);
    expect(m.loadDidit()).toBeNull();
    expect(diditRequired).not.toHaveBeenCalled();
  });

  it('requires the package once when the module is there', () => {
    turboGet.mockReturnValue({});
    const m = loadDiditModule();
    expect(m.loadDidit()).not.toBeNull();
    m.loadDidit();
    expect(diditRequired).toHaveBeenCalledTimes(1);
  });
});

describe('RevenueCat loader', () => {
  it('never requires either package on a build without RNPurchases', () => {
    const m = loadPurchasesModule();
    expect(m.hasNativePurchases()).toBe(false);
    expect(m.loadPurchases()).toBeNull();
    expect(m.loadPurchasesUi()).toBeNull();
    expect(purchasesRequired).not.toHaveBeenCalled();
    expect(purchasesUiRequired).not.toHaveBeenCalled();
  });

  it('requires react-native-purchases when RNPurchases is there', () => {
    nativeModules.RNPurchases = {};
    const m = loadPurchasesModule();
    expect(m.loadPurchases()).not.toBeNull();
    expect(purchasesRequired).toHaveBeenCalledTimes(1);
  });

  it('loads the paywall UI only when RNPaywalls is there too', () => {
    nativeModules.RNPurchases = {};
    expect(loadPurchasesModule().loadPurchasesUi()).toBeNull();
    expect(purchasesUiRequired).not.toHaveBeenCalled();

    nativeModules.RNPaywalls = {};
    expect(loadPurchasesModule().loadPurchasesUi()).not.toBeNull();
    expect(purchasesUiRequired).toHaveBeenCalledTimes(1);
  });
});

describe('react-native-screens loader (native tab bar)', () => {
  function loadScreensModule(): typeof import('../screensModule') {
    let mod!: typeof import('../screensModule');
    jest.isolateModules(() => {
      mod = jest.requireActual('../screensModule');
    });
    return mod;
  }

  it('looks for the TurboModule by its native name', () => {
    turboGet.mockReturnValue(null);
    loadScreensModule().hasNativeScreens();
    expect(turboGet).toHaveBeenCalledWith('RNSModule');
  });

  it('never requires the package on a build without the module', () => {
    turboGet.mockReturnValue(null);
    const m = loadScreensModule();
    expect(m.hasNativeScreens()).toBe(false);
    expect(m.loadScreens()).toBeNull();
    expect(screensRequired).not.toHaveBeenCalled();
  });

  it('treats a lookup that throws as missing', () => {
    turboGet.mockImplementation(() => {
      throw new Error('no');
    });
    const m = loadScreensModule();
    expect(m.hasNativeScreens()).toBe(false);
    expect(m.loadScreens()).toBeNull();
  });

  it('requires the package once when the module is there', () => {
    turboGet.mockReturnValue({});
    const m = loadScreensModule();
    expect(m.loadScreens()).not.toBeNull();
    m.loadScreens();
    expect(screensRequired).toHaveBeenCalledTimes(1);
  });
});

describe('expo-widgets loader (Live Activity and home-screen widget, build 13+)', () => {
  function loadWidgetsModule(): typeof import('../widgetsModule') {
    let mod!: typeof import('../widgetsModule');
    jest.isolateModules(() => {
      mod = jest.requireActual('../widgetsModule');
    });
    return mod;
  }

  it('never loads the widgets on a build without ExpoWidgets (builds 10–12)', () => {
    expoModules.ExpoUI = {};
    const m = loadWidgetsModule();
    expect(m.hasNativeWidgets()).toBe(false);
    expect(m.loadLiveTagWidgets()).toBeNull();
    expect(widgetsRequired).not.toHaveBeenCalled();
  });

  it('needs @expo/ui too: the layouts are drawn with it', () => {
    expoModules.ExpoWidgets = {};
    const m = loadWidgetsModule();
    expect(m.hasNativeWidgets()).toBe(false);
    expect(m.loadLiveTagWidgets()).toBeNull();
    expect(widgetsRequired).not.toHaveBeenCalled();
  });

  it('is iPhone only', () => {
    platform.OS = 'android';
    expoModules.ExpoWidgets = {};
    expoModules.ExpoUI = {};
    const m = loadWidgetsModule();
    expect(m.hasNativeWidgets()).toBe(false);
    expect(m.loadLiveTagWidgets()).toBeNull();
    expect(widgetsRequired).not.toHaveBeenCalled();
  });

  it('loads the widgets once when both modules are there', () => {
    expoModules.ExpoWidgets = {};
    expoModules.ExpoUI = {};
    const m = loadWidgetsModule();
    expect(m.loadLiveTagWidgets()).not.toBeNull();
    m.loadLiveTagWidgets();
    expect(widgetsRequired).toHaveBeenCalledTimes(1);
  });
});

describe('expo-contacts loader (find your mates, build 13+)', () => {
  function loadContactsModule(): typeof import('../contactsModule') {
    let mod!: typeof import('../contactsModule');
    jest.isolateModules(() => {
      mod = jest.requireActual('../contactsModule');
    });
    return mod;
  }

  it('looks for both of the package’s native modules by name', () => {
    optionalGet.mockReturnValue({});
    loadContactsModule().hasNativeContacts();
    expect(optionalGet).toHaveBeenCalledWith('ExpoContactsNext');
    expect(optionalGet).toHaveBeenCalledWith('ExpoContacts');
  });

  it('never requires the package on a build without the module (builds 10 to 12)', () => {
    optionalGet.mockReturnValue(null);
    const m = loadContactsModule();
    expect(m.hasNativeContacts()).toBe(false);
    expect(m.loadContacts()).toBeNull();
    expect(contactsRequired).not.toHaveBeenCalled();
  });

  it('needs both modules: the package loads its old one too', () => {
    optionalGet.mockImplementation((name: string) => (name === 'ExpoContactsNext' ? {} : null));
    const m = loadContactsModule();
    expect(m.loadContacts()).toBeNull();
    expect(contactsRequired).not.toHaveBeenCalled();
  });

  it('treats a lookup that throws as missing', () => {
    optionalGet.mockImplementation(() => {
      throw new Error('no');
    });
    const m = loadContactsModule();
    expect(m.hasNativeContacts()).toBe(false);
    expect(m.loadContacts()).toBeNull();
  });

  it('requires the package once when the modules are there', () => {
    optionalGet.mockReturnValue({});
    const m = loadContactsModule();
    expect(m.loadContacts()).not.toBeNull();
    m.loadContacts();
    expect(contactsRequired).toHaveBeenCalledTimes(1);
  });
});
