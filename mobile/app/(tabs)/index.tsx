import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Header from '../../components/Header';
import { colors, spacing, radius, typography } from '../../theme';
import { BACKEND_URL } from '../../config';

interface AlertItem {
  id: number;
  title: string;
  message: string;
  severity: string;
  alert_type: string;
  status: string;
  created_at: string;
}

interface DashboardSummary {
  survival_days: number;
  active_expeditions: number;
  cargo_in_transit: number;
  personnel_on_field: number;
  low_stock_items: number;
  team_size: number;
  latest_alerts: AlertItem[];
  weather: {
    temperature: number;
    unit: string;
    wind_chill: number;
    station: string;
    blizzard_warning: string;
  };
}

const STORAGE_KEY = '@polarops_dashboard_summary';

export default function HomeScreen() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isOfflineData, setIsOfflineData] = useState<boolean>(false);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/dashboard/summary`, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const result: DashboardSummary = await response.json();
      setData(result);
      setIsOfflineData(false);

      // Cache summary in AsyncStorage
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    } catch (err) {
      console.log('Failed to fetch summary from server, loading cache:', err);
      const cached = await AsyncStorage.getItem(STORAGE_KEY);
      if (cached) {
        setData(JSON.parse(cached));
        setIsOfflineData(true);
      } else {
        // Fallback default mock data if no cache exists yet
        setData({
          survival_days: 23.0,
          active_expeditions: 1,
          cargo_in_transit: 1,
          personnel_on_field: 4,
          low_stock_items: 0,
          team_size: 40,
          latest_alerts: [
            {
              id: 2,
              title: 'Blizzard Level 2 Warning',
              message: 'Winds exceeding 65 knots forecasted across Schirmacher Oasis.',
              severity: 'High',
              alert_type: 'Weather',
              status: 'Active',
              created_at: new Date().toISOString(),
            },
            {
              id: 1,
              title: 'Crevasse Slip near Ridge Bravo',
              message: 'Field team Skidoo track failure near crevasse zone.',
              severity: 'Critical',
              alert_type: 'SOS',
              status: 'Active',
              created_at: new Date().toISOString(),
            },
          ],
          weather: {
            temperature: -24.5,
            unit: '°C',
            wind_chill: -38.0,
            station: 'Maitri',
            blizzard_warning:
              'Blizzard Level 2 Warning: Winds > 65 knots expected in 4 hours',
          },
        });
        setIsOfflineData(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header title="PolarOps Dashboard" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Connecting to Station Engine...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return colors.dangerRed;
      case 'high':
        return colors.warningAmber;
      case 'medium':
        return colors.primary;
      default:
        return colors.okGreen;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="PolarOps Dashboard" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Offline Note Banner if using cached data */}
        {isOfflineData ? (
          <View style={styles.offlineNoteCard}>
            <MaterialIcons name="cloud-off" size={16} color={colors.secondaryText} />
            <Text style={styles.offlineNoteText}>
              Offline — Showing last cached data
            </Text>
          </View>
        ) : null}

        {/* Hero Card: Survival Days Left */}
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.heroSubTitle}>Ration & Fuel Duration</Text>
              <Text style={styles.heroTitle}>Survival Days Left</Text>
            </View>

            <View style={styles.stationBadge}>
              <Text style={styles.stationBadgeText}>
                {data?.weather.station || 'Maitri'} Base
              </Text>
            </View>
          </View>

          {/* Large Counter & Ring Indicator Visual */}
          <View style={styles.heroBody}>
            <View style={styles.counterContainer}>
              <Text style={styles.survivalValue}>
                {data?.survival_days ?? 23}{' '}
                <Text style={styles.unitText}>Days</Text>
              </Text>

              <View style={styles.statusIndicatorRow}>
                <View style={[styles.statusDot, { backgroundColor: colors.okGreen }]} />
                <Text style={styles.statusText}>
                  Stock Stable ({data?.team_size ?? 40} Team Members)
                </Text>
              </View>
            </View>

            {/* Custom Circular Progress Visual */}
            <View style={styles.ringContainer}>
              <View style={styles.outerRing}>
                <View style={styles.innerRing}>
                  <MaterialIcons name="shield" size={28} color={colors.primary} />
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* 2x2 Stat Cards */}
        <Text style={styles.sectionHeader}>Station Operational Metrics</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <MaterialIcons name="flag" size={22} color={colors.primary} />
            <Text style={styles.statValue}>{data?.active_expeditions ?? 1}</Text>
            <Text style={styles.statLabel}>Active Expeditions</Text>
          </View>

          <View style={styles.statCard}>
            <MaterialIcons name="local-shipping" size={22} color={colors.accentOrange} />
            <Text style={styles.statValue}>{data?.cargo_in_transit ?? 1}</Text>
            <Text style={styles.statLabel}>Cargo In-Transit</Text>
          </View>

          <View style={styles.statCard}>
            <MaterialIcons name="people" size={22} color={colors.okGreen} />
            <Text style={styles.statValue}>{data?.personnel_on_field ?? 4}</Text>
            <Text style={styles.statLabel}>Field Personnel</Text>
          </View>

          <View style={styles.statCard}>
            <MaterialIcons name="warning" size={22} color={colors.dangerRed} />
            <Text style={styles.statValue}>{data?.low_stock_items ?? 0}</Text>
            <Text style={styles.statLabel}>Low Stock Items</Text>
          </View>
        </View>

        {/* Weather Card */}
        <Text style={styles.sectionHeader}>Polar Weather — {data?.weather.station || 'Maitri'}</Text>
        <View style={styles.weatherCard}>
          <View style={styles.weatherRow}>
            <View style={styles.weatherItem}>
              <MaterialIcons name="ac-unit" size={24} color={colors.primary} />
              <View>
                <Text style={styles.weatherValue}>
                  {data?.weather.temperature ?? -24.5}°C
                </Text>
                <Text style={styles.weatherLabel}>Ambient Temp</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.weatherItem}>
              <MaterialIcons name="air" size={24} color={colors.secondaryText} />
              <View>
                <Text style={styles.weatherValue}>
                  {data?.weather.wind_chill ?? -38.0}°C
                </Text>
                <Text style={styles.weatherLabel}>Wind Chill</Text>
              </View>
            </View>
          </View>

          {/* Amber Blizzard Warning Notice Box */}
          {data?.weather.blizzard_warning ? (
            <View style={styles.blizzardNoticeCard}>
              <MaterialIcons name="warning" size={20} color={colors.warningAmber} />
              <Text style={styles.blizzardNoticeText}>
                {data.weather.blizzard_warning}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Latest Alerts List */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>Latest Station Alerts</Text>
          <Text style={styles.alertCountText}>
            {data?.latest_alerts.length ?? 0} active
          </Text>
        </View>

        <View style={styles.alertsList}>
          {data?.latest_alerts.map((alert) => (
            <View key={alert.id} style={styles.alertCard}>
              <View
                style={[
                  styles.severityDot,
                  { backgroundColor: getSeverityColor(alert.severity) },
                ]}
              />

              <View style={styles.alertContent}>
                <View style={styles.alertTitleRow}>
                  <Text style={styles.alertTitle}>{alert.title}</Text>
                  <View
                    style={[
                      styles.severityBadge,
                      { borderColor: getSeverityColor(alert.severity) },
                    ]}
                  >
                    <Text
                      style={[
                        styles.severityBadgeText,
                        { color: getSeverityColor(alert.severity) },
                      ]}
                    >
                      {alert.severity}
                    </Text>
                  </View>
                </View>

                <Text style={styles.alertMessage}>{alert.message}</Text>
              </View>
            </View>
          ))}
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    color: colors.secondaryText,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl + 20,
    gap: spacing.md,
  },
  offlineNoteCard: {
    backgroundColor: colors.chipBackground,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.xs,
  },
  offlineNoteText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  heroSubTitle: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
  },
  heroTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    color: colors.text,
  },
  stationBadge: {
    backgroundColor: colors.primaryIce,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  stationBadgeText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    color: colors.primary,
  },
  heroBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counterContainer: {
    flex: 1,
  },
  survivalValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xxl + 4,
    color: colors.primary,
  },
  unitText: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.medium,
    color: colors.secondaryText,
  },
  statusIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
  },
  ringContainer: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: colors.primaryIce,
    borderTopColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.base,
    color: colors.text,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alertCountText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: spacing.xs,
  },
  statValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    color: colors.text,
  },
  statLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
  },
  weatherCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: spacing.md,
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  weatherItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  weatherValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    color: colors.text,
  },
  weatherLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
  },
  divider: {
    width: 1,
    height: 36,
    backgroundColor: colors.cardBorder,
  },
  blizzardNoticeCard: {
    backgroundColor: '#FEF8EC',
    borderColor: '#FCE7C5',
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  blizzardNoticeText: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    color: colors.warningAmber,
    lineHeight: 16,
  },
  alertsList: {
    gap: spacing.sm,
  },
  alertCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
  },
  severityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  alertContent: {
    flex: 1,
  },
  alertTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  alertTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    color: colors.text,
  },
  severityBadge: {
    borderWidth: 1,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  severityBadgeText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 10,
  },
  alertMessage: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
    lineHeight: 16,
  },
});
