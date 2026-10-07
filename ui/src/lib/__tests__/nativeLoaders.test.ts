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
const nativeViewRequired = jest.fn();
const taskManagerRequired = jest.fn();
const backgroundTaskRequired = jest.fn();

jest.mock('react-native', () => ({
  TurboModuleRegistry: { get: (name: string) => turboGet(name) },
  NativeModules: nativeModules,
  Platform: platform,
}));
jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => expoModules[name] ?? optionalGet(name) ?? null,
  requireNativeView: (name: string) => {
    nativeViewRequired(name);
    return () => null;
  },
}));
jest.mock('../../widgets/liveTagWidgets', () => {
  widgetsRequired();
  return { tagWidget: {}, tagActivity: {} };
});
jest.mock('expo-contacts', () => {
  contactsRequired();
  return { getPermissionsAsync: jest.fn() };
});
jest.mock('expo-task-manager', () => {
  taskManagerRequired();
  return { defineTask: jest.fn(), isTaskRegisteredAsync: jest.fn() };
});
jest.mock('expo-background-task', () => {
  backgroundTaskRequired();
  return { registerTaskAsync: jest.fn(), unregisterTaskAsync: jest.fn() };
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
  nativeViewRequired.mockReset();
  taskManagerRequired.mockReset();
  backgroundTaskRequired.mockReset();
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

describe('emoji keyboard loader (local module mahi-emoji-keyboard, build 13+)', () => {
  function loadEmojiModule(): typeof import('../emojiKeyboardModule') {
    let mod!: typeof import('../emojiKeyboardModule');
    jest.isolateModules(() => {
      mod = jest.requireActual('../emojiKeyboardModule');
    });
    return mod;
  }

  it('looks for the module by its native name', () => {
    optionalGet.mockReturnValue(null);
    loadEmojiModule().hasNativeEmojiKeyboard();
    expect(optionalGet).toHaveBeenCalledWith('MahiEmojiKeyboard');
  });

  it('hides the button on a build without the module (builds 10 to 12)', () => {
    optionalGet.mockReturnValue(null);
    const m = loadEmojiModule();
    expect(m.hasNativeEmojiKeyboard()).toBe(false);
    expect(m.loadEmojiKeyboard()).toBeNull();
    platform.OS = 'android';
    expect(loadEmojiModule().loadEmojiPanelView()).toBeNull();
    expect(nativeViewRequired).not.toHaveBeenCalled();
  });

  it('treats a lookup that throws as missing', () => {
    optionalGet.mockImplementation(() => {
      throw new Error('no');
    });
    const m = loadEmojiModule();
    expect(m.hasNativeEmojiKeyboard()).toBe(false);
    expect(m.loadEmojiKeyboard()).toBeNull();
  });

  it('gives the module on iPhone, with no panel view (the phone’s own keyboard is used)', () => {
    const native = { setEmojiMode: jest.fn() };
    expoModules.MahiEmojiKeyboard = native;
    const m = loadEmojiModule();
    expect(m.loadEmojiKeyboard()).toBe(native);
    expect(m.loadEmojiPanelView()).toBeNull();
    expect(nativeViewRequired).not.toHaveBeenCalled();
  });

  it('gives the panel view on Android, looked up once', () => {
    platform.OS = 'android';
    expoModules.MahiEmojiKeyboard = {};
    const m = loadEmojiModule();
    expect(m.loadEmojiPanelView()).not.toBeNull();
    m.loadEmojiPanelView();
    expect(nativeViewRequired).toHaveBeenCalledTimes(1);
    expect(nativeViewRequired).toHaveBeenCalledWith('MahiEmojiKeyboard');
  });

  it('is off on any other platform', () => {
    platform.OS = 'web';
    expoModules.MahiEmojiKeyboard = {};
    expect(loadEmojiModule().hasNativeEmojiKeyboard()).toBe(false);
  });
});

describe('Apple extras loader (local module mahi-apple-extras, build 13+)', () => {
  function loadExtrasModule(): typeof import('../appleExtrasModule') {
    let mod!: typeof import('../appleExtrasModule');
    jest.isolateModules(() => {
      mod = jest.requireActual('../appleExtrasModule');
    });
    return mod;
  }

  it('looks for the module by its native name', () => {
    optionalGet.mockReturnValue(null);
    loadExtrasModule().loadAppleExtras();
    expect(optionalGet).toHaveBeenCalledWith('MahiAppleExtras');
  });

  it('gives nothing on a build without the module (builds 10 to 12)', () => {
    optionalGet.mockReturnValue(null);
    expect(loadExtrasModule().loadAppleExtras()).toBeNull();
  });

  it('treats a lookup that throws as missing', () => {
    optionalGet.mockImplementation(() => {
      throw new Error('no');
    });
    expect(loadExtrasModule().loadAppleExtras()).toBeNull();
  });

  it('gives the module on iPhone, looked up once', () => {
    const native = { takePendingLink: jest.fn() };
    optionalGet.mockReturnValue(native);
    const m = loadExtrasModule();
    expect(m.loadAppleExtras()).toBe(native);
    m.loadAppleExtras();
    expect(optionalGet).toHaveBeenCalledTimes(1);
  });

  it('is iPhone only', () => {
    platform.OS = 'android';
    optionalGet.mockReturnValue({});
    expect(loadExtrasModule().loadAppleExtras()).toBeNull();
  });
});

describe('background task loader (expo-background-task + expo-task-manager, build 13+)', () => {
  function loadBgModule(): typeof import('../backgroundTaskModule') {
    let mod!: typeof import('../backgroundTaskModule');
    jest.isolateModules(() => {
      mod = jest.requireActual('../backgroundTaskModule');
    });
    return mod;
  }

  it('looks for both native modules by name', () => {
    optionalGet.mockReturnValue({});
    loadBgModule().loadBackgroundTask();
    expect(optionalGet).toHaveBeenCalledWith('ExpoBackgroundTask');
    expect(optionalGet).toHaveBeenCalledWith('ExpoTaskManager');
  });

  it('never requires either package on a build without them (builds 10 to 12)', () => {
    optionalGet.mockReturnValue(null);
    expect(loadBgModule().loadBackgroundTask()).toBeNull();
    expect(taskManagerRequired).not.toHaveBeenCalled();
    expect(backgroundTaskRequired).not.toHaveBeenCalled();
  });

  it('needs both: a build with only the task manager gets nothing', () => {
    optionalGet.mockImplementation((name: string) => (name === 'ExpoTaskManager' ? {} : null));
    expect(loadBgModule().loadBackgroundTask()).toBeNull();
    expect(taskManagerRequired).not.toHaveBeenCalled();
  });

  it('treats a lookup that throws as missing', () => {
    optionalGet.mockImplementation(() => {
      throw new Error('no');
    });
    expect(loadBgModule().loadBackgroundTask()).toBeNull();
  });

  it('requires both packages once when the modules are there (iPhone)', () => {
    optionalGet.mockReturnValue({});
    const m = loadBgModule();
    expect(m.loadBackgroundTask()).not.toBeNull();
    m.loadBackgroundTask();
    expect(taskManagerRequired).toHaveBeenCalledTimes(1);
    expect(backgroundTaskRequired).toHaveBeenCalledTimes(1);
  });

  it('is iPhone only (the widget is)', () => {
    platform.OS = 'android';
    optionalGet.mockReturnValue({});
    expect(loadBgModule().loadBackgroundTask()).toBeNull();
  });
});

describe('share intent loader (expo-share-intent, build 13+)', () => {
  function loadShareModule(): typeof import('../shareIntentModule') {
    let mod!: typeof import('../shareIntentModule');
    jest.isolateModules(() => {
      mod = jest.requireActual('../shareIntentModule');
    });
    return mod;
  }

  it('looks for the module by its native name', () => {
    optionalGet.mockReturnValue(null);
    loadShareModule().loadShareIntent();
    expect(optionalGet).toHaveBeenCalledWith('ExpoShareIntentModule');
  });

  it('gives nothing on a build without the module (builds 10 to 12)', () => {
    optionalGet.mockReturnValue(null);
    expect(loadShareModule().loadShareIntent()).toBeNull();
  });

  it('treats a lookup that throws as missing', () => {
    optionalGet.mockImplementation(() => {
      throw new Error('no');
    });
    expect(loadShareModule().loadShareIntent()).toBeNull();
  });

  it('gives the module on iPhone, looked up once', () => {
    const native = { getShareIntent: jest.fn() };
    optionalGet.mockReturnValue(native);
    const m = loadShareModule();
    expect(m.loadShareIntent()).toBe(native);
    m.loadShareIntent();
    expect(optionalGet).toHaveBeenCalledTimes(1);
  });

  it('is iPhone only (the Android share target is not set up)', () => {
    platform.OS = 'android';
    optionalGet.mockReturnValue({});
    expect(loadShareModule().loadShareIntent()).toBeNull();
  });
});
