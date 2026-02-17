import React, { useState, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import SplashScreenComponent from '@/screens/SplashScreen';
import WelcomeScreen from '@/screens/WelcomeScreen';

// Prevent the native OS splash from auto-hiding before our custom one is drawn.
SplashScreen.preventAutoHideAsync();

export default function App(): React.JSX.Element {
  const [splashDone, setSplashDone] = useState(false);

  const onSplashLayout = useCallback(() => {
    SplashScreen.hideAsync().then(() => setSplashDone(true));
  }, []);

  if (!splashDone) {
    return (
      <>
        <SplashScreenComponent onLayout={onSplashLayout} />
        <StatusBar style="light" />
      </>
    );
  }

  return (
    <>
      <WelcomeScreen />
      <StatusBar style="auto" />
    </>
  );
}
