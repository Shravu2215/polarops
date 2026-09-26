import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Header from '../components/Header';
import { useApp } from '../context/AppContext';
import { colors, spacing, radius, typography } from '../theme';
import { BACKEND_URL } from '../config';

interface ExpeditionOption {
  id: number;
  name: string;
  station_name: string;
  status: string;
}

interface RequirementItem {
  id: number;
  expedition_id: number;
  supply_name: string;
  category: string;
  quantity: number;
  unit: string;
  status: string;
  weight_per_unit: number;
  volume_per_unit: number;
  priority: string;
  priority_value: number;
  available_quantity: number;
  max_selectable_quantity: number;
}

interface ManifestEntry {
  id: number;
  expedition_id: number;
  shipment_code: string;
  title: string;
  status: string;
  vehicle_capacity_weight_kg: number;
  vehicle_capacity_volume_m3: number;
  total_weight_kg: number;
  total_volume_m3: number;
  selected_item_count: number;
  total_priority_value: number;
  items: Array<{
    supply_name: string;
    quantity: number;
    weight_per_unit: number;
    volume_per_unit: number;
    priority: string;
    priority_value: number;
  }>;
}

export default function CargoScreen() {
  const router = useRouter();
  const { token, user } = useApp();
  const [expeditions, setExpeditions] = useState<ExpeditionOption[]>([]);
  const [selectedExpeditionId, setSelectedExpeditionId] = useState<number | null>(null);
  const [requirements, setRequirements] = useState<RequirementItem[]>([]);
  const [selectedQuantities, setSelectedQuantities] = useState<Record<number, number>>({});
  const [savedManifests, setSavedManifests] = useState<ManifestEntry[]>([]);
  const [capacityWeight, setCapacityWeight] = useState<string>('120');
  const [capacityVolume, setCapacityVolume] = useState<string>('4.0');
  const [optimizing, setOptimizing] = useState<boolean>(false);
  const [packing, setPacking] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('Expedition Cargo Pack');

  const isWriteAllowed = user?.role !== 'Team Member';

  const fetchExpeditions = async () => {
    if (!token) return [];
    const res = await fetch(`${BACKEND_URL}/expeditions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Unable to load expedition list.');
    const data: ExpeditionOption[] = await res.json();
    setExpeditions(data);
    if (!data.some((expedition) => expedition.id === selectedExpeditionId)) {
      setSelectedExpeditionId(data[0]?.id ?? null);
    }
    return data;
  };

  const fetchRequirements = async (expeditionId: number | null) => {
    if (!token || !expeditionId) {
      setRequirements([]);
      setSelectedQuantities({});
      return;
    }
    const res = await fetch(`${BACKEND_URL}/expedition-requirements?expedition_id=${expeditionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Unable to load expedition requirements.');
    const data: RequirementItem[] = await res.json();
    const defaults: Record<number, number> = {};
    data.forEach((item) => {
      defaults[item.id] = 0;
    });
    setRequirements(data);
    setSelectedQuantities(defaults);
  };

  const fetchManifests = async (expeditionId: number | null) => {
    if (!token) return;
    const query = expeditionId ? `?expedition_id=${expeditionId}` : '';
    const res = await fetch(`${BACKEND_URL}/cargo-manifests${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data: ManifestEntry[] = await res.json();
      setSavedManifests(data);
    }
  };

  const reload = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const loadedExpeditions = await fetchExpeditions();
      const activeExpedition = loadedExpeditions.some((expedition) => expedition.id === selectedExpeditionId)
        ? selectedExpeditionId
        : (loadedExpeditions[0]?.id ?? null);
      setSelectedExpeditionId(activeExpedition);
      await Promise.all([fetchRequirements(activeExpedition), fetchManifests(activeExpedition)]);
    } catch (error) {
      Alert.alert('Cargo loading error', error instanceof Error ? error.message : 'Failed to load cargo data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (token) {
      void reload();
    }
  }, [token]);

  useEffect(() => {
    if (selectedExpeditionId) {
      void fetchRequirements(selectedExpeditionId);
      void fetchManifests(selectedExpeditionId);
    }
  }, [selectedExpeditionId]);

  const selectedManifestItems = useMemo(() => {
    return requirements
      .map((item) => {
        const selectedQty = Number(selectedQuantities[item.id] ?? 0);
        const safeQty = Math.max(0, Math.min(selectedQty, item.quantity));
        const weightPerUnit = Number(item.weight_per_unit);
        const volumePerUnit = Number(item.volume_per_unit);
        const priority = item.priority;
        const priorityValue = Number(item.priority_value);
        return {
          ...item,
          selected_quantity: safeQty,
          total_weight_kg: weightPerUnit * safeQty,
          total_volume_m3: volumePerUnit * safeQty,
          priority,
          priority_value: priorityValue,
        };
      })
      .filter((item) => item.selected_quantity > 0);
  }, [requirements, selectedQuantities]);

  const totalWeight = useMemo(
    () => selectedManifestItems.reduce((sum, item) => sum + item.total_weight_kg, 0),
    [selectedManifestItems]
  );
  const totalVolume = useMemo(
    () => selectedManifestItems.reduce((sum, item) => sum + item.total_volume_m3, 0),
    [selectedManifestItems]
  );
  const selectedItemCount = useMemo(
    () => selectedManifestItems.reduce((sum, item) => sum + item.selected_quantity, 0),
    [selectedManifestItems]
  );
  const priorityScore = useMemo(
    () => selectedManifestItems.reduce((sum, item) => sum + item.selected_quantity * item.priority_value, 0),
    [selectedManifestItems]
  );
  const remainingWeight = Number(capacityWeight || 0) - totalWeight;
  const remainingVolume = Number(capacityVolume || 0) - totalVolume;

  const handleQuantityChange = (itemId: number, qty: number) => {
    const maxQty = requirements.find((item) => item.id === itemId)?.max_selectable_quantity ?? 0;
    const numericQty = Number.isFinite(qty) ? Math.max(0, Math.min(Math.floor(qty), maxQty)) : 0;
    setSelectedQuantities((previous) => ({ ...previous, [itemId]: numericQty }));
  };

  const handleOptimize = async () => {
    if (!selectedExpeditionId) {
      Alert.alert('No expedition selected', 'Select an expedition before optimizing the load.');
      return;
    }
    const weightCap = Number(capacityWeight);
    const volumeCap = Number(capacityVolume);
    if (!Number.isFinite(weightCap) || !Number.isFinite(volumeCap) || weightCap <= 0 || volumeCap <= 0) {
      Alert.alert('Capacity required', 'Enter valid max weight and max volume values.');
      return;
    }

    setOptimizing(true);
    try {
      const response = await fetch(`${BACKEND_URL}/cargo/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          expedition_id: selectedExpeditionId,
          capacity_weight_kg: weightCap,
          capacity_volume_m3: volumeCap,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Optimization failed.');

      const nextQuantities: Record<number, number> = {};
      result.packed_items.forEach((item: any) => {
        nextQuantities[item.id] = Number(item.selected_quantity || item.quantity || 0);
      });
      setSelectedQuantities(nextQuantities);
      Alert.alert('Optimization complete', `Selected ${result.selected_item_count} items with ${result.total_priority_value} priority score.`);
    } catch (error) {
      Alert.alert('Optimizer Error', error instanceof Error ? error.message : 'Unable to optimize the cargo.');
    } finally {
      setOptimizing(false);
    }
  };

  const handlePackManifest = async () => {
    if (!selectedExpeditionId) {
      Alert.alert('Please select an expedition first.');
      return;
    }
    const weightCapacity = Number(capacityWeight);
    const volumeCapacity = Number(capacityVolume);
    if (!Number.isFinite(weightCapacity) || !Number.isFinite(volumeCapacity) || weightCapacity <= 0 || volumeCapacity <= 0) {
      Alert.alert('Capacity required', 'Enter valid weight and volume capacities before packing.');
      return;
    }
    if (totalWeight > weightCapacity || totalVolume > volumeCapacity) {
      Alert.alert('Capacity exceeded', 'Reduce the selected quantities to fit within both vehicle limits.');
      return;
    }
    const payloadItems = selectedManifestItems.map((item) => ({
      supply_name: item.supply_name,
      quantity: item.selected_quantity,
      weight_per_unit: Number(item.weight_per_unit ?? 0),
      volume_per_unit: Number(item.volume_per_unit ?? 0),
      priority: item.priority,
      priority_value: Number(item.priority_value ?? 0),
    }));

    if (payloadItems.length === 0) {
      Alert.alert('No cargo selected', 'Choose at least one supply item before packing the manifest.');
      return;
    }

    setPacking(true);
    try {
      const uniqueShipmentCode = `PKG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const response = await fetch(`${BACKEND_URL}/cargo-manifests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          expedition_id: selectedExpeditionId,
          title: title.trim() || 'Expedition Cargo Pack',
          shipment_code: uniqueShipmentCode,
          vehicle_capacity_weight_kg: weightCapacity,
          vehicle_capacity_volume_m3: volumeCapacity,
          items: payloadItems,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Unable to save cargo manifest.');
      await fetchManifests(selectedExpeditionId);
      Alert.alert('Manifest packed', 'The final cargo manifest has been saved and linked to the expedition.');
    } catch (error) {
      Alert.alert('Pack failed', error instanceof Error ? error.message : 'Could not save cargo manifest.');
    } finally {
      setPacking(false);
    }
  };

  const getPriorityColor = (priority: string = 'Medium') => {
    switch (priority.toLowerCase()) {
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Cargo Manifest & Optimizer" />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={20} color={colors.text} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void reload(); }} />}
      >
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Expedition Load Planning</Text>

          <Text style={styles.label}>Selected Expedition</Text>
          <View style={styles.selectorBox}>
            {expeditions.map((expedition) => (
              <TouchableOpacity
                key={expedition.id}
                onPress={() => setSelectedExpeditionId(expedition.id)}
                style={[
                  styles.selectorOption,
                  selectedExpeditionId === expedition.id && styles.selectorOptionSelected,
                ]}
              >
                <Text style={styles.selectorText}>{expedition.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.capacityRow}>
            <View style={styles.capacityField}>
              <Text style={styles.label}>Max Weight (kg)</Text>
              <TextInput
                style={styles.input}
                value={capacityWeight}
                onChangeText={setCapacityWeight}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.capacityField}>
              <Text style={styles.label}>Max Volume (m³)</Text>
              <TextInput
                style={styles.input}
                value={capacityVolume}
                onChangeText={setCapacityVolume}
                keyboardType="numeric"
              />
            </View>
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={handleOptimize} disabled={optimizing || !selectedExpeditionId}>
            {optimizing ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Optimize Load</Text>}
          </TouchableOpacity>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Weight</Text>
              <Text style={styles.summaryValue}>{totalWeight.toFixed(1)} kg</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Volume</Text>
              <Text style={styles.summaryValue}>{totalVolume.toFixed(2)} m³</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Selected Items</Text>
              <Text style={styles.summaryValue}>{selectedItemCount}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Priority Score</Text>
              <Text style={styles.summaryValue}>{priorityScore}</Text>
            </View>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.detailText}>Remaining Weight: {remainingWeight.toFixed(1)} kg</Text>
            <Text style={styles.detailText}>Remaining Volume: {remainingVolume.toFixed(2)} m³</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Expedition Requirements / Inventory</Text>
          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 12 }} />
          ) : requirements.length === 0 ? (
            <Text style={styles.emptyText}>No supplies are linked to this expedition yet.</Text>
          ) : (
            requirements.map((item) => {
              const selectedQty = Number(selectedQuantities[item.id] ?? 0);
              const totalWeightForItem = (Number(item.weight_per_unit) * selectedQty).toFixed(1);
              const totalVolumeForItem = (Number(item.volume_per_unit) * selectedQty).toFixed(2);

              return (
                <View key={item.id} style={styles.requirementRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.requirementHeader}>
                      <Text style={styles.requirementName}>{item.supply_name}</Text>
                      <View style={[styles.priorityBadge, { backgroundColor: `${getPriorityColor(item.priority ?? 'Medium')}22` }]}>
                        <Text style={[styles.priorityText, { color: getPriorityColor(item.priority ?? 'Medium') }]}>{item.priority ?? 'Medium'}</Text>
                      </View>
                    </View>
                    <Text style={styles.metaText}>Required: {item.quantity} {item.unit} · Available: {item.available_quantity}</Text>
                    <Text style={styles.metaText}>Weight / Unit: {Number(item.weight_per_unit).toFixed(2)} kg</Text>
                    <Text style={styles.metaText}>Volume / Unit: {Number(item.volume_per_unit).toFixed(3)} m³</Text>
                    <Text style={styles.metaText}>Priority Value: {Number(item.priority_value)}</Text>
                  </View>

                  <View style={styles.qtyControl}>
                    <Text style={styles.qtyLabel}>Select</Text>
                    <TextInput
                      style={styles.qtyInput}
                      value={String(selectedQty)}
                      keyboardType="numeric"
                      editable={isWriteAllowed}
                      onChangeText={(text) => handleQuantityChange(item.id, Number(text || 0))}
                    />
                    <Text style={styles.totalText}>{totalWeightForItem} kg / {totalVolumeForItem} m³</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Pack Manifest</Text>
          <Text style={styles.label}>Manifest Title</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} />

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handlePackManifest}
            disabled={packing || !isWriteAllowed || selectedManifestItems.length === 0 || remainingWeight < 0 || remainingVolume < 0}
          >
            {packing ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Pack</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Saved Cargo Manifest</Text>
          {savedManifests.length === 0 ? (
            <Text style={styles.emptyText}>No manifest has been packed yet.</Text>
          ) : (
            savedManifests.map((manifest) => (
              <View key={manifest.id} style={styles.manifestCard}>
                <View style={styles.manifestHeader}>
                  <Text style={styles.manifestTitle}>{manifest.title}</Text>
                  <Text style={styles.manifestStatus}>{manifest.status}</Text>
                </View>
                <Text style={styles.metaText}>Shipment: {manifest.shipment_code}</Text>
                <Text style={styles.metaText}>Weight: {manifest.total_weight_kg} kg | Volume: {manifest.total_volume_m3} m³</Text>
                <Text style={styles.metaText}>Items Selected: {manifest.selected_item_count} | Priority: {manifest.total_priority_value}</Text>
                {manifest.items.map((item, index) => (
                  <Text key={`${manifest.id}-${index}`} style={styles.itemText}>{item.supply_name} × {item.quantity}</Text>
                ))}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm, color: colors.text },
  scrollContent: { paddingHorizontal: spacing.md, paddingBottom: 80, gap: spacing.md },
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text },
  label: { fontFamily: typography.fontFamily.bold, fontSize: 12, color: colors.secondaryText },
  selectorBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectorOption: {
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  selectorOptionSelected: { backgroundColor: colors.primaryIce, borderColor: colors.primary },
  selectorText: { fontFamily: typography.fontFamily.medium, fontSize: 12, color: colors.text },
  capacityRow: { flexDirection: 'row', gap: spacing.sm },
  capacityField: { flex: 1 },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.button,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    color: colors.text,
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonText: { color: colors.white, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryCard: {
    width: '48%',
    backgroundColor: colors.background,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.sm,
  },
  summaryLabel: { fontFamily: typography.fontFamily.medium, fontSize: 11, color: colors.secondaryText },
  summaryValue: { fontFamily: typography.fontFamily.bold, fontSize: 18, color: colors.text, marginTop: 4 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  detailText: { fontFamily: typography.fontFamily.medium, fontSize: 12, color: colors.secondaryText },
  requirementRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  requirementHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  requirementName: { fontFamily: typography.fontFamily.bold, fontSize: 13, color: colors.text, flexShrink: 1 },
  metaText: { fontFamily: typography.fontFamily.medium, fontSize: 11, color: colors.secondaryText, marginTop: 2 },
  qtyControl: { width: 110, alignItems: 'flex-end' },
  qtyLabel: { fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.secondaryText },
  qtyInput: {
    width: '100%',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.button,
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: 'center',
    color: colors.text,
    marginTop: 4,
  },
  totalText: { fontFamily: typography.fontFamily.medium, fontSize: 10, color: colors.secondaryText, marginTop: 4 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  priorityText: { fontFamily: typography.fontFamily.bold, fontSize: 10 },
  emptyText: { color: colors.secondaryText, textAlign: 'center', paddingVertical: 8 },
  manifestCard: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.sm,
    gap: 4,
  },
  manifestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  manifestTitle: { fontFamily: typography.fontFamily.bold, fontSize: 13, color: colors.text },
  manifestStatus: { fontFamily: typography.fontFamily.bold, fontSize: 10, color: colors.primary },
  itemText: { fontFamily: typography.fontFamily.medium, fontSize: 11, color: colors.secondaryText },
});
