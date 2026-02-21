import React, { useState, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, JosefinSans_400Regular_Italic, JosefinSans_600SemiBold, JosefinSans_700Bold } from '@expo-google-fonts/josefin-sans';

import SplashScreenComponent from '@/screens/SplashScreen';
import WelcomeScreen from '@/screens/WelcomeScreen';
import CameraScreen from '@/screens/CameraScreen';

// Prevent the native OS splash from auto-hiding before our custom one is drawn.
SplashScreen.preventAutoHideAsync();

export default function App(): React.JSX.Element {
  const [splashDone, setSplashDone] = useState(false);
  const [authDone, setAuthDone] = useState(false);
  const [fontsLoaded] = useFonts({ JosefinSans_400Regular_Italic, JosefinSans_600SemiBold, JosefinSans_700Bold });

  const onSplashLayout = useCallback(() => {
    SplashScreen.hideAsync().then(() => setSplashDone(true));
  }, []);

  if (!splashDone || !fontsLoaded) {
    return (
      <>
        <SplashScreenComponent onLayout={onSplashLayout} />
        <StatusBar style="light" />
      </>
    );
  }

  if (authDone) {
    return (
      <>
        <CameraScreen />
        <StatusBar style="light" />
      </>
    );
  }

  return (
    <>
      <WelcomeScreen onAuthComplete={() => setAuthDone(true)} />
      <StatusBar style="auto" />
    </>
  );
}
