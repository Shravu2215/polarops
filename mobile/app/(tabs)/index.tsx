import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Header from '../../components/Header';
import { useApp } from '../../context/AppContext';
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

interface WeatherData {
  station: string;
  latitude: number;
  longitude: number;
  temperature: number;
  unit: string;
  wind_speed_kmh: number;
  wind_chill: number;
  humidity: number;
  blizzard_warning: string | null;
  is_stale: boolean;
  fetched_at?: string;
}

interface AssignedMember {
  id: number;
  username: string;
  role: string;
  status: string;
  last_seen: string | null;
}

interface ExpeditionDetails {
  id: number;
  name: string;
  station_name: string;
  latitude?: number;
  longitude?: number;
  start_date: string | null;
  end_date: string | null;
  days_remaining: number | null;
  target_team_size: number;
  assigned_members_count: number;
  assigned_members: AssignedMember[];
  status: string;
}

interface ExpeditionListItem {
  id: number;
  name: string;
  station_name: string;
  start_date: string;
  end_date: string;
  status: string;
  target_team_size: number;
  assigned_members: number[] | null;
}

interface ExpeditionDetail extends ExpeditionListItem {
  latitude: number | null;
  longitude: number | null;
  departure_deadline: string | null;
  milestones: Array<{ name: string; duration_days: number }>;
  schedule: {
    total_buffer_days: number;
    at_risk_count: number;
    scheduled_milestones: Array<{
      name: string;
      duration_days: number;
      latest_start_date: string;
      latest_finish_date: string;
      is_at_risk: boolean;
    }>;
  } | null;
  assigned_member_details: Array<{ id: number; username: string; role: string }>;
  cargo: Array<{
    id: number;
    shipment_code: string;
    title: string;
    weight_kg: number;
    volume_m3: number;
    priority: string;
    status: string;
  }>;
  activity: Array<{
    id: number;
    action: string;
    performed_by: string;
    timestamp: string;
    summary: string;
  }>;
  created_at: string | null;
  updated_at: string | null;
}

interface CargoSummaryItem {
  id: number;
  shipment_code: string;
  title: string;
  weight_kg: number;
  volume_m3: number;
  priority: string;
  status: string;
}

interface LowStockItem {
  id: number;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  min_required: number;
  location_station: string;
}

interface TeamRosterItem {
  id: number;
  username: string;
  email: string;
  role: string;
  station_name: string;
  status: string;
  last_location_update: string | null;
}

interface DashboardSummary {
  user_role: string;
  user_station: string;
  survival_days: number | null;
  temperature_used?: number | null;
  is_weather_estimated?: boolean;
  expedition: ExpeditionDetails | null;
  active_expedition_name: string | null;
  active_station: string | null;
  team_size: number;
  active_expeditions: number;
  cargo_in_transit: number;
  cargo_delivered: number;
  cargo_pending: number;
  cargo_summary: CargoSummaryItem[];
  personnel_on_field: number;
  team_roster: TeamRosterItem[];
  low_stock_items: LowStockItem[];
  low_stock_count: number;
  inventory_total_items: number;
  latest_alerts: AlertItem[];
  active_sos_alerts: AlertItem[];
  weather: WeatherData | null;
}

const STORAGE_KEY = '@polarops_dashboard_summary';

