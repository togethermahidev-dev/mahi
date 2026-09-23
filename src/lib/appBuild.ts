/**
 * This installed app's version numbers, read once. The build number is the binary's own
 * (Constants.platform), so it stays right after an OTA update.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { OTA_NUMBER } from '@/constants/ota';
import { formatVersionLine } from '@/lib/versionLine';

export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

const rawBuild =
  Platform.OS === 'ios'
    ? Constants.platform?.ios?.buildNumber
    : Constants.platform?.android?.versionCode;

export const APP_BUILD: number | null =
  rawBuild === undefined || rawBuild === null || Number.isNaN(Number(rawBuild))
    ? null
    : Number(rawBuild);

export const VERSION_LINE = formatVersionLine(
  Updates.runtimeVersion ?? APP_VERSION,
  APP_BUILD,
  OTA_NUMBER
);
