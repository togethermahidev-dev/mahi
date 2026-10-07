const { getSentryExpoConfig } = require('@sentry/react-native/metro');

// Sentry's Metro config stamps each bundle with a debug id, so error stack traces from an
// update can be matched to its uploaded source maps and point at real file names and lines.
const config = getSentryExpoConfig(__dirname);

module.exports = config;
