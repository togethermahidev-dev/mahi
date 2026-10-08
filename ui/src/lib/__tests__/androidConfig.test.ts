import { join } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require(join(__dirname, '..', '..', '..', 'app.config.js')) as {
  plugins: unknown[];
  android: {
    allowBackup?: boolean;
    blockedPermissions?: string[];
    intentFilters: { data: { host: string; pathPrefix: string }[] }[];
  };
};

describe('Android keeps the sign-in and links to Mahi (next native build)', () => {
  it('never backs the app up, and secure-store keeps its own data out of backups', () => {
    expect(config.android.allowBackup).toBe(false);
    const store = config.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-secure-store');
    // No Face ID text: Mahi never asks for Face ID.
    expect(store).toEqual([
      'expo-secure-store',
      { configureAndroidBackup: true, faceIDPermission: false },
    ]);
  });

  it('opens only invite (/i/…) and post (/p/…) links, not every page starting with i or p', () => {
    const prefixes = config.android.intentFilters.flatMap((f) => f.data.map((d) => d.pathPrefix));
    expect(prefixes.sort()).toEqual(['/i/', '/i/', '/p/', '/p/']);
  });

  it('blocks permissions Mahi never uses, even if a package asks for them', () => {
    expect(config.android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.WRITE_CONTACTS',
        'android.permission.SYSTEM_ALERT_WINDOW',
      ])
    );
  });
});
