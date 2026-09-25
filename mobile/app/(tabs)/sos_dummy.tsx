/**
 * SOS Dummy Screen
 *
 * This file exists purely so that Expo Router's file-based routing can resolve
 * the "sos_dummy" tab name used in (tabs)/_layout.tsx to render the custom
 * floating SOS button in the tab bar.
 *
 * The tab button itself redirects to /sos (a modal stack screen), so this
 * screen is never actually rendered. Without this file Expo Router logs a
 * warning: 'No route named "sos_dummy" exists in nested children'.
 */
import React from 'react';
import { View } from 'react-native';

export default function SosDummyScreen() {
  return <View />;
}
