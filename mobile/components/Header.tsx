import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { useSyncQueue } from '../context/SyncContext';
import { colors, spacing, radius, typography, layout } from '../theme';
import { BACKEND_URL } from '../config';

interface HeaderProps {
  title: string;
}

export const Header: React.FC<HeaderProps> = ({ title }) => {
  const router = useRouter();
  const { syncStatus, setSyncStatus } = useApp();
  const { pendingCount } = useSyncQueue();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (!state.isConnected) {
        setSyncStatus('Offline');
        return;
      }

      // Test latency to backend API
      const startTime = Date.now();
      fetch(`${BACKEND_URL}/health`, { method: 'GET' })
        .then((res) => {
          const latency = Date.now() - startTime;
          if (!res.ok) {
            setSyncStatus('Offline');
          } else if (latency > 2000) {
            setSyncStatus('Low');
          } else {
            setSyncStatus('Online');
          }
        })
        .catch(() => {
          setSyncStatus('Offline');
        });
    });

    return () => unsubscribe();
  }, []);

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

  const getChipLabel = () => {
    if (pendingCount > 0) {
      return `${syncStatus}, ${pendingCount} pending`;
    }
    return syncStatus;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.rightContainer}>
        {/* Automatic Sync Status Chip (Navigates to /sync) */}
        <TouchableOpacity style={styles.chip} onPress={() => router.push('/sync')} activeOpacity={0.7}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          <Text style={styles.chipText}>{getChipLabel()}</Text>
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
