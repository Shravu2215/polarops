import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '../context/AppContext';
import { StatusBar } from 'expo-status-bar';
import { startLocationReporting, stopLocationReporting } from '../services/locationService';

SplashScreen.preventAutoHideAsync();

function LocationWatcher() {
  const { token } = useApp();

  useEffect(() => {
    if (token) {
      startLocationReporting(token);
    } else {
      stopLocationReporting();
    }
    return () => stopLocationReporting();
  }, [token]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AppProvider>
        <LocationWatcher />
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="sos" options={{ presentation: 'modal' }} />
          <Stack.Screen name="planner" />
          <Stack.Screen name="cargo" />
          <Stack.Screen name="simulator" />
          <Stack.Screen name="compliance" />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>

  );
}
