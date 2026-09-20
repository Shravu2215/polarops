import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme';
import { BACKEND_URL } from '../config';
import { useApp } from '../context/AppContext';
import { SafeAreaView } from 'react-native-safe-area-context';

interface RoleOption {
  username: string;
  roleName: string;
  station: string;
  description: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}

const ROLES: RoleOption[] = [
  {
    username: 'leader',
    roleName: 'Expedition Leader',
    station: 'Maitri',
    description: 'Full station oversight, approves plans & handles SOS',
    icon: 'stars',
  },
  {
    username: 'logistics',
    roleName: 'Logistics Officer',
    station: 'Maitri',
    description: 'Manages cargo shipments & stock optimization',
    icon: 'local-shipping',
  },
  {
    username: 'admin',
    roleName: 'Base Admin',
    station: 'Bharati',
    description: 'Monitors station inventory & daily burn rates',
    icon: 'storefront',
  },
  {
    username: 'member',
    roleName: 'Team Member',
    station: 'Maitri',
    description: 'Field check-ins, duty status & instant SOS alerts',
    icon: 'person',
  },
];

export default function LoginScreen() {
  const router = useRouter();
  const { setUser, setToken } = useApp();
  const [loadingRole, setLoadingRole] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (username: string) => {
    setLoadingRole(username);
    setErrorMessage(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

      const response = await fetch(`${BACKEND_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username,
          password: 'password123',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server returned error status ${response.status}`);
      }

      const data = await response.json();
      setUser(data.user);
      setToken(data.access_token);
      router.replace('/(tabs)');
    } catch (err: any) {
      console.log('Login connection failed:', err);
      setErrorMessage(
        `Unable to connect to backend at ${BACKEND_URL}. Check server or config.ts.`
      );
    } finally {
      setLoadingRole(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header with Pinned Flat Settings Gear Icon */}
      <View style={styles.topBar}>
        <View style={styles.appBrandRow}>
          <MaterialIcons name="ac-unit" size={24} color={colors.primary} />
          <Text style={styles.appTitle}>PolarOps</Text>
        </View>

        <TouchableOpacity
          style={styles.settingsIconButton}
          onPress={() => {
            /* Open server config if needed */
          }}
          activeOpacity={0.7}
        >
          <MaterialIcons name="settings" size={22} color={colors.secondaryText} />
        </TouchableOpacity>
      </View>

      {/* Main Container */}
      <View style={styles.content}>
        {/* Subtitle */}
        <Text style={styles.subTitle}>Antarctic Expedition Operations</Text>

        {/* Error Banner if Backend Unreachable */}
        {errorMessage ? (
          <View style={styles.errorCard}>
            <MaterialIcons name="error-outline" size={20} color={colors.dangerRed} />
            <Text style={styles.errorText}>{errorMessage}</Text>
            <TouchableOpacity onPress={() => setErrorMessage(null)}>
              <MaterialIcons name="close" size={18} color={colors.secondaryText} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Role Cards List */}
        <Text style={styles.sectionHeader}>Select Role to Access Dashboard</Text>

        <View style={styles.roleList}>
          {ROLES.map((role) => {
            const isLoading = loadingRole === role.username;
            return (
              <TouchableOpacity
                key={role.username}
                style={styles.card}
                onPress={() => handleLogin(role.username)}
                disabled={loadingRole !== null}
                activeOpacity={0.75}
              >
                {/* Left Icon Container */}
                <View style={styles.roleIconContainer}>
                  <MaterialIcons name={role.icon} size={20} color={colors.primary} />
                </View>

                {/* Middle Content */}
                <View style={styles.roleTextContainer}>
                  <View style={styles.roleTitleRow}>
                    <Text style={styles.roleTitle}>{role.roleName}</Text>
                    <View style={styles.stationBadge}>
                      <Text style={styles.stationBadgeText}>{role.station}</Text>
                    </View>
                  </View>
                  <Text style={styles.roleDescription} numberOfLines={1}>
                    {role.description}
                  </Text>
                </View>

                {/* Right Indicator: Loading Spinner or Chevron */}
                <View style={styles.rightAction}>
                  {isLoading ? (
                    <ActivityIndicator color={colors.primary} size="small" />
                  ) : (
                    <MaterialIcons name="chevron-right" size={22} color={colors.secondaryText} />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  appBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  appTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  settingsIconButton: {
    padding: spacing.xs,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  subTitle: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    color: colors.secondaryText,
    marginBottom: spacing.md,
  },
  errorCard: {
    backgroundColor: '#FDF2F2',
    borderColor: '#F8D7D7',
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.dangerRed,
  },
  sectionHeader: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  roleList: {
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.sm + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  roleIconContainer: {
    width: 36,
    height: 36,
    borderRadius: radius.default,
    backgroundColor: colors.primaryIce,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleTextContainer: {
    flex: 1,
  },
  roleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  roleTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    color: colors.text,
  },
  stationBadge: {
    backgroundColor: colors.chipBackground,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  stationBadgeText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 10,
    color: colors.primary,
  },
  roleDescription: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: colors.secondaryText,
  },
  rightAction: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
