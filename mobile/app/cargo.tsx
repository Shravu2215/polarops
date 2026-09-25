import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Header from '../components/Header';
import { useApp } from '../context/AppContext';
import { colors, spacing, radius, typography } from '../theme';
import { BACKEND_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncQueue } from '../context/SyncContext';

interface CargoItem {
  id: number;
  shipment_code: string;
  title: string;
  weight_kg: number;
  volume_m3: number;
  priority: string;
  status: string;
}

interface OptimizationResult {
  capacity_weight_kg: number;
  capacity_volume_m3: number;
  packed_items: CargoItem[];
  left_behind_items: CargoItem[];
  total_weight_kg: number;
  total_volume_m3: number;
  weight_utilization_percent: number;
  volume_utilization_percent: number;
  total_priority_value: number;
  status: string;
}

export default function CargoScreen() {
  const router = useRouter();
  const { token, user, syncStatus } = useApp();
  const { addToQueue } = useSyncQueue();
  const [cargoList, setCargoList] = useState<CargoItem[]>([]);
  const [isUsingCached, setIsUsingCached] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Optimizer State
  const [capacityWeight, setCapacityWeight] = useState<string>('500');
  const [capacityVolume, setCapacityVolume] = useState<string>('5.0');
  const [optimizing, setOptimizing] = useState<boolean>(false);
  const [optResult, setOptResult] = useState<OptimizationResult | null>(null);

  // Form State
  const [title, setTitle] = useState<string>('Medical Supplies Box 1');
  const [shipmentCode, setShipmentCode] = useState<string>('CARGO-2026-01');
  const [weightKg, setWeightKg] = useState<string>('150');
  const [volumeM3, setVolumeM3] = useState<string>('1.2');
  const [priority, setPriority] = useState<string>('High');
  const [status, setStatus] = useState<string>('Pending');

  const fetchCargo = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/cargo`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCargoList(data);
        setIsUsingCached(false);
        AsyncStorage.setItem('@polarops_cache_cargo', JSON.stringify(data));
      } else {
        throw new Error('Network error');
      }
    } catch (e) {
      console.log('Loading cargo from AsyncStorage cache:', e);
      const cached = await AsyncStorage.getItem('@polarops_cache_cargo');
      if (cached) {
        setCargoList(JSON.parse(cached));
        setIsUsingCached(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCargo();
  }, []);

  const handleOptimize = async () => {
    const wCap = parseFloat(capacityWeight);
    const vCap = parseFloat(capacityVolume);

    if (isNaN(wCap) || wCap <= 0 || isNaN(vCap) || vCap <= 0) {
      Alert.alert('Validation Error', 'Please enter valid weight and volume capacities.');
      return;
    }

    setOptimizing(true);
    try {
      const res = await fetch(`${BACKEND_URL}/cargo/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          capacity_weight_kg: wCap,
          capacity_volume_m3: vCap,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP status ${res.status}`);
      }

      const result: OptimizationResult = await res.json();
      setOptResult(result);
    } catch (err: any) {
      Alert.alert('Optimizer Error', err.message || 'Failed to run knapsack optimizer.');
    } finally {
      setOptimizing(false);
    }
  };

  const handleAddCargo = async () => {
    if (!title.trim()) {
      Alert.alert('Validation Error', 'Cargo title is required.');
      return;
    }

    setSubmitting(true);
    const cargoPayload = {
      shipment_code: shipmentCode.trim() || `CARGO-${Date.now()}`,
      title: title.trim(),
      weight_kg: parseFloat(weightKg) || 0,
      volume_m3: parseFloat(volumeM3) || 0,
      priority: priority.trim(),
      status: status.trim(),
    };

    if (syncStatus === 'Offline') {
      await addToQueue('cargo_create', cargoPayload, 1, '/cargo', 'POST');
      Alert.alert('Saved to Queue', 'Cargo item saved on device. It will be synced when connected.');
      setShowAddModal(false);
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/cargo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(cargoPayload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP status ${res.status}`);
      }

      Alert.alert('Success', 'Cargo shipment added to manifest!');
      setShowAddModal(false);
      fetchCargo();
      if (optResult) {
        handleOptimize();
      }
    } catch (err: any) {
      console.log('Network error adding cargo, saving to queue:', err);
      await addToQueue('cargo_create', cargoPayload, 1, '/cargo', 'POST');
      Alert.alert('Saved to Queue', 'Cargo item saved on device. It will be synced when connected.');
      setShowAddModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  const getPriorityColor = (prio: string) => {
    switch (prio.toLowerCase()) {
      case 'critical':
        return colors.dangerRed;
      case 'high':
        return colors.accentOrange;
      case 'medium':
        return colors.primary;
      default:
        return colors.secondaryText;
    }
  };

  const isWriteAllowed = user?.role !== 'Team Member';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Cargo Manifest & Optimizer" />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={20} color={colors.text} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        {isWriteAllowed ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
            <MaterialIcons name="add" size={18} color={colors.white} />
            <Text style={styles.addBtnText}>Add Cargo</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primaryIce, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.button, borderWidth: 1, borderColor: colors.cardBorder }}>
            <MaterialIcons name="visibility" size={14} color={colors.primary} />
            <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.primary }}>
              View Only
            </Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Loading Optimizer Card */}
        <View style={styles.optimizerCard}>
          <View style={styles.optimizerHeader}>
            <MaterialIcons name="tune" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.optimizerTitle}>OR-Tools Loading Optimizer</Text>
              <Text style={styles.optimizerSub}>
                CP-SAT 2-Constraint Knapsack Optimization
              </Text>
            </View>
          </View>

          <View style={styles.capacityInputRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.capacityLabel}>Max Weight (kg)</Text>
              <TextInput
                style={styles.capacityInput}
                value={capacityWeight}
                onChangeText={setCapacityWeight}
                keyboardType="numeric"
                placeholder="500"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.capacityLabel}>Max Volume (m³)</Text>
              <TextInput
                style={styles.capacityInput}
                value={capacityVolume}
                onChangeText={setCapacityVolume}
                keyboardType="numeric"
                placeholder="5.0"
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.optimizeBtn}
            onPress={handleOptimize}
            disabled={optimizing}
          >
            {optimizing ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <MaterialIcons name="local-shipping" size={18} color={colors.white} />
                <Text style={styles.optimizeBtnText}>RUN OPTIMIZER</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Optimization Results */}
          {optResult ? (
            <View style={styles.optResultSection}>
              <View style={styles.utilizationRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.utilLabel}>
                    Weight: {optResult.total_weight_kg} / {optResult.capacity_weight_kg} kg ({optResult.weight_utilization_percent}%)
                  </Text>
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.min(100, optResult.weight_utilization_percent)}%`,
                          backgroundColor:
                            optResult.weight_utilization_percent > 90
                              ? colors.accentOrange
                              : colors.primary,
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.utilizationRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.utilLabel}>
                    Volume: {optResult.total_volume_m3} / {optResult.capacity_volume_m3} m³ ({optResult.volume_utilization_percent}%)
                  </Text>
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.min(100, optResult.volume_utilization_percent)}%`,
                          backgroundColor:
                            optResult.volume_utilization_percent > 90
                              ? colors.accentOrange
                              : colors.okGreen,
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>

              <Text style={styles.scoreText}>
                Total Priority Value Score: {optResult.total_priority_value} ({optResult.status})
              </Text>

              {/* Pack List */}
              <View style={styles.listSection}>
                <View style={styles.listSectionHeader}>
                  <MaterialIcons name="check-circle" size={16} color={colors.okGreen} />
                  <Text style={styles.listSectionTitle}>
                    Pack ({optResult.packed_items.length} Selected)
                  </Text>
                </View>
                {optResult.packed_items.map((item) => (
                  <View key={item.id} style={styles.optItemCardPacked}>
                    <Text style={styles.optItemTitle}>{item.title}</Text>
                    <View style={styles.optItemMeta}>
                      <Text style={styles.optItemSub}>
                        {item.weight_kg} kg • {item.volume_m3} m³
                      </Text>
                      <Text
                        style={[
                          styles.optItemPrio,
                          { color: getPriorityColor(item.priority) },
                        ]}
                      >
                        {item.priority}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Left Behind List */}
              {optResult.left_behind_items.length > 0 ? (
                <View style={styles.listSection}>
                  <View style={styles.listSectionHeader}>
                    <MaterialIcons name="cancel" size={16} color={colors.dangerRed} />
                    <Text style={styles.listSectionTitle}>
                      Left Behind ({optResult.left_behind_items.length} Exceeds Capacity)
                    </Text>
                  </View>
                  {optResult.left_behind_items.map((item) => (
                    <View key={item.id} style={styles.optItemCardLeft}>
                      <Text style={styles.optItemTitle}>{item.title}</Text>
                      <View style={styles.optItemMeta}>
                        <Text style={styles.optItemSub}>
                          {item.weight_kg} kg • {item.volume_m3} m³
                        </Text>
                        <Text
                          style={[
                            styles.optItemPrio,
                            { color: getPriorityColor(item.priority) },
                          ]}
                        >
                          {item.priority}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Cargo Manifest Header */}
        <Text style={styles.sectionTitle}>Full Cargo Manifest</Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
        ) : cargoList.length > 0 ? (
          cargoList.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cargoTitle}>{item.title}</Text>
                  <Text style={styles.cargoCode}>{item.shipment_code}</Text>
                </View>
                <View
                  style={[
                    styles.priorityBadge,
                    { backgroundColor: getPriorityColor(item.priority) + '15' },
                  ]}
                >
                  <Text
                    style={[
                      styles.priorityText,
                      { color: getPriorityColor(item.priority) },
                    ]}
                  >
                    {item.priority}
                  </Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Weight & Volume:</Text>
                <Text style={styles.detailVal}>{item.weight_kg} kg • {item.volume_m3} m³</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Status:</Text>
                <Text style={styles.detailVal}>{item.status}</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>No cargo shipments registered in manifest.</Text>
        )}
      </ScrollView>

      {/* Add Cargo Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Cargo Shipment</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <MaterialIcons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Cargo Title / Description</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. Medical Supplies Box 1" />

            <Text style={styles.fieldLabel}>Shipment Code</Text>
            <TextInput style={styles.input} value={shipmentCode} onChangeText={setShipmentCode} placeholder="CARGO-2026-01" />

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Weight (kg)</Text>
                <TextInput style={styles.input} value={weightKg} onChangeText={setWeightKg} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Volume (m³)</Text>
                <TextInput style={styles.input} value={volumeM3} onChangeText={setVolumeM3} keyboardType="numeric" />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Priority (Critical, High, Medium, Low)</Text>
            <TextInput style={styles.input} value={priority} onChangeText={setPriority} />

            <Text style={styles.fieldLabel}>Status (Pending, In-Transit, Delivered)</Text>
            <TextInput style={styles.input} value={status} onChangeText={setStatus} />

            <TouchableOpacity style={styles.submitBtn} onPress={handleAddCargo} disabled={submitting}>
              {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitBtnText}>ADD TO MANIFEST</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm, color: colors.text },
  addBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.button,
  },
  addBtnText: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, color: colors.white },
  scrollContent: { padding: spacing.md, gap: spacing.md, paddingBottom: 60 },
  optimizerCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: spacing.sm,
  },
  optimizerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  optimizerTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text },
  optimizerSub: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, color: colors.secondaryText },
  capacityInputRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  capacityLabel: { fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.secondaryText },
  capacityInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.button,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    color: colors.text,
    marginTop: 2,
  },
  optimizeBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.button,
    marginTop: spacing.xs,
  },
  optimizeBtnText: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, color: colors.white, letterSpacing: 0.5 },
  optResultSection: { gap: spacing.sm, marginTop: spacing.xs, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  utilizationRow: { gap: 4 },
  utilLabel: { fontFamily: typography.fontFamily.medium, fontSize: 11, color: colors.text },
  progressBarTrack: { height: 8, backgroundColor: colors.cardBorder, borderRadius: 4, overflow: 'hidden', marginTop: 2 },
  progressBarFill: { height: '100%', borderRadius: 4 },
  scoreText: { fontFamily: typography.fontFamily.medium, fontSize: 11, color: colors.secondaryText },
  listSection: { gap: spacing.xs, marginTop: spacing.xs },
  listSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  listSectionTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, color: colors.text },
  optItemCardPacked: {
    backgroundColor: colors.background,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.okGreen + '40',
    padding: spacing.xs + 2,
    gap: 2,
  },
  optItemCardLeft: {
    backgroundColor: colors.background,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.dangerRed + '40',
    padding: spacing.xs + 2,
    gap: 2,
  },
  optItemTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, color: colors.text },
  optItemMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  optItemSub: { fontFamily: typography.fontFamily.regular, fontSize: 10, color: colors.secondaryText },
  optItemPrio: { fontFamily: typography.fontFamily.bold, fontSize: 10 },
  sectionTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text, marginTop: spacing.xs },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cargoTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text },
  cargoCode: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, color: colors.secondaryText },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  priorityText: { fontFamily: typography.fontFamily.bold, fontSize: 11 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  detailLabel: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, color: colors.secondaryText },
  detailVal: { fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.xs, color: colors.text },
  emptyText: { textAlign: 'center', marginTop: 20, fontFamily: typography.fontFamily.regular, color: colors.secondaryText },
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
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  submitBtnText: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, color: colors.white, letterSpacing: 0.5 },
});
