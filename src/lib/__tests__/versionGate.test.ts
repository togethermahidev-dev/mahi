import { gateVerdict, type AppGate } from '../versionGate';

const gate = (over: Partial<AppGate> = {}): AppGate => ({
  enabled: true,
  min_version: '0.2.0',
  min_build: null,
  store_url: 'https://apps.apple.com/app/id1',
  message: null,
  ...over,
});
const app = { version: '0.1.0', build: 10 };

describe('gateVerdict', () => {
  it('blocks a version below the minimum', () => {
    expect(gateVerdict(app, gate())).toBe('blocked');
  });
  it('lets the minimum version and above in', () => {
    expect(gateVerdict({ version: '0.2.0', build: 1 }, gate())).toBe('passed');
    expect(gateVerdict({ version: '0.10.0', build: 1 }, gate())).toBe('passed');
  });
  it('blocks an older build on the same version when min_build is set', () => {
    expect(gateVerdict(app, gate({ min_version: '0.1.0', min_build: 11 }))).toBe('blocked');
    expect(gateVerdict(app, gate({ min_version: '0.1.0', min_build: 10 }))).toBe('passed');
  });
  it('ignores min_build for a newer version', () => {
    expect(gateVerdict({ version: '0.3.0', build: 1 }, gate({ min_build: 50 }))).toBe('passed');
  });
  it('never blocks while the gate is switched off', () => {
    expect(gateVerdict(app, gate({ enabled: false, min_version: '9.0.0' }))).toBe('passed');
  });
  it('fails open when the gate could not be read', () => {
    expect(gateVerdict(app, null)).toBe('passed');
  });
  it('never blocks on a build number it cannot read', () => {
    expect(
      gateVerdict({ version: '0.1.0', build: null }, gate({ min_version: '0.1.0', min_build: 11 }))
    ).toBe('passed');
  });
});
