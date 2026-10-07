import { registerRootComponent } from 'expo';

import { initSentry, Sentry } from './src/lib/sentry';
import App from './App';

initSentry();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
// Sentry.wrap records taps as a trail on each error report and catches errors at the root.
registerRootComponent(Sentry.wrap(App));
