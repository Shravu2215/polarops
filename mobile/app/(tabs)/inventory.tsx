import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import Header from '../../components/Header';
import { useApp } from '../../context/AppContext';
import { colors, spacing, radius, typography } from '../../theme';
import { BACKEND_URL } from '../../config';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncQueue } from '../../context/SyncContext';

interface ForecastItem {
  id: number;
  name: string;
  category: string;
  available: number;
  unit: string;
  min_required: number;
  daily_use_per_person: number;
  cold_factor_sensitivity: number;
  cold_factor_used: number;
  required: number;
  shortfall: number;
  status: string;
}

interface ForecastResponse {
  temperature_c: number;
  days: number;
  survival_days: number | null;
  station_name: string;
  team_size: number;
  items: ForecastItem[];
}

const CATEGORIES = ['All', 'Fuel', 'Ration', 'Spares', 'Medical', 'Equipment'];
const DAYS_OPTIONS = [15, 30, 60, 90];

export default function InventoryScreen() {
  const { token, user, syncStatus } = useApp();
  const { addToQueue } = useSyncQueue();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [liveTemp, setLiveTemp] = useState<number | null>(null);
  const [temperature, setTemperature] = useState<number>(-33.5);
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);
  const [forecastDays, setForecastDays] = useState<number>(30);
  const [forecastData, setForecastData] = useState<ForecastResponse | null>(null);
  const [isUsingCached, setIsUsingCached] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Form State
  const [itemName, setItemName] = useState<string>('');
  const [itemCategory, setItemCategory] = useState<string>('Fuel');
  const [quantity, setQuantity] = useState<string>('1000');
  const [unit, setUnit] = useState<string>('Litres');
  const [minReq, setMinReq] = useState<string>('200');
  const [dailyUse, setDailyUse] = useState<string>('2.5');
  const [sensitivity, setSensitivity] = useState<string>('1.0');
  const [stationName, setStationName] = useState<string>('Maitri');

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchForecast = async (temp: number, days: number) => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(
        `${BACKEND_URL}/forecast?temperature=${temp}&days=${days}`,
        { headers }
      );
      if (res.ok) {
        const data: ForecastResponse = await res.json();
        setForecastData(data);
        setIsUsingCached(false);
        AsyncStorage.setItem('@polarops_cache_inventory', JSON.stringify(data));
        if (liveTemp === null && data.temperature_c !== undefined) {
          setLiveTemp(data.temperature_c);
          if (isInitialLoad) {
            setTemperature(data.temperature_c);
            setIsInitialLoad(false);
          }
        }
      } else {
        throw new Error('Network error');
      }
    } catch (e) {
      console.log('Loading inventory from AsyncStorage cache:', e);
      const cached = await AsyncStorage.getItem('@polarops_cache_inventory');
      if (cached) {
        setForecastData(JSON.parse(cached));
        setIsUsingCached(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Debounced API call when temperature or forecastDays changes
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetchForecast(temperature, forecastDays);
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [temperature, forecastDays, token]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchForecast(temperature, forecastDays);
  };

  const handleAddStock = async () => {
    if (!itemName.trim()) {
      Alert.alert('Validation Error', 'Item name is required.');
      return;
    }

    setSubmitting(true);
    const itemPayload = {
      name: itemName.trim(),
      category: itemCategory,
      quantity: parseFloat(quantity) || 0,
      unit: unit.trim(),
      min_required: parseFloat(minReq) || 0,
      daily_use_per_person: parseFloat(dailyUse) || 1.0,
      location_station: stationName.trim() || 'Maitri',
      cold_factor_sensitivity: parseFloat(sensitivity) || 1.0,
    };

    if (syncStatus === 'Offline') {
      await addToQueue('inventory_create', itemPayload, 2, '/inventory', 'POST');
      Alert.alert('Saved to Queue', 'Item saved on device. It will be synced when connected.');
      setShowAddModal(false);
      setItemName('');
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/inventory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(itemPayload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP status ${res.status}`);
      }

      Alert.alert('Success', 'Stock item added to station ledger!');
      setShowAddModal(false);
      setItemName('');
      fetchForecast(temperature, forecastDays);
    } catch (err: any) {
      console.log('Network error adding stock, saving to queue:', err);
      await addToQueue('inventory_create', itemPayload, 2, '/inventory', 'POST');
      Alert.alert('Saved to Queue', 'Item saved on device. It will be synced when connected.');
      setShowAddModal(false);
      setItemName('');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredItems = (forecastData?.items || []).filter(
    (i) => selectedCategory === 'All' || i.category.toLowerCase() === selectedCategory.toLowerCase()
  );


  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'SHORT':
        return colors.dangerRed;
      case 'LOW':
        return colors.warningAmber;
      default:
        return colors.okGreen;
    }
  };

  const isWriteAllowed = user?.role !== 'Team Member';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Inventory & Forecast" />

      {isUsingCached ? (
        <View style={styles.cachedBanner}>
          <MaterialIcons name="cloud-off" size={14} color="#B45309" />
          <Text style={styles.cachedBannerText}>showing last data</Text>
        </View>
      ) : null}

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
        {/* Forecast Simulator Card */}
        <View style={styles.forecastCard}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.forecastTitle}>Cold Supply Forecast</Text>
              <Text style={styles.forecastSub}>
                Station: {forecastData?.station_name || 'Maitri'} • Team: {forecastData?.team_size || 6}
              </Text>
            </View>
            <View style={styles.survivalBadge}>
              <MaterialIcons name="local-fire-department" size={16} color={colors.accentOrange} />
              <Text style={styles.survivalBadgeText}>
                {forecastData?.survival_days !== null && forecastData?.survival_days !== undefined
                  ? `${forecastData.survival_days} Days Left`
                  : 'N/A'}
              </Text>
            </View>
          </View>

          {/* Temperature Slider & Reset */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <View style={styles.labelWithReset}>
                <Text style={styles.inputLabel}>Antarctic Temperature:</Text>
                {liveTemp !== null ? (
                  <TouchableOpacity
                    style={styles.liveResetBtn}
                    onPress={() => setTemperature(liveTemp)}
                  >
                    <MaterialIcons name="refresh" size={12} color={colors.primary} />
                    <Text style={styles.liveResetText}>Live: {liveTemp}°C</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <Text style={styles.tempValText}>{temperature}°C</Text>
            </View>

            <View style={styles.sliderContainer}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setTemperature((prev) => Math.max(-50, Math.round((prev - 1) * 10) / 10))}
              >
                <MaterialIcons name="remove" size={16} color={colors.text} />
              </TouchableOpacity>

              <View style={styles.sliderTrackWrapper}>
                <Text style={styles.sliderMinMax}>-50°C</Text>
                {Platform.OS === 'web' ? (
                  // @ts-ignore
                  <input
                    type="range"
                    min="-50"
                    max="0"
                    step="0.5"
                    value={temperature}
                    onChange={(e: any) => setTemperature(parseFloat(e.target.value))}
                    style={{ flex: 1, cursor: 'pointer', accentColor: colors.primary }}
                  />
                ) : (
                  <View style={styles.nativeTrackContainer}>
                    <View
                      style={[
                        styles.nativeTrackFill,
                        { width: `${((temperature + 50) / 50) * 100}%` },
                      ]}
                    />
                  </View>
                )}
                <Text style={styles.sliderMinMax}>0°C</Text>
              </View>

              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setTemperature((prev) => Math.min(0, Math.round((prev + 1) * 10) / 10))}
              >
                <MaterialIcons name="add" size={16} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Days Selector */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Forecast Duration:</Text>
            <View style={styles.daysRow}>
              {DAYS_OPTIONS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.dayChip, forecastDays === d && styles.dayChipActive]}
                  onPress={() => setForecastDays(d)}
                >
                  <Text style={[styles.dayChipText, forecastDays === d && styles.dayChipTextActive]}>
                    {d} Days
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Category Filter Chips & Add Stock Button */}
        <View style={styles.filterBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.catChip, selectedCategory === cat && styles.catChipActive]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[styles.catChipText, selectedCategory === cat && styles.catChipTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {isWriteAllowed ? (
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
              <MaterialIcons name="add" size={18} color={colors.white} />
              <Text style={styles.addBtnText}>Add Stock</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Inventory Item Cards */}
        {loading && !forecastData ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : filteredItems.length > 0 ? (
          <View style={styles.itemsGrid}>
            {filteredItems.map((item) => (
              <View key={item.id} style={styles.itemCard}>
                <View style={styles.itemCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemCategory}>{item.category} • Cold Factor: {item.cold_factor_used}x</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                      {item.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.metricsRow}>
                  <View style={styles.metricBox}>
                    <Text style={styles.metricLabel}>Available</Text>
                    <Text style={styles.metricValue}>{item.available} {item.unit}</Text>
                  </View>

                  <View style={styles.metricBox}>
                    <Text style={styles.metricLabel}>Required ({forecastDays}d)</Text>
                    <Text style={styles.metricValue}>{item.required} {item.unit}</Text>
                  </View>

                  <View style={styles.metricBox}>
                    <Text style={styles.metricLabel}>Daily Burn/Person</Text>
                    <Text style={styles.metricValue}>{item.daily_use_per_person} {item.unit}</Text>
                  </View>
                </View>

                {item.shortfall > 0 ? (
                  <View style={styles.shortfallCard}>
                    <MaterialIcons name="warning" size={14} color={colors.dangerRed} />
                    <Text style={styles.shortfallText}>
                      Shortfall Alert: Deficit of {item.shortfall} {item.unit} for {forecastDays} days!
                    </Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyStateCard}>
            <MaterialIcons name="inventory-2" size={48} color={colors.secondaryText} />
            <Text style={styles.emptyTitle}>No Stock Items Registered</Text>
            <Text style={styles.emptySub}>
              {selectedCategory !== 'All'
                ? `No items found under '${selectedCategory}' category.`
                : 'No inventory items recorded for this station.'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Add Stock Item Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Station Stock Item</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <MaterialIcons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Item Name</Text>
            <TextInput style={styles.input} value={itemName} onChangeText={setItemName} placeholder="e.g. Polar Diesel Fuel Drums" />

            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.catSelectRow}>
              {['Fuel', 'Ration', 'Spares', 'Medical', 'Equipment'].map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.catSelectChip, itemCategory === c && styles.catSelectChipActive]}
                  onPress={() => setItemCategory(c)}
                >
                  <Text style={[styles.catSelectText, itemCategory === c && styles.catSelectTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Quantity</Text>
                <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Unit</Text>
                <TextInput style={styles.input} value={unit} onChangeText={setUnit} placeholder="Litres/Packs" />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Min Required</Text>
                <TextInput style={styles.input} value={minReq} onChangeText={setMinReq} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Daily Use / Person</Text>
                <TextInput style={styles.input} value={dailyUse} onChangeText={setDailyUse} keyboardType="numeric" />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Cold Sensitivity Multiplier (1.0 = Normal, 1.5 = High)</Text>
            <TextInput style={styles.input} value={sensitivity} onChangeText={setSensitivity} keyboardType="numeric" />

            <Text style={styles.fieldLabel}>Station Name</Text>
            <TextInput style={styles.input} value={stationName} onChangeText={setStationName} />

            <TouchableOpacity style={styles.submitBtn} onPress={handleAddStock} disabled={submitting}>
              {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitBtnText}>ADD TO INVENTORY</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: spacing.md, paddingBottom: 110, gap: spacing.md },
  forecastCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  forecastTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text },
  forecastSub: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, color: colors.secondaryText },
  survivalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentOrange + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  survivalBadgeText: { fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.accentOrange },
  inputGroup: { gap: 4 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  labelWithReset: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inputLabel: { fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.secondaryText },
  tempValText: { fontFamily: typography.fontFamily.bold, fontSize: 13, color: colors.primary },
  liveResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.primaryIce,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  liveResetText: { fontFamily: typography.fontFamily.bold, fontSize: 10, color: colors.primary },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  stepBtn: {
    backgroundColor: colors.cardBorder + '60',
    borderRadius: radius.button,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderTrackWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sliderMinMax: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 10,
    color: colors.secondaryText,
  },
  nativeTrackContainer: {
    flex: 1,
    height: 8,
    backgroundColor: colors.cardBorder,
    borderRadius: 4,
    overflow: 'hidden',
  },
  nativeTrackFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  tempButtonGrid: { flexDirection: 'row', gap: 6, marginTop: 2 },
  tempChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  tempChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tempChipText: { fontFamily: typography.fontFamily.medium, fontSize: 11, color: colors.text },
  tempChipTextActive: { color: colors.white, fontFamily: typography.fontFamily.bold },
  daysRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  dayChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  dayChipActive: { backgroundColor: colors.primaryIce, borderColor: colors.primary },
  dayChipText: { fontFamily: typography.fontFamily.medium, fontSize: 11, color: colors.secondaryText },
  dayChipTextActive: { color: colors.primary, fontFamily: typography.fontFamily.bold },
  filterBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  categoryScroll: { gap: 6 },
  catChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  catChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catChipText: { fontFamily: typography.fontFamily.medium, fontSize: 11, color: colors.text },
  catChipTextActive: { color: colors.white, fontFamily: typography.fontFamily.bold },
  addBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.button,
  },
  addBtnText: { fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.white },
  itemsGrid: { gap: spacing.sm },
  itemCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: spacing.xs,
  },
  itemCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text },
  itemCategory: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, color: colors.secondaryText },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontFamily: typography.fontFamily.bold, fontSize: 11 },
  metricsRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  metricBox: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xs,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  metricLabel: { fontFamily: typography.fontFamily.regular, fontSize: 10, color: colors.secondaryText },
  metricValue: { fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.text, marginTop: 2 },
  shortfallCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.dangerRed + '15',
    padding: spacing.xs,
    borderRadius: radius.button,
    marginTop: 4,
  },
  shortfallText: { fontFamily: typography.fontFamily.medium, fontSize: 11, color: colors.dangerRed },
  emptyStateCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  emptyTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text },
  emptySub: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, color: colors.secondaryText, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.md },
  modalCard: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.lg, gap: spacing.xs },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  modalTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text },
  fieldLabel: { fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.secondaryText, marginTop: 4 },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.button,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    color: colors.text,
  },
  catSelectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 4 },
  catSelectChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.background,
  },
  catSelectChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catSelectText: { fontFamily: typography.fontFamily.medium, fontSize: 11, color: colors.text },
  catSelectTextActive: { color: colors.white, fontFamily: typography.fontFamily.bold },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  submitBtnText: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, color: colors.white, letterSpacing: 0.5 },
  cachedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#F59E0B',
  },
  cachedBannerText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: '#B45309',
  },
});