export default function HomeScreen() {
  const router = useRouter();
  const { token, user } = useApp();
  const isLeader = user?.role === 'Expedition Leader';
  const isTeamMember = user?.role === 'Team Member';
  const isOfficer = user?.role === 'Logistics Officer';
  const isBaseAdmin = user?.role === 'Base Admin';
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [expeditions, setExpeditions] = useState<ExpeditionListItem[] | null>(null);
  const [selectedExpeditionId, setSelectedExpeditionId] = useState<number | null>(null);
  const [expeditionDetail, setExpeditionDetail] = useState<ExpeditionDetail | null>(null);
  const [loadingExpeditionDetail, setLoadingExpeditionDetail] = useState<boolean>(false);
  const [expeditionDetailError, setExpeditionDetailError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isOfflineData, setIsOfflineData] = useState<boolean>(false);

  const fetchDashboardData = async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${BACKEND_URL}/dashboard/summary`, { headers });

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
        setData({
          user_role: user?.role || 'Team Member',
          user_station: user?.station_name || 'Maitri',
          survival_days: null,
          expedition: null,
          active_expeditions: 0,
          cargo_in_transit: 0,
          cargo_delivered: 0,
          cargo_pending: 0,
          cargo_summary: [],
          personnel_on_field: 0,
          active_expedition_name: null,
          active_station: null,
          team_size: 0,
          team_roster: [],
          low_stock_items: [],
          low_stock_count: 0,
          inventory_total_items: 0,
          latest_alerts: [],
          active_sos_alerts: [],
          weather: null,
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
  }, [token]);

  useFocusEffect(
    React.useCallback(() => {
      let isFocused = true;
      setExpeditions(null);

      const loadExpeditions = async () => {
        if (!token) {
          return;
        }

        try {
          const response = await fetch(`${BACKEND_URL}/expeditions`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
          }
          const result: ExpeditionListItem[] = await response.json();
          if (isFocused) {
            setExpeditions(result);
          }
        } catch (err) {
          console.log('Failed to fetch expeditions:', err);
        }
      };

      void loadExpeditions();
      return () => {
        isFocused = false;
      };
    }, [token])
  );

  const openExpeditionDetails = async (expeditionId: number) => {
    setSelectedExpeditionId(expeditionId);
    setExpeditionDetail(null);
    setExpeditionDetailError(null);
    setLoadingExpeditionDetail(true);

    try {
      const response = await fetch(`${BACKEND_URL}/expeditions/${expeditionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      setExpeditionDetail(await response.json());
    } catch (err) {
      setExpeditionDetailError(err instanceof Error ? err.message : 'Unable to load expedition details.');
    } finally {
      setLoadingExpeditionDetail(false);
    }
  };

  const closeExpeditionDetails = () => {
    setSelectedExpeditionId(null);
    setExpeditionDetail(null);
    setExpeditionDetailError(null);
  };

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
          <Text style={styles.loadingText}>Fetching Station Metrics...</Text>
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
        {/* Offline Note Banner */}
        {isOfflineData ? (
          <View style={styles.offlineNoteCard}>
            <MaterialIcons name="cloud-off" size={16} color={colors.secondaryText} />
            <Text style={styles.offlineNoteText}>
              Offline mode, displaying cached backend telemetry
            </Text>
          </View>
        ) : null}

        {/* Top Role Header Banner */}
        <View style={{
          backgroundColor: colors.card,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.cardBorder,
          padding: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
        }}>
          <View style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: isLeader ? colors.primaryIce : isOfficer ? '#FFF7ED' : isBaseAdmin ? '#FEF3C7' : '#F0FDF4',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <MaterialIcons
              name={isLeader ? 'flag' : isOfficer ? 'local-shipping' : isBaseAdmin ? 'inventory' : 'person'}
              size={24}
              color={isLeader ? colors.primary : isOfficer ? colors.accentOrange : isBaseAdmin ? '#D97706' : colors.okGreen}
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 14, color: colors.text }}>
                {user?.username || 'Polar Station User'}
              </Text>
              <View style={{
                backgroundColor: isLeader ? colors.primaryIce : isOfficer ? '#FFF7ED' : isBaseAdmin ? '#FEF3C7' : '#F0FDF4',
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.cardBorder
              }}>
                <Text style={{
                  fontFamily: typography.fontFamily.bold,
                  fontSize: 10,
                  color: isLeader ? colors.primary : isOfficer ? colors.accentOrange : isBaseAdmin ? '#B45309' : colors.okGreen
                }}>
                  {user?.role || 'Team Member'}
                </Text>
              </View>
            </View>
            <Text style={{ fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.secondaryText, marginTop: 2 }}>
              Station: {data?.user_station || user?.station_name || 'Maitri'} • Real-Time Shared Operations
            </Text>
          </View>
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* ROLE 1: EXPEDITION LEADER DASHBOARD                                */}
        {/* ------------------------------------------------------------------ */}
        {isLeader && (
          <>
            {/* Active Expedition Hero */}
            <View style={styles.heroCard}>
              <View style={styles.heroHeader}>
                <View>
                  <Text style={styles.heroSubTitle}>
                    {data?.expedition?.name || 'Active Expedition Command'}
                  </Text>
                  <Text style={styles.heroTitle}>
                    {data?.survival_days !== null && data?.survival_days !== undefined
                      ? `${data.survival_days} Days Survival Reserve`
                      : 'Expedition Field Operations'}
                  </Text>
                  <Text style={styles.heroSubText}>
                    {data?.expedition?.end_date
                      ? `Ends: ${data.expedition.end_date} (${data.expedition.days_remaining} days remaining)`
                      : 'Active expedition timeline in progress'}
                  </Text>
                </View>

                <View style={styles.stationBadge}>
                  <Text style={styles.stationBadgeText}>
                    {data?.active_station || 'Maitri'} Station
                  </Text>
                </View>
              </View>

              <View style={styles.heroBody}>
                <View style={styles.counterContainer}>
                  <View style={styles.statusIndicatorRow}>
                    <View style={[styles.statusDot, { backgroundColor: colors.okGreen }]} />
                    <Text style={styles.statusText}>
                      Team Size: {data?.expedition?.assigned_members_count || data?.team_size || 0} Assigned Members
                    </Text>
                  </View>
                  {data?.temperature_used !== undefined && data?.temperature_used !== null ? (
                    <Text style={styles.tempSubText}>
                      Calculated at {data.temperature_used}°C live station weather
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>

            {/* Operational Summary Grid */}
            <Text style={styles.sectionHeader}>Leader Operational Summary</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <MaterialIcons name="flag" size={22} color={colors.primary} />
                <Text style={styles.statValue}>{data?.active_expeditions ?? 0}</Text>
                <Text style={styles.statLabel}>Active Expeditions</Text>
              </View>
              <View style={styles.statCard}>
                <MaterialIcons name="people" size={22} color={colors.okGreen} />
                <Text style={styles.statValue}>{data?.personnel_on_field ?? 0}</Text>
                <Text style={styles.statLabel}>Active Field Members</Text>
              </View>
              <View style={styles.statCard}>
                <MaterialIcons name="local-shipping" size={22} color={colors.accentOrange} />
                <Text style={styles.statValue}>{data?.cargo_in_transit ?? 0}</Text>
                <Text style={styles.statLabel}>Cargo In-Transit</Text>
              </View>
              <View style={styles.statCard}>
                <MaterialIcons name="warning" size={22} color={colors.dangerRed} />
                <Text style={styles.statValue}>{data?.low_stock_count ?? 0}</Text>
                <Text style={styles.statLabel}>Low Stock Alerts</Text>
              </View>
            </View>

            {/* Assigned Team Members & Status */}
            <Text style={styles.sectionHeader}>Assigned Team Roster & Field Status</Text>
            <View style={{ gap: spacing.xs }}>
              {(data?.expedition?.assigned_members && data.expedition.assigned_members.length > 0
                ? data.expedition.assigned_members
                : data?.team_roster || []
              ).map((member) => (
                <View key={member.id} style={{
                  backgroundColor: colors.card,
                  borderRadius: radius.default,
                  borderWidth: 1,
                  borderColor: colors.cardBorder,
                  padding: spacing.xs + 2,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialIcons name="account-circle" size={24} color={colors.primary} />
                    <View>
                      <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 13, color: colors.text }}>
                        {member.username}
                      </Text>
                      <Text style={{ fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.secondaryText }}>
                        {member.role}
                      </Text>
                    </View>
                  </View>
                  <View style={{
                    backgroundColor: member.status.includes('Online') ? '#DCFCE7' : '#F1F5F9',
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: radius.pill,
                  }}>
                    <Text style={{
                      fontFamily: typography.fontFamily.bold,
                      fontSize: 10,
                      color: member.status.includes('Online') ? '#15803D' : colors.secondaryText,
                    }}>
                      {member.status}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* ROLE 2: LOGISTICS OFFICER DASHBOARD                                */}
        {/* ------------------------------------------------------------------ */}
        {isOfficer && (
          <>
            <View style={[styles.heroCard, { backgroundColor: '#FFF7ED', borderColor: colors.accentOrange }]}>
              <View style={styles.heroHeader}>
                <View>
                  <Text style={[styles.heroSubTitle, { color: colors.accentOrange }]}>
                    Station Cargo & Logistics Operations
                  </Text>
                  <Text style={[styles.heroTitle, { color: colors.text }]}>
                    {data?.cargo_in_transit} Shipments In-Transit
                  </Text>
                  <Text style={styles.heroSubText}>
                    Active Station: {data?.active_station || 'Maitri'}
                  </Text>
                </View>
                <MaterialIcons name="local-shipping" size={36} color={colors.accentOrange} />
              </View>
            </View>

            <Text style={styles.sectionHeader}>Logistics Overview</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <MaterialIcons name="schedule" size={22} color={colors.accentOrange} />
                <Text style={styles.statValue}>{data?.cargo_pending ?? 0}</Text>
                <Text style={styles.statLabel}>Pending Orders</Text>
              </View>
              <View style={styles.statCard}>
                <MaterialIcons name="local-shipping" size={22} color={colors.primary} />
                <Text style={styles.statValue}>{data?.cargo_in_transit ?? 0}</Text>
                <Text style={styles.statLabel}>In-Transit</Text>
              </View>
              <View style={styles.statCard}>
                <MaterialIcons name="check-circle" size={22} color={colors.okGreen} />
                <Text style={styles.statValue}>{data?.cargo_delivered ?? 0}</Text>
                <Text style={styles.statLabel}>Delivered</Text>
              </View>
              <View style={styles.statCard}>
                <MaterialIcons name="people" size={22} color={colors.secondaryText} />
                <Text style={styles.statValue}>{data?.personnel_on_field ?? 0}</Text>
                <Text style={styles.statLabel}>Field Personnel</Text>
              </View>
            </View>

            <Text style={styles.sectionHeader}>Active Shipments Ledger</Text>
            <View style={{ gap: spacing.xs }}>
              {(data?.cargo_summary && data.cargo_summary.length > 0) ? (
                data.cargo_summary.map((cargo) => (
                  <View key={cargo.id} style={{
                    backgroundColor: colors.card,
                    borderRadius: radius.default,
                    borderWidth: 1,
                    borderColor: colors.cardBorder,
                    padding: spacing.xs + 2,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <View>
                      <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 13, color: colors.text }}>
                        {cargo.title} (#{cargo.shipment_code})
                      </Text>
                      <Text style={{ fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.secondaryText }}>
                        Weight: {cargo.weight_kg}kg • Vol: {cargo.volume_m3}m³ • Priority: {cargo.priority}
                      </Text>
                    </View>
                    <View style={{
                      backgroundColor: cargo.status === 'In-Transit' ? '#FEF3C7' : cargo.status === 'Delivered' ? '#DCFCE7' : '#F1F5F9',
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: radius.pill,
                    }}>
                      <Text style={{
                        fontFamily: typography.fontFamily.bold,
                        fontSize: 10,
                        color: cargo.status === 'In-Transit' ? '#B45309' : cargo.status === 'Delivered' ? '#15803D' : colors.secondaryText,
                      }}>
                        {cargo.status}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyAlertsCard}>
                  <Text style={styles.emptyAlertsText}>No cargo shipments registered yet.</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* ROLE 3: BASE ADMIN DASHBOARD                                       */}
        {/* ------------------------------------------------------------------ */}
        {isBaseAdmin && (
          <>
            <View style={[styles.heroCard, { backgroundColor: '#FEF3C7', borderColor: '#D97706' }]}>
              <View style={styles.heroHeader}>
                <View>
                  <Text style={[styles.heroSubTitle, { color: '#B45309' }]}>
                    Base Station Inventory Management
                  </Text>
                  <Text style={[styles.heroTitle, { color: colors.text }]}>
                    {data?.user_station || 'Maitri'} Station Stock
                  </Text>
                  <Text style={styles.heroSubText}>
                    {data?.low_stock_count} items below minimum alert threshold
                  </Text>
                </View>
                <MaterialIcons name="inventory" size={36} color="#B45309" />
              </View>
            </View>

            <Text style={styles.sectionHeader}>Station Stock Summary</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <MaterialIcons name="category" size={22} color={colors.primary} />
                <Text style={styles.statValue}>{data?.inventory_total_items ?? 0}</Text>
                <Text style={styles.statLabel}>Total Stock Supplies</Text>
              </View>
              <View style={styles.statCard}>
                <MaterialIcons name="warning" size={22} color={colors.dangerRed} />
                <Text style={styles.statValue}>{data?.low_stock_count ?? 0}</Text>
                <Text style={styles.statLabel}>Low Stock Items</Text>
              </View>
              <View style={styles.statCard}>
                <MaterialIcons name="local-shipping" size={22} color={colors.accentOrange} />
                <Text style={styles.statValue}>{data?.cargo_delivered ?? 0}</Text>
                <Text style={styles.statLabel}>Received Shipments</Text>
              </View>
              <View style={styles.statCard}>
                <MaterialIcons name="people" size={22} color={colors.okGreen} />
                <Text style={styles.statValue}>{data?.personnel_on_field ?? 0}</Text>
                <Text style={styles.statLabel}>Station Personnel</Text>
              </View>
            </View>

            {/* Low Stock Items List */}
            <Text style={styles.sectionHeader}>Critical Low Stock Items</Text>
            <View style={{ gap: spacing.xs }}>
              {(data?.low_stock_items && data.low_stock_items.length > 0) ? (
                data.low_stock_items.map((item) => (
                  <View key={item.id} style={{
                    backgroundColor: colors.card,
                    borderRadius: radius.default,
                    borderWidth: 1,
                    borderColor: colors.dangerRed + '40',
                    padding: spacing.xs + 2,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <View>
                      <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 13, color: colors.text }}>
                        {item.name}
                      </Text>
                      <Text style={{ fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.secondaryText }}>
                        Category: {item.category} • Station: {item.location_station}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 13, color: colors.dangerRed }}>
                        {item.quantity} {item.unit}
                      </Text>
                      <Text style={{ fontFamily: typography.fontFamily.regular, fontSize: 10, color: colors.secondaryText }}>
                        Min: {item.min_required} {item.unit}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyAlertsCard}>
                  <MaterialIcons name="check-circle-outline" size={24} color={colors.okGreen} />
                  <Text style={styles.emptyAlertsText}>All inventory items are above minimum thresholds.</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* ROLE 4: TEAM MEMBER DASHBOARD                                     */}
        {/* ------------------------------------------------------------------ */}
        {isTeamMember && (
          <>
            <View style={[styles.heroCard, { backgroundColor: '#F0FDF4', borderColor: colors.okGreen }]}>
              <View style={styles.heroHeader}>
                <View>
                  <Text style={[styles.heroSubTitle, { color: colors.okGreen }]}>
                    My Expedition Roster & Check-In
                  </Text>
                  <Text style={[styles.heroTitle, { color: colors.text }]}>
                    {data?.expedition?.name || 'Assigned Expedition'}
                  </Text>
                  <Text style={styles.heroSubText}>
                    Station: {data?.user_station || user?.station_name || 'Maitri'}
                  </Text>
                </View>
                <MaterialIcons name="my-location" size={32} color={colors.okGreen} />
              </View>
            </View>

            <Text style={styles.sectionHeader}>My Expedition Status</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <MaterialIcons name="people" size={22} color={colors.okGreen} />
                <Text style={styles.statValue}>{data?.expedition?.assigned_members_count || data?.personnel_on_field || 1}</Text>
                <Text style={styles.statLabel}>Expedition Teammates</Text>
              </View>
              <View style={styles.statCard}>
                <MaterialIcons name="warning" size={22} color={colors.dangerRed} />
                <Text style={styles.statValue}>{data?.active_sos_alerts?.length ?? 0}</Text>
                <Text style={styles.statLabel}>Emergency Alerts</Text>
              </View>
            </View>

            {/* My Team Members List */}
            <Text style={styles.sectionHeader}>My Teammates</Text>
            <View style={{ gap: spacing.xs }}>
              {(data?.expedition?.assigned_members && data.expedition.assigned_members.length > 0
                ? data.expedition.assigned_members
                : data?.team_roster || []
              ).map((member) => (
                <View key={member.id} style={{
                  backgroundColor: colors.card,
                  borderRadius: radius.default,
                  borderWidth: 1,
                  borderColor: colors.cardBorder,
                  padding: spacing.xs + 2,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 13, color: colors.text }}>
                    {member.username} ({member.role})
                  </Text>
                  <Text style={{ fontFamily: typography.fontFamily.medium, fontSize: 11, color: colors.okGreen }}>
                    {member.status}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {expeditions !== null && (
          <>
            <Text style={styles.sectionHeader}>All Expeditions</Text>
            <View style={{ gap: spacing.xs }}>
              {expeditions.length > 0 ? expeditions.map((expedition) => {
                const isCurrentExpedition = data?.expedition?.id === expedition.id;
                const statusLabel = expedition.status === 'Planning' ? 'Upcoming' : expedition.status;
                const statusColor = expedition.status === 'Active'
                  ? colors.okGreen
                  : expedition.status === 'Completed'
                    ? colors.secondaryText
                    : colors.accentOrange;

                return (
                  <TouchableOpacity
                    key={expedition.id}
                    activeOpacity={0.78}
                    accessibilityRole="button"
                    accessibilityLabel={`View details for ${expedition.name}`}
                    onPress={() => { void openExpeditionDetails(expedition.id); }}
                    style={{
                    backgroundColor: colors.card,
                    borderRadius: radius.default,
                    borderWidth: 1,
                    borderColor: isCurrentExpedition ? colors.primary : colors.cardBorder,
                    padding: spacing.md,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                  }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 14, color: colors.text }}>
                        {expedition.name}
                      </Text>
                      <Text style={{ fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.secondaryText, marginTop: 3 }}>
                        {expedition.station_name} | {expedition.start_date} to {expedition.end_date} | Team: {expedition.target_team_size}
                      </Text>
                      {isCurrentExpedition ? (
                        <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 10, color: colors.primary, marginTop: 4 }}>
                          Current expedition
                        </Text>
                      ) : null}
                    </View>
                    <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 11, color: statusColor }}>
                      {statusLabel}
                    </Text>
                    <MaterialIcons name="chevron-right" size={22} color={colors.secondaryText} />
                  </TouchableOpacity>
                );
              }) : (
                <View style={styles.emptyAlertsCard}>
                  <Text style={styles.emptyAlertsText}>No expeditions registered yet.</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* COMMON SHARED COMPONENTS: WEATHER & SOS ALERTS (ALL ROLES)         */}
        {/* ------------------------------------------------------------------ */}
        <Text style={styles.sectionHeader}>
          Polar Weather — {data?.active_station || data?.user_station || 'Maitri'}
        </Text>
        {data?.weather ? (
          <View style={styles.weatherCard}>
            <View style={styles.weatherRow}>
              <View style={styles.weatherItem}>
                <MaterialIcons name="ac-unit" size={24} color={colors.primary} />
                <View>
                  <Text style={styles.weatherValue}>
                    {data.weather.temperature}{data.weather.unit}
                  </Text>
                  <Text style={styles.weatherLabel}>Live Open-Meteo</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.weatherItem}>
                <MaterialIcons name="air" size={24} color={colors.secondaryText} />
                <View>
                  <Text style={styles.weatherValue}>
                    {data.weather.wind_chill}{data.weather.unit}
                  </Text>
                  <Text style={styles.weatherLabel}>Wind Chill ({data.weather.wind_speed_kmh} km/h)</Text>
                </View>
              </View>
            </View>

            {data.weather.blizzard_warning ? (
              <View style={styles.blizzardNoticeCard}>
                <MaterialIcons name="warning" size={18} color={colors.warningAmber} />
                <Text style={styles.blizzardNoticeText}>
                  {data.weather.blizzard_warning}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.emptyWeatherCard}>
            <MaterialIcons name="cloud-off" size={24} color={colors.secondaryText} />
            <Text style={styles.emptyWeatherText}>
              Station weather loading from coordinates...
            </Text>
          </View>
        )}

        {/* Latest & Active SOS Alerts */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>Emergency & Station Alerts</Text>
          <Text style={styles.alertCountText}>
            {data?.latest_alerts.length ?? 0} active
          </Text>
        </View>

        {data?.latest_alerts && data.latest_alerts.length > 0 ? (
          <View style={styles.alertsList}>
            {data.latest_alerts.map((alert) => (
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
        ) : (
          <View style={styles.emptyAlertsCard}>
            <MaterialIcons name="check-circle-outline" size={24} color={colors.okGreen} />
            <Text style={styles.emptyAlertsText}>All clear. No active alerts logged.</Text>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={selectedExpeditionId !== null}
        transparent
        animationType="slide"
        onRequestClose={closeExpeditionDetails}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(10, 20, 30, 0.48)', justifyContent: 'flex-end' }}>
          <SafeAreaView style={{
            maxHeight: '92%',
            backgroundColor: colors.background,
            borderTopLeftRadius: radius.card,
            borderTopRightRadius: radius.card,
            overflow: 'hidden',
          }}>
            <View style={{
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottomWidth: 1,
              borderBottomColor: colors.cardBorder,
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 18, color: colors.text }}>
                  Expedition Details
                </Text>
                {selectedExpeditionId !== null ? (
                  <Text style={{ fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.secondaryText }}>
                    Expedition #{selectedExpeditionId}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={closeExpeditionDetails}
                accessibilityRole="button"
                accessibilityLabel="Close expedition details"
                style={{ padding: spacing.xs }}
              >
                <MaterialIcons name="close" size={24} color={colors.secondaryText} />
              </TouchableOpacity>
            </View>

            {loadingExpeditionDetail ? (
              <View style={{ padding: spacing.xl, alignItems: 'center', gap: spacing.sm }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Loading expedition history...</Text>
              </View>
            ) : expeditionDetailError ? (
              <Text style={{ padding: spacing.md, color: colors.dangerRed, fontFamily: typography.fontFamily.medium }}>
                {expeditionDetailError}
              </Text>
            ) : expeditionDetail ? (
              <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md }}>
                <View style={{ gap: spacing.xs }}>
                  <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 20, color: colors.text }}>
                    {expeditionDetail.name}
                  </Text>
                  <Text style={{ fontFamily: typography.fontFamily.medium, fontSize: 13, color: colors.secondaryText }}>
                    {expeditionDetail.status === 'Planning' ? 'Upcoming' : expeditionDetail.status} | {expeditionDetail.station_name}
                  </Text>
                  <Text style={{ fontFamily: typography.fontFamily.regular, fontSize: 12, color: colors.secondaryText }}>
                    {expeditionDetail.start_date} to {expeditionDetail.end_date}
                  </Text>
                  <Text style={{ fontFamily: typography.fontFamily.regular, fontSize: 12, color: colors.secondaryText }}>
                    Coordinates: {expeditionDetail.latitude != null && expeditionDetail.longitude != null
                      ? `${expeditionDetail.latitude.toFixed(3)}, ${expeditionDetail.longitude.toFixed(3)}`
                      : 'Not recorded'}
                  </Text>
                  <Text style={{ fontFamily: typography.fontFamily.regular, fontSize: 12, color: colors.secondaryText }}>
                    Team size: {expeditionDetail.target_team_size} | Created: {expeditionDetail.created_at || 'Unknown'}
                  </Text>
                </View>

                <View style={{ gap: spacing.xs }}>
                  <Text style={styles.sectionHeader}>Assigned Team</Text>
                  {expeditionDetail.assigned_member_details.length > 0 ? expeditionDetail.assigned_member_details.map((member) => (
                    <Text key={member.id} style={{ fontFamily: typography.fontFamily.regular, fontSize: 12, color: colors.text }}>
                      {member.username} | {member.role}
                    </Text>
                  )) : (
                    <Text style={styles.emptyAlertsText}>No assigned team members recorded.</Text>
                  )}
                </View>

                <View style={{ gap: spacing.xs }}>
                  <Text style={styles.sectionHeader}>Plan and Milestones</Text>
                  {expeditionDetail.departure_deadline ? (
                    <Text style={{ fontFamily: typography.fontFamily.medium, fontSize: 12, color: colors.text }}>
                      Departure deadline: {expeditionDetail.departure_deadline}
                      {expeditionDetail.schedule
                        ? ` | Buffer: ${expeditionDetail.schedule.total_buffer_days} days | At risk: ${expeditionDetail.schedule.at_risk_count}`
                        : ''}
                    </Text>
                  ) : null}
                  {expeditionDetail.schedule?.scheduled_milestones.length ? expeditionDetail.schedule.scheduled_milestones.map((milestone, index) => (
                    <View key={`${milestone.name}-${index}`} style={{
                      backgroundColor: colors.card,
                      borderRadius: radius.default,
                      borderWidth: 1,
                      borderColor: milestone.is_at_risk ? colors.dangerRed : colors.cardBorder,
                      padding: spacing.sm,
                    }}>
                      <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 12, color: colors.text }}>
                        {milestone.name}{milestone.is_at_risk ? ' | At risk' : ''}
                      </Text>
                      <Text style={{ fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.secondaryText }}>
                        {milestone.latest_start_date} to {milestone.latest_finish_date} | {milestone.duration_days} days
                      </Text>
                    </View>
                  )) : expeditionDetail.milestones.length > 0 ? expeditionDetail.milestones.map((milestone, index) => (
                    <Text key={`${milestone.name}-${index}`} style={{ fontFamily: typography.fontFamily.regular, fontSize: 12, color: colors.text }}>
                      {milestone.name} | {milestone.duration_days} days
                    </Text>
                  )) : (
                    <Text style={styles.emptyAlertsText}>No saved milestones for this expedition.</Text>
                  )}
                </View>

                <View style={{ gap: spacing.xs }}>
                  <Text style={styles.sectionHeader}>Linked Cargo</Text>
                  {expeditionDetail.cargo.length > 0 ? expeditionDetail.cargo.map((cargo) => (
                    <View key={cargo.id} style={{
                      backgroundColor: colors.card,
                      borderRadius: radius.default,
                      borderWidth: 1,
                      borderColor: colors.cardBorder,
                      padding: spacing.sm,
                    }}>
                      <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 12, color: colors.text }}>
                        {cargo.title} (#{cargo.shipment_code})
                      </Text>
                      <Text style={{ fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.secondaryText }}>
                        {cargo.status} | {cargo.priority} | {cargo.weight_kg} kg | {cargo.volume_m3} m3
                      </Text>
                    </View>
                  )) : (
                    <Text style={styles.emptyAlertsText}>No cargo shipments linked to this expedition.</Text>
                  )}
                </View>

                <View style={{ gap: spacing.xs }}>
                  <Text style={styles.sectionHeader}>Expedition Activity</Text>
                  {expeditionDetail.activity.length > 0 ? expeditionDetail.activity.map((entry) => (
                    <View key={entry.id} style={{
                      borderLeftWidth: 2,
                      borderLeftColor: colors.primary,
                      paddingLeft: spacing.sm,
                      paddingVertical: spacing.xs,
                    }}>
                      <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 12, color: colors.text }}>
                        {entry.action.replace(/_/g, ' ')}
                      </Text>
                      <Text style={{ fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.secondaryText }}>
                        {entry.summary}
                      </Text>
                      <Text style={{ fontFamily: typography.fontFamily.regular, fontSize: 10, color: colors.secondaryText }}>
                        {entry.performed_by} | {entry.timestamp}
                      </Text>
                    </View>
                  )) : (
                    <Text style={styles.emptyAlertsText}>No audit activity recorded for this expedition.</Text>
                  )}
                </View>
              </ScrollView>
            ) : null}
          </SafeAreaView>
        </View>
      </Modal>
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
    paddingBottom: 110,
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
  heroSubText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.secondaryText,
    marginTop: 2,
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
  tempSubText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    color: colors.primary,
    marginTop: 4,
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
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.base,
    color: colors.text,
  },
  emptySub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
    textAlign: 'center',
  },
  emptyActionButton: {
    backgroundColor: colors.primaryIce,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.button,
    marginTop: spacing.xs,
  },
  emptyActionText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    color: colors.primary,
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
  statSubLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 10,
    color: colors.secondaryText,
    marginTop: 1,
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
  emptyWeatherCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyWeatherText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
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
  emptyAlertsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyAlertsText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
  },
});
