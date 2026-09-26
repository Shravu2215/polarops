import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '../context/AppContext';
import { StatusBar } from 'expo-status-bar';
import { startLocationReporting, stopLocationReporting } from '../services/locationService';

import { SyncProvider } from '../context/SyncContext';

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

function AppStack() {
  const router = useRouter();
  const segments = useSegments();
  const { token } = useApp();
  const isLoginRoute = segments[0] === 'login';

  useEffect(() => {
    if (!token && !isLoginRoute) router.replace('/login');
    else if (token && isLoginRoute) router.replace('/(tabs)');
  }, [isLoginRoute, router, token]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="sos" options={{ presentation: 'modal' }} />
      <Stack.Screen name="planner" />
      <Stack.Screen name="cargo" />
      <Stack.Screen name="simulator" />
      <Stack.Screen name="compliance" />
      <Stack.Screen name="sync" />
    </Stack>
  );
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
        <SyncProvider>
          <LocationWatcher />
          <StatusBar style="dark" />
          <AppStack />
        </SyncProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
