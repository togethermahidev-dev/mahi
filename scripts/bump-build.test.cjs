// Run: node --test scripts/bump-build.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const { bumpBuild, bumpOta } = require('./bump-build.cjs');

const config = `  ios: {\n    buildNumber: '10',\n  },\n  android: {\n    versionCode: 10,\n  },\n`;
const ota = `export const OTA_NUMBER = 9;\n`;

test('a new build raises both platforms by one and resets the OTA counter', () => {
  const out = bumpBuild(config, ota);
  assert.strictEqual(out.build, 11);
  assert.match(out.config, /buildNumber: '11'/);
  assert.match(out.config, /versionCode: 11/);
  assert.match(out.ota, /OTA_NUMBER = 0;/);
});

test('a chosen number is used when it is higher', () => {
  assert.strictEqual(bumpBuild(config, ota, 15).build, 15);
});

test('the build number never goes backwards or repeats', () => {
  assert.throws(() => bumpBuild(config, ota, 10), /higher than 10/);
  assert.throws(() => bumpBuild(config, ota, 3), /higher than 10/);
});

test('the two platforms must agree before bumping', () => {
  const split = config.replace('versionCode: 10', 'versionCode: 12');
  assert.throws(() => bumpBuild(split, ota), /disagree/);
});

test('an OTA raises only the OTA counter', () => {
  const out = bumpOta(ota);
  assert.strictEqual(out.otaNumber, 10);
  assert.match(out.ota, /OTA_NUMBER = 10;/);
});
