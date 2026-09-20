import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, typography, spacing, radius, layout } from '../theme';
import { useSyncQueue, QueueItem } from '../context/SyncContext';
import { useApp } from '../context/AppContext';

export default function SyncScreen() {
  const router = useRouter();
  const { queue, pendingCount, flushQueue, removeItem, clearCompleted, isSyncing } = useSyncQueue();
  const { syncStatus, toggleSyncStatus } = useApp();

  const getPriorityBadge = (priority: number) => {
    switch (priority) {
      case 0:
        return { label: 'Priority 0 (SOS)', color: colors.dangerRed, bg: '#FEE2E2' };
      case 1:
        return { label: 'Priority 1 (Cargo)', color: '#D97706', bg: '#FEF3C7' };
      default:
        return { label: 'Priority 2 (Inventory)', color: colors.primary, bg: '#E0F2FE' };
    }
  };

  const getStateBadge = (state: QueueItem['state']) => {
    switch (state) {
      case 'sent':
        return { label: 'Sent', color: colors.okGreen };
      case 'failed':
        return { label: 'Failed', color: colors.dangerRed };
      case 'retry':
        return { label: 'Retry', color: '#D97706' };
      default:
        return { label: 'Pending', color: colors.secondaryText };
    }
  };

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString();
    } catch {
      return ts;
    }
  };

  const renderItem = ({ item }: { item: QueueItem }) => {
    const pBadge = getPriorityBadge(item.priority);
    const sBadge = getStateBadge(item.state);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.priorityChip, { backgroundColor: pBadge.bg }]}>
            <Text style={[styles.priorityText, { color: pBadge.color }]}>{pBadge.label}</Text>
          </View>
          <View style={styles.stateChip}>
            <Text style={[styles.stateText, { color: sBadge.color }]}>{sBadge.label}</Text>
          </View>
        </View>

        <Text style={styles.itemTitle}>{item.type.replace('_', ' ').toUpperCase()}</Text>
        <Text style={styles.itemMeta}>Endpoint: {item.method} {item.endpoint}</Text>
        <Text style={styles.itemTimestamp}>Client Time: {formatTimestamp(item.client_timestamp)}</Text>
        
        {item.error_message ? (
          <Text style={styles.errorText} numberOfLines={2}>Error: {item.error_message}</Text>
        ) : null}

        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.deleteButton} onPress={() => removeItem(item.id)}>
            <MaterialIcons name="delete-outline" size={18} color={colors.secondaryText} />
            <Text style={styles.deleteText}>Remove</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sync Queue</Text>
        <TouchableOpacity onPress={toggleSyncStatus} style={styles.statusToggle}>
          <Text style={styles.statusToggleText}>Status: {syncStatus}</Text>
        </TouchableOpacity>
      </View>

      {/* Overview Bar */}
      <View style={styles.overviewCard}>
        <View>
          <Text style={styles.overviewNumber}>{pendingCount}</Text>
          <Text style={styles.overviewLabel}>Pending Offline Actions</Text>
        </View>
        <TouchableOpacity
          style={[styles.flushButton, isSyncing && styles.flushButtonDisabled]}
          onPress={flushQueue}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <MaterialIcons name="sync" size={18} color={colors.white} />
              <Text style={styles.flushButtonText}>Sync Now</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Queue List */}
      {queue.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="cloud-done" size={48} color={colors.secondaryText} />
          <Text style={styles.emptyTitle}>Queue Clean</Text>
          <Text style={styles.emptySubtitle}>All offline actions have been synced with the server.</Text>
        </View>
      ) : (
        <FlatList
          data={queue}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    height: layout.topHeaderHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    color: colors.text,
  },
  statusToggle: {
    backgroundColor: colors.chipBackground,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  statusToggleText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    color: colors.text,
  },
  overviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  overviewNumber: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xxl,
    color: colors.primary,
  },
  overviewLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    color: colors.secondaryText,
  },
  flushButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.button,
    gap: spacing.xs,
  },
  flushButtonDisabled: {
    opacity: 0.6,
  },
  flushButtonText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    color: colors.white,
  },
  listContainer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  priorityChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  priorityText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
  },
  stateChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  stateText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
  },
  itemTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.base,
    color: colors.text,
    marginTop: spacing.xs,
  },
  itemMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
    marginTop: 2,
  },
  itemTimestamp: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
    marginTop: 2,
  },
  errorText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.dangerRed,
    marginTop: spacing.xs,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deleteText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    color: colors.text,
    marginTop: spacing.sm,
  },
  emptySubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    color: colors.secondaryText,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
