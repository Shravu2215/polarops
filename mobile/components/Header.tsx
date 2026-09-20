import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors, spacing, radius, typography, layout } from '../theme';

interface HeaderProps {
  title: string;
}

export const Header: React.FC<HeaderProps> = ({ title }) => {
  const { syncStatus, toggleSyncStatus } = useApp();

  const getStatusColor = () => {
    switch (syncStatus) {
      case 'Online':
        return colors.okGreen;
      case 'Low':
        return colors.warningAmber;
      case 'Offline':
        return colors.dangerRed;
      default:
        return colors.okGreen;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.rightContainer}>
        {/* Sync Status Chip */}
        <TouchableOpacity
          style={styles.chip}
          onPress={toggleSyncStatus}
          activeOpacity={0.7}
        >
          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          <Text style={styles.chipText}>{syncStatus}</Text>
        </TouchableOpacity>

        {/* Notification Bell */}
        <TouchableOpacity style={styles.iconButton} activeOpacity={0.7}>
          <MaterialIcons name="notifications-none" size={24} color={colors.primary} />
          <View style={styles.badge} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: layout.topHeaderHeight,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  title: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    color: colors.text,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.chipBackground,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    color: colors.text,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accentOrange,
  },
});

export default Header;
