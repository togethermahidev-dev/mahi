import { readFileSync } from 'fs';
import { join } from 'path';
import {
  APP_GROUP,
  APP_GROUP_SWITCHES,
  PENDING_LINK_KEY,
  SPOTLIGHT_ACTIONS,
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

describe('Spotlight (switch spotlight)', () => {
  it('offers the app’s own three actions, and nothing about the person', () => {
    expect(SPOTLIGHT_ACTIONS.map((a) => a.title)).toEqual([
      'Post a workout',
      'Your invites',
      'Find friends in your contacts',
    ]);
    for (const a of SPOTLIGHT_ACTIONS) {
      expect(a.link).toMatch(/^mahi:\/\/[a-z-]+\?from=spotlight$/);
      expect(a.title).not.toMatch(/@/);
    }
  });

  it('each one opens what it says', () => {
    expect(SPOTLIGHT_ACTIONS.map((a) => appActionToRun(a.link, allOn))).toEqual([
      'camera',
      'invites',
      'find-mates',
    ]);
  });

  it('with the switch off, a tapped item just opens Mahi', () => {
    for (const a of SPOTLIGHT_ACTIONS) {
      expect(appActionToRun(a.link, allOff)).toBeNull();
      expect(appActionToRun(a.link, only('spotlight'))).not.toBeNull();
    }
  });

  it('invites and find your friends are plain links too', () => {
    expect(parseAppAction('mahi://invites')).toEqual({ action: 'invites', source: 'link' });
    expect(parseAppAction('mahi://find-mates')).toEqual({ action: 'find-mates', source: 'link' });
    expect(appActionToRun('mahi://find-mates', allOff)).toBe('find-mates');
  });

  it('the Spotlight handler in Swift keeps only Mahi’s own links', () => {
    const swift = read('modules/mahi-apple-extras/ios/MahiSpotlightAppDelegateSubscriber.swift');
    expect(swift).toContain('CSSearchableItemActionType');
    expect(swift).toContain('"mahi://"');
  });
});

describe('where the control is built', () => {
  // expo-widgets rebuilds its extension on every prebuild; Expo runs a later plugin's iOS steps
  // first, so ours must be listed earlier to add the control after. @bacons/apple-targets can't
  // add a second widget extension beside expo-widgets' one (it takes that one over). It is used
  // only for the App Clip, from its own folder ./clip (prebuild checked 2026-10-07: app, widgets,
  // clip and share extension all generate).
  it('the Mahi Swift plugin is listed before expo-widgets; apple-targets only builds the App Clip', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { plugins } = require(join(UI, 'app.config.js')) as { plugins: unknown[] };
    const names = plugins.map((p) => (Array.isArray(p) ? p[0] : p));
    const ours = names.indexOf('./modules/mahi-apple-extras/app.plugin.js');
    expect(ours).toBeGreaterThanOrEqual(0);
    expect(ours).toBeLessThan(names.indexOf('expo-widgets'));
    const targets = plugins.filter((p) => Array.isArray(p) && p[0] === '@bacons/apple-targets');
    expect(targets).toHaveLength(1);
    expect((targets[0] as [string, { root: string }])[1].root).toBe('./clip');
  });
});

describe('Siri and Shortcuts (switch siri-shortcuts)', () => {
  const SIRI = {
    'mahi://camera?from=siri': 'camera',
    'mahi://invites?from=siri': 'invites',
    'mahi://find-mates?from=siri': 'find-mates',
  } as const;

  it('each App Shortcut opens what it says', () => {
    for (const [link, action] of Object.entries(SIRI)) {
      expect(parseAppAction(link)).toEqual({ action, source: 'siri' });
      expect(appActionToRun(link, only('siri-shortcuts'))).toBe(action);
    }
  });

  it('with the switch off, Mahi just opens', () => {
    for (const link of Object.keys(SIRI)) {
      expect(appActionToRun(link, allOff)).toBeNull();
    }
  });

  it('the intents leave exactly these links, behind the switch', () => {
    const intents = read('modules/mahi-apple-extras/swift/MahiIntents.swift');
    for (const link of Object.keys(SIRI)) expect(intents).toContain(`"${link}"`);
    expect(intents).toContain(`"${switchKey('siri-shortcuts')}"`);
    expect(APP_GROUP_SWITCHES).toContain('siri-shortcuts');
  });

  it('the App Shortcuts say the phrases with the app’s name, in the app only', () => {
    const shortcuts = read('modules/mahi-apple-extras/swift/MahiAppShortcuts.swift');
    expect(shortcuts).toContain('AppShortcutsProvider');
    for (const phrase of [
      'Post a workout in \\(.applicationName)',
      'Open my invites in \\(.applicationName)',
      'Find friends on \\(.applicationName)',
    ]) {
      expect(shortcuts).toContain(phrase);
    }
    // Never "Find my …": that is Apple's own Find My.
    expect(shortcuts).not.toContain('Find my');
    expect(read('modules/mahi-apple-extras/swift/MahiIntents.swift')).not.toContain(
      'AppShortcutsProvider'
    );
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
    const intents = read('modules/mahi-apple-extras/swift/MahiIntents.swift');
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
