import { readFileSync } from 'fs';
import { join } from 'path';
import {
  APP_GROUP,
  APP_GROUP_SWITCHES,
  PENDING_LINK_KEY,
  appActionToRun,
  appGroupSwitchValues,
  parseAppAction,
  switchKey,
} from '../appActions';
import type { FeatureFlag } from '../featureFlags';

const UI = join(__dirname, '..', '..', '..');
const read = (path: string) => readFileSync(join(UI, path), 'utf8');
const allOn = () => true;
const allOff = () => false;
const only = (flag: FeatureFlag) => (f: FeatureFlag) => f === flag;

describe('parseAppAction', () => {
  it('reads the camera link from the Control Centre button', () => {
    expect(parseAppAction('mahi://camera?from=control')).toEqual({
      action: 'camera',
      source: 'control',
    });
  });

  it('treats a plain link as a plain link', () => {
    expect(parseAppAction('mahi://camera')).toEqual({ action: 'camera', source: 'link' });
    expect(parseAppAction('mahi:///camera/')).toEqual({ action: 'camera', source: 'link' });
  });

  it('ignores anything else', () => {
    expect(parseAppAction('mahi://i/abc')).toBeNull();
    expect(parseAppAction('mahi://dataUrl=mahiShareKey#media')).toBeNull();
    expect(parseAppAction('https://togethermahi.com/camera')).toBeNull();
    expect(parseAppAction('mahi://camera?from=nowhere')).toEqual({
      action: 'camera',
      source: 'link',
    });
    expect(parseAppAction('mahi://camera?from=constructor')?.source).toBe('link');
    expect(parseAppAction(null)).toBeNull();
  });
});

describe('appActionToRun', () => {
  it('opens the camera from the control while its switch is on', () => {
    expect(appActionToRun('mahi://camera?from=control', allOn)).toBe('camera');
    expect(appActionToRun('mahi://camera?from=control', only('control-post-workout'))).toBe(
      'camera'
    );
  });

  it('does nothing from the control with its switch off: Mahi just opens', () => {
    expect(appActionToRun('mahi://camera?from=control', allOff)).toBeNull();
  });

  it('never gates a plain link', () => {
    expect(appActionToRun('mahi://camera', allOff)).toBe('camera');
  });
});

describe('the App Group the extensions read', () => {
  it('is the one App Group the app and its extensions share', () => {
    expect(APP_GROUP).toBe('group.com.mahi.app');
    expect(read('app.config.js')).toContain(`groupIdentifier: '${APP_GROUP}'`);
  });

  it('carries the control’s switch as true / false', () => {
    expect(APP_GROUP_SWITCHES).toContain('control-post-workout');
    expect(appGroupSwitchValues(allOn)).toEqual(
      Object.fromEntries(APP_GROUP_SWITCHES.map((f) => [switchKey(f), true]))
    );
    expect(appGroupSwitchValues(allOff)[switchKey('control-post-workout')]).toBe(false);
  });

  it('uses the same names in the Swift that reads them', () => {
    const intents = read('targets/controls/_shared/MahiIntents.swift');
    const module = read('modules/mahi-apple-extras/ios/MahiAppleExtrasModule.swift');
    for (const swift of [intents, module]) {
      expect(swift).toContain(`"${APP_GROUP}"`);
      expect(swift).toContain(`"${PENDING_LINK_KEY}"`);
    }
    expect(module).toContain('"switch."');
    expect(intents).toContain(`"${switchKey('control-post-workout')}"`);
    expect(intents).toContain('"mahi://camera?from=control"');
    expect(parseAppAction('mahi://camera?from=control')?.source).toBe('control');
  });
});
