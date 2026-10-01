// Run: node --test scripts/release-check.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const { findGates, problems } = require('./release-check.cjs');

const sql = (name, body) => ({ name, sql: body });

test('finds every minimum-version the migrations set', () => {
  const found = findGates([
    sql(
      '20260917113302_app_version_gate.sql',
      "add column min_app_version text not null default '0.0.0'"
    ),
    sql('20260930120000_raise_gate.sql', "update public.app_config set min_app_version = '1.2.0';"),
    sql('20261001120000_unrelated.sql', 'create table whatever (id int);'),
  ]);
  assert.deepStrictEqual(found, [
    { file: '20260917113302_app_version_gate.sql', version: '0.0.0' },
    { file: '20260930120000_raise_gate.sql', version: '1.2.0' },
  ]);
});

test('a gate above the shipping version is refused', () => {
  const found = problems({
    version: '0.1.0',
    runtimeVersion: '0.1.0',
    gates: [{ file: 'raise_gate.sql', version: '1.2.0' }],
  });
  assert.strictEqual(found.length, 1);
  assert.match(found[0], /locked out/);
  assert.match(found[0], /raise_gate\.sql/);
});

test('a gate at or below the shipping version is fine', () => {
  for (const version of ['0.1.0', '0.0.9']) {
    assert.deepStrictEqual(
      problems({
        version: '0.1.0',
        runtimeVersion: '0.1.0',
        gates: [{ file: 'g.sql', version }],
      }),
      []
    );
  }
});

test('the update runtime must match the version it ships with', () => {
  const found = problems({ version: '0.2.0', runtimeVersion: '0.1.0', gates: [] });
  assert.strictEqual(found.length, 1);
  assert.match(found[0], /runtimeVersion/);
});

test('an object runtimeVersion policy is left alone', () => {
  assert.deepStrictEqual(
    problems({ version: '0.2.0', runtimeVersion: { policy: 'appVersion' }, gates: [] }),
    []
  );
});

test('a version that is not three numbers is refused', () => {
  const found = problems({ version: 'latest', runtimeVersion: 'latest', gates: [] });
  assert.strictEqual(found.length, 1);
  assert.match(found[0], /0\.1\.0/);
});

test('comparison is numeric, not alphabetical', () => {
  // '0.10.0' sorts before '0.9.0' as text, and after it as a version.
  assert.deepStrictEqual(
    problems({
      version: '0.10.0',
      runtimeVersion: '0.10.0',
      gates: [{ file: 'g.sql', version: '0.9.0' }],
    }),
    []
  );
  assert.strictEqual(
    problems({
      version: '0.9.0',
      runtimeVersion: '0.9.0',
      gates: [{ file: 'g.sql', version: '0.10.0' }],
    }).length,
    1
  );
});

// ── One build number for every lane (the pingmee-v2 rule) ──
const { numberProblems } = require('./release-check.cjs');
const good = {
  appVersionSource: 'local',
  autoIncrement: false,
  runtimeVersion: { policy: 'appVersion' },
  iosBuild: '11',
  androidBuild: 11,
  otaNumber: 0,
};

test('a prepared release has nothing wrong with its numbers', () => {
  assert.deepStrictEqual(numberProblems(good, { release: true }), []);
});

test('EAS must use the build number in app.config.js', () => {
  const found = numberProblems({ ...good, appVersionSource: 'remote' });
  assert.strictEqual(found.length, 1);
  assert.match(found[0], /appVersionSource/);
});

test('autoIncrement is never allowed', () => {
  assert.match(numberProblems({ ...good, autoIncrement: true })[0], /autoIncrement/);
});

test('iOS and Android carry the same build number', () => {
  assert.match(numberProblems({ ...good, androidBuild: 12 })[0], /same build number/);
});

test('the runtime follows the version', () => {
  assert.match(numberProblems({ ...good, runtimeVersion: '0.1.0' })[0], /policy/);
});

test('a release build needs the OTA counter reset by release:prepare', () => {
  assert.deepStrictEqual(numberProblems({ ...good, otaNumber: 9 }), []);
  assert.match(numberProblems({ ...good, otaNumber: 9 }, { release: true })[0], /release:prepare/);
});

test('per-platform gates are found too', () => {
  const found = findGates([
    sql('v.sql', "add column min_version_ios text not null default '0.0.0'"),
    sql('w.sql', "update public.app_config set min_version_android = '0.2.0';"),
  ]);
  assert.deepStrictEqual(found.map((g) => g.version), ['0.0.0', '0.2.0']);
});
