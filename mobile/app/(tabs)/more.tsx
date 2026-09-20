import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Header from '../../components/Header';
import { useApp } from '../../context/AppContext';
import { colors, spacing, radius, typography } from '../../theme';

export default function MoreScreen() {
  const router = useRouter();
  const { user, logout } = useApp();

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="More Modules & Settings" />
      <ScrollView contentContainerStyle={styles.content}>
        {/* User Card */}
        <View style={styles.userCard}>
          <MaterialIcons name="account-circle" size={48} color={colors.primary} />
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.username || 'Expedition Member'}</Text>
            <Text style={styles.userRole}>{user?.role || 'Expedition Leader'} • {user?.station_name || 'Maitri'}</Text>
          </View>
        </View>

        {/* Navigation Options */}
        <Text style={styles.sectionHeader}>Expedition Tools</Text>
        <View style={styles.menuContainer}>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/planner')}>
            <MaterialIcons name="event" size={22} color={colors.primary} />
            <Text style={styles.menuText}>Expedition Planner</Text>
            <MaterialIcons name="chevron-right" size={22} color={colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/cargo')}>
            <MaterialIcons name="local-shipping" size={22} color={colors.accentOrange} />
            <Text style={styles.menuText}>Cargo & Knapsack Optimizer</Text>
            <MaterialIcons name="chevron-right" size={22} color={colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/simulator')}>
            <MaterialIcons name="equalizer" size={22} color={colors.warningAmber} />
            <Text style={styles.menuText}>What-If Simulator (Monte Carlo)</Text>
            <MaterialIcons name="chevron-right" size={22} color={colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/compliance')}>
            <MaterialIcons name="gavel" size={22} color={colors.okGreen} />
            <Text style={styles.menuText}>Environmental & Hash Audit</Text>
            <MaterialIcons name="chevron-right" size={22} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <MaterialIcons name="logout" size={20} color={colors.dangerRed} />
          <Text style={styles.logoutText}>Switch Account / Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: 100,
    gap: spacing.md,
  },

  userCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.base,
    color: colors.text,
  },
  userRole: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
    marginTop: 2,
  },
  sectionHeader: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.base,
    color: colors.text,
  },
  menuContainer: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    gap: spacing.md,
  },
  menuText: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    color: colors.text,
  },
  logoutButton: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  logoutText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    color: colors.dangerRed,
  },
});
