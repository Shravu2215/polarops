import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius, typography, layout } from '../theme';
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
    station: 'Maitri Base',
    description: 'Full oversight, approves plans & handles emergency SOS',
    icon: 'stars',
  },
  {
    username: 'logistics',
    roleName: 'Logistics Officer',
    station: 'Maitri Base',
    description: 'Manages cargo shipments, stock updates & optimization',
    icon: 'local-shipping',
  },
  {
    username: 'admin',
    roleName: 'Base Admin',
    station: 'Bharati Station',
    description: 'Monitors station inventory levels & daily consumption',
    icon: 'storefront',
  },
  {
    username: 'member',
    roleName: 'Team Member',
    station: 'Maitri Base',
    description: 'Field check-ins, skill assignment & instant SOS alerts',
    icon: 'person',
  },
];

export default function LoginScreen() {
  const router = useRouter();
  const { setUser, setToken } = useApp();
  const [loadingRole, setLoadingRole] = useState<string | null>(null);

  const handleLogin = async (username: string) => {
    setLoadingRole(username);
    try {
      const response = await fetch(`${BACKEND_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username,
          password: 'password123',
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const data = await response.json();
      setUser(data.user);
      setToken(data.access_token);

      // Navigate to main tabs
      router.replace('/(tabs)');
    } catch (err: any) {
      console.log('Login failed, proceeding with demo fallback mode:', err);
      // Offline fallback for seamless demo if backend server is unreachable
      const roleObj = ROLES.find((r) => r.username === username);
      setUser({
        id: 1,
        username: username,
        email: `${username}@polarops.in`,
        role: roleObj?.roleName || 'Expedition Member',
        station_name: roleObj?.station.split(' ')[0] || 'Maitri',
      });
      setToken(`demo-token-${username}`);
      router.replace('/(tabs)');
    } finally {
      setLoadingRole(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* PolarOps Branding Header */}
        <View style={styles.headerSection}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="ac-unit" size={36} color={colors.primary} />
          </View>
          <Text style={styles.appTitle}>PolarOps</Text>
          <Text style={styles.subTitle}>
            Antarctic Expedition Digital Twin & Operations Engine
          </Text>
          <View style={styles.stationBadgeContainer}>
            <Text style={styles.stationBadgeText}>
              Maitri & Bharati Research Stations
            </Text>
          </View>
        </View>

        {/* Role Selection Label */}
        <Text style={styles.sectionHeader}>Select Role to Access App</Text>

        {/* 4 Role Cards */}
        <View style={styles.roleGrid}>
          {ROLES.map((role) => {
            const isLoading = loadingRole === role.username;
            return (
              <TouchableOpacity
                key={role.username}
                style={styles.card}
                onPress={() => handleLogin(role.username)}
                disabled={loadingRole !== null}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.roleIconContainer}>
                    <MaterialIcons name={role.icon} size={24} color={colors.primary} />
                  </View>
                  <View style={styles.roleTextContainer}>
                    <Text style={styles.roleTitle}>{role.roleName}</Text>
                    <Text style={styles.stationText}>{role.station}</Text>
                  </View>
                </View>

                <Text style={styles.roleDescription}>{role.description}</Text>

                <View style={styles.loginButton}>
                  {isLoading ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <>
                      <Text style={styles.loginButtonText}>Login as {role.roleName.split(' ')[0]}</Text>
                      <MaterialIcons name="arrow-forward" size={18} color={colors.white} />
                    </>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  headerSection: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.circle,
    backgroundColor: colors.primaryIce,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  appTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xxl,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  subTitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    color: colors.secondaryText,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  stationBadgeContainer: {
    backgroundColor: colors.chipBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  stationBadgeText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    color: colors.primary,
  },
  sectionHeader: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.base,
    color: colors.text,
    marginBottom: spacing.md,
  },
  roleGrid: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  roleIconContainer: {
    width: 44,
    height: 44,
    borderRadius: radius.default,
    backgroundColor: colors.primaryIce,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleTextContainer: {
    flex: 1,
  },
  roleTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.base,
    color: colors.text,
  },
  stationText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
  },
  roleDescription: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    color: colors.secondaryText,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  loginButton: {
    height: layout.minButtonHeight,
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loginButtonText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    color: colors.white,
  },
});
