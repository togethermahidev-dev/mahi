#!/usr/bin/env node
/**
 * Release preflight. Reads files, changes nothing, and fails loudly.
 *
 * The one it exists for: `app_config.min_app_version` is what makes old builds show
 * "Update Mahi" and stop. Set it higher than the version actually in the stores and every user
 * is locked out with no update to install, and no way back except another database change. It is
 * a hand-typed string in a migration, so nothing else catches a typo in it.
 *
 * Run: pnpm release:check    Test: node --test scripts/release-check.test.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');

/** [major, minor, patch], or null when it isn't a version. */
function parse(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? '').trim());
  return m ? m.slice(1).map(Number) : null;
}

/** -1, 0 or 1 — compared as numbers, so 0.10.0 is above 0.9.0. */
function compare(a, b) {
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Every minimum app version the migrations set, in file order. Catches both the column's
 * default and any later `set min_app_version = '…'`.
 */
function findGates(files) {
  const found = [];
  for (const { name, sql } of files) {
    // The column's type and constraints can sit between the name and its default
    // (`min_app_version text not null default '0.0.0'`), so allow anything but a quote or a
    // semicolon in between — that keeps the match inside one statement and out of other strings.
    const re =
      /min_(?:app_version|version_ios|version_android)\b[^;']*?(?:=|\bdefault\b)\s*'(\d+\.\d+\.\d+)'/gi;
    let m;
    while ((m = re.exec(sql)) !== null) found.push({ file: name, version: m[1] });
  }
  return found;
}

/** What is wrong with this release, as sentences a person can act on. Empty means good to go. */
function problems({ version, runtimeVersion, gates }) {
  const out = [];

  if (!parse(version)) {
    out.push(`app.config.js version is "${version}" — it has to be three numbers, like 0.1.0.`);
    return out; // Nothing below can be judged without a version to judge against.
  }

  // A string runtimeVersion has to match, or an update lands on the wrong build. An object
  // (e.g. { policy: 'appVersion' }) is Expo deriving it, which is always in step.
  if (typeof runtimeVersion === 'string' && compare(runtimeVersion, version) !== 0) {
    out.push(
      `app.config.js runtimeVersion is ${runtimeVersion} but version is ${version}. ` +
        `An over-the-air update would go to the wrong build.`
    );
  }

  for (const gate of gates) {
    if (compare(gate.version, version) > 0) {
      out.push(
        `${gate.file} raises the minimum app version to ${gate.version}, but this app is ` +
          `${version}. Everyone would be locked out with no update to install. ` +
          `Ship ${gate.version} to both stores first, then raise the minimum.`
      );
    }
  }

  return out;
}

/**
 * The build-number rules (pingmee-v2): one number in app.config.js for every lane, iOS and Android
 * equal, the runtime following the version, and — for a release build — an OTA counter that
 * release:prepare has reset, which proves the build number was raised.
 */
function numberProblems(n, { release = false } = {}) {
  const out = [];
  if (n.appVersionSource !== 'local')
    out.push(
      `eas.json appVersionSource is "${n.appVersionSource}". It must be "local" so every lane ` +
        `uses the one build number in app.config.js.`
    );
  if (n.autoIncrement)
    out.push('eas.json sets autoIncrement. Remove it; the build number moves only by release:prepare.');
  if (String(n.iosBuild) !== String(n.androidBuild))
    out.push(
      `iOS build ${n.iosBuild} and Android build ${n.androidBuild} must be the same build number.`
    );
  if (!n.runtimeVersion || n.runtimeVersion.policy !== 'appVersion')
    out.push(
      `app.config.js runtimeVersion must be { policy: 'appVersion' } so updates follow the version.`
    );
  if (release && n.otaNumber !== 0)
    out.push(
      `OTA counter is ${n.otaNumber}. Run pnpm release:prepare once before a native build ` +
        `(it raises the build number and resets the counter).`
    );
  return out;
}

function main() {
  const config = require(path.join(ROOT, 'app.config.js'));
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(MIGRATIONS, name), 'utf8') }));

  const gates = findGates(files);
  const found = problems({
    version: config.version,
    runtimeVersion: config.runtimeVersion,
    gates,
  });

  const eas = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'));
  const otaMatch = /OTA_NUMBER\s*=\s*(\d+);/.exec(
    fs.readFileSync(path.join(ROOT, 'src', 'constants', 'ota.ts'), 'utf8')
  );
  found.push(
    ...numberProblems(
      {
        appVersionSource: eas.cli?.appVersionSource,
        autoIncrement: Object.values(eas.build ?? {}).some((p) => p.autoIncrement),
        runtimeVersion: config.runtimeVersion,
        iosBuild: config.ios?.buildNumber,
        androidBuild: config.android?.versionCode,
        otaNumber: otaMatch ? Number(otaMatch[1]) : null,
      },
      { release: process.argv.includes('--release') }
    )
  );

  const highest = gates.reduce((a, b) => (compare(b.version, a) > 0 ? b.version : a), '0.0.0');
  console.log(`app version ........ ${config.version}`);
  console.log(`runtime version .... ${JSON.stringify(config.runtimeVersion)}`);
  console.log(`minimum version .... ${highest} (highest set by any migration)`);
  console.log(`build number ....... iOS ${config.ios?.buildNumber} · Android ${config.android?.versionCode}`);
  console.log(`OTA counter ........ ${otaMatch ? otaMatch[1] : '?'}`);

  if (found.length === 0) {
    console.log('\nNothing blocking a release.');
    return;
  }
  console.error('\nThis release is not safe to ship:\n');
  for (const problem of found) console.error(`  - ${problem}`);
  process.exitCode = 1;
}

module.exports = { parse, compare, findGates, problems, numberProblems };

if (require.main === module) main();
