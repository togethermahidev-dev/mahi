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

jest.mock('react-native', () => ({
  TurboModuleRegistry: { get: (name: string) => turboGet(name) },
  NativeModules: nativeModules,
}));
jest.mock('@didit-protocol/sdk-react-native', () => {
  diditRequired();
  return { startVerification: jest.fn() };
});
jest.mock('react-native-purchases', () => {
  purchasesRequired();
  return { __esModule: true, default: { configure: jest.fn() } };
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
  for (const k of Object.keys(nativeModules)) delete nativeModules[k];
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
