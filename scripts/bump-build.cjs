#!/usr/bin/env node
/**
 * Move the build number or the OTA counter — the only way either should change.
 *
 *   node scripts/bump-build.cjs              next native build: build +1 on iOS and Android, OTA → 0
 *   node scripts/bump-build.cjs 15           next native build as build 15 (must be higher)
 *   node scripts/bump-build.cjs --ota        an OTA update: OTA counter +1, build untouched
 *   add --dry-run to print what would change and write nothing
 *
 * One build number for every lane lives in app.config.js (eas.json appVersionSource "local"),
 * so a preview and a production build from the same commit are the same number and never
 * repeat one already in the stores. Test: node --test scripts/bump-build.test.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONFIG = path.join(ROOT, 'app.config.js');
const OTA = path.join(ROOT, 'src', 'constants', 'ota.ts');

const IOS_RE = /buildNumber:\s*'(\d+)'/;
const ANDROID_RE = /versionCode:\s*(\d+)/;
const OTA_RE = /OTA_NUMBER\s*=\s*(\d+);/;

function readNumber(text, re, what) {
  const m = re.exec(text);
  if (!m) throw new Error(`Could not find ${what}.`);
  return Number(m[1]);
}

/** Next native build: both platforms to `target` (default current + 1), OTA counter to 0. */
function bumpBuild(configText, otaText, target) {
  const ios = readNumber(configText, IOS_RE, 'ios.buildNumber in app.config.js');
  const android = readNumber(configText, ANDROID_RE, 'android.versionCode in app.config.js');
  if (ios !== android)
    throw new Error(`iOS build ${ios} and Android build ${android} disagree. Fix app.config.js first.`);
  const build = target === undefined ? ios + 1 : Number(target);
  if (!Number.isInteger(build) || build <= ios)
    throw new Error(`The new build number must be higher than ${ios}.`);
  return {
    build,
    config: configText
      .replace(IOS_RE, `buildNumber: '${build}'`)
      .replace(ANDROID_RE, `versionCode: ${build}`),
    ota: otaText.replace(OTA_RE, 'OTA_NUMBER = 0;'),
  };
}

/** An OTA update: counter + 1. */
function bumpOta(otaText) {
  const otaNumber = readNumber(otaText, OTA_RE, 'OTA_NUMBER in src/constants/ota.ts') + 1;
  return { otaNumber, ota: otaText.replace(OTA_RE, `OTA_NUMBER = ${otaNumber};`) };
}

function main(argv) {
  const dry = argv.includes('--dry-run');
  const args = argv.filter((a) => a !== '--dry-run');
  const otaText = fs.readFileSync(OTA, 'utf8');
  if (args.includes('--ota')) {
    const out = bumpOta(otaText);
    console.log(`OTA counter → ${out.otaNumber}${dry ? ' (dry run)' : ''}`);
    if (!dry) fs.writeFileSync(OTA, out.ota);
    return;
  }
  const out = bumpBuild(fs.readFileSync(CONFIG, 'utf8'), otaText, args[0]);
  console.log(`build number → ${out.build} (iOS and Android), OTA counter → 0${dry ? ' (dry run)' : ''}`);
  if (!dry) {
    fs.writeFileSync(CONFIG, out.config);
    fs.writeFileSync(OTA, out.ota);
  }
}

module.exports = { bumpBuild, bumpOta };

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
