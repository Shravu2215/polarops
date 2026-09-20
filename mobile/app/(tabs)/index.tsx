import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Header from '../../components/Header';
import { useApp } from '../../context/AppContext';
import { colors, spacing, radius, typography, layout } from '../../theme';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useApp();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="PolarOps Overview" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* User Welcome Banner */}
        <View style={styles.userBanner}>
          <View>
            <Text style={styles.welcomeText}>Welcome back,</Text>
            <Text style={styles.userName}>{user?.username || 'Expedition Member'}</Text>
          </View>
          <View style={styles.roleChip}>
            <Text style={styles.roleChipText}>{user?.role || 'Expedition Leader'}</Text>
          </View>
        </View>

        {/* Quick Stats Grid */}
        <Text style={styles.sectionHeader}>Station Status — Maitri</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <MaterialIcons name="local-gas-station" size={24} color={colors.primary} />
            <Text style={styles.statValue}>18,500 L</Text>
            <Text style={styles.statLabel}>Diesel Fuel Stock</Text>
          </View>

          <View style={styles.statCard}>
            <MaterialIcons name="restaurant" size={24} color={colors.accentOrange} />
            <Text style={styles.statValue}>142 Days</Text>
            <Text style={styles.statLabel}>Est. Survival Rations</Text>
          </View>

          <View style={styles.statCard}>
            <MaterialIcons name="groups" size={24} color={colors.okGreen} />
            <Text style={styles.statValue}>40 Members</Text>
            <Text style={styles.statLabel}>Active Personnel</Text>
          </View>

          <View style={styles.statCard}>
            <MaterialIcons name="ac-unit" size={24} color={colors.warningAmber} />
            <Text style={styles.statValue}>-24°C</Text>
            <Text style={styles.statLabel}>Ambient Temp</Text>
          </View>
        </View>

        {/* Feature Module Shortcuts */}
        <Text style={styles.sectionHeader}>Expedition Modules</Text>
        <View style={styles.moduleList}>
          <TouchableOpacity
            style={styles.moduleCard}
            onPress={() => router.push('/planner')}
            activeOpacity={0.8}
          >
            <View style={[styles.moduleIcon, { backgroundColor: colors.primaryIce }]}>
              <MaterialIcons name="event-note" size={24} color={colors.primary} />
            </View>
            <View style={styles.moduleText}>
              <Text style={styles.moduleTitle}>Expedition Planner</Text>
              <Text style={styles.moduleSub}>Schedule season windows & team size</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.moduleCard}
            onPress={() => router.push('/cargo')}
            activeOpacity={0.8}
          >
            <View style={[styles.moduleIcon, { backgroundColor: '#FFF3EB' }]}>
              <MaterialIcons name="local-shipping" size={24} color={colors.accentOrange} />
            </View>
            <View style={styles.moduleText}>
              <Text style={styles.moduleTitle}>Cargo & Loading</Text>
              <Text style={styles.moduleSub}>Track shipments & OR-Tools packing</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.moduleCard}
            onPress={() => router.push('/simulator')}
            activeOpacity={0.8}
          >
            <View style={[styles.moduleIcon, { backgroundColor: '#FEF8EC' }]}>
              <MaterialIcons name="query-stats" size={24} color={colors.warningAmber} />
            </View>
            <View style={styles.moduleText}>
              <Text style={styles.moduleTitle}>What-If Simulator</Text>
              <Text style={styles.moduleSub}>Monte Carlo risk & blizzard scenarios</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.moduleCard}
            onPress={() => router.push('/compliance')}
            activeOpacity={0.8}
          >
            <View style={[styles.moduleIcon, { backgroundColor: '#EBF7F3' }]}>
              <MaterialIcons name="verified-user" size={24} color={colors.okGreen} />
            </View>
            <View style={styles.moduleText}>
              <Text style={styles.moduleTitle}>Audit & Compliance</Text>
              <Text style={styles.moduleSub}>SHA-256 Hash Chain verification</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={colors.secondaryText} />
          </TouchableOpacity>
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
  userBanner: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  welcomeText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
  },
  userName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    color: colors.text,
  },
  roleChip: {
    backgroundColor: colors.primaryIce,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  roleChipText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    color: colors.primary,
  },
  sectionHeader: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.base,
    color: colors.text,
    marginVertical: spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  statValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    color: colors.text,
  },
  statLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
  },
  moduleList: {
    gap: spacing.sm,
  },
  moduleCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  moduleIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleText: {
    flex: 1,
  },
  moduleTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    color: colors.text,
  },
  moduleSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
    marginTop: 2,
  },
});
