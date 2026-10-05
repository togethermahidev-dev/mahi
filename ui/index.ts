import { registerRootComponent } from 'expo';

import { initSentry } from './src/lib/sentry';
import App from './App';

initSentry();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
