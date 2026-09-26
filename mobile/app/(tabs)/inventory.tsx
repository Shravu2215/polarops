
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
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import Header from '../../components/Header';
import { useApp } from '../../context/AppContext';
import { colors, spacing, radius, typography } from '../../theme';
import { BACKEND_URL } from '../../config';

import { useSyncQueue } from '../../context/SyncContext';

interface StationStockItem {
  id: number;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  min_required: number;
  location_station: string;
}

interface ExpeditionOption {
  id: number;
  name: string;
  station_name: string;
  status: string;
}

interface ExpeditionRequirement {
  id: number;
  expedition_id: number;
  supply_name: string;
  category: string;
  quantity: number;
  unit: string;
  status: string;
  created_at: string;
}

interface ShipmentItem {
  id: number;
  expedition_id: number | null;
  shipment_code: string;
  title: string;
  weight_kg: number;
  volume_m3: number;
  priority: string;
  status: string;
}

import { STANDARD_SUPPLY_CATALOG, SupplyCatalogItem } from '../../constants/supplyCatalog';

export default function InventoryScreen() {
  const { token, user, syncStatus } = useApp();
  const { addToQueue } = useSyncQueue();
  const isLeader = user?.role === 'Expedition Leader';
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [stationStock, setStationStock] = useState<StationStockItem[]>([]);
  const [expeditions, setExpeditions] = useState<ExpeditionOption[]>([]);
  const [selectedExpeditionId, setSelectedExpeditionId] = useState<number | null>(null);
  const [catalogItems, setCatalogItems] = useState<SupplyCatalogItem[]>([]);
  const [selectedRequirementSupply, setSelectedRequirementSupply] = useState<SupplyCatalogItem | null>(null);
  const [requirements, setRequirements] = useState<ExpeditionRequirement[]>([]);
  const [shipments, setShipments] = useState<ShipmentItem[]>([]);
  const [requiredQuantity, setRequiredQuantity] = useState<string>('');
  const [showCatalogModal, setShowCatalogModal] = useState<boolean>(false);
  const [operationsLoading, setOperationsLoading] = useState<boolean>(true);
  const [requirementsLoading, setRequirementsLoading] = useState<boolean>(false);
  const [requirementSubmitting, setRequirementSubmitting] = useState<boolean>(false);
  const [operationsError, setOperationsError] = useState<string | null>(null);

  // Form State - Auto-filled from Supply Catalog
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<SupplyCatalogItem>(STANDARD_SUPPLY_CATALOG[0]);
  const [quantity, setQuantity] = useState<string>('100');
  const [minReq, setMinReq] = useState<string>('20');
  const [dailyUse, setDailyUse] = useState<string>(STANDARD_SUPPLY_CATALOG[0].default_daily_use.toString());
  const [sensitivity, setSensitivity] = useState<string>(STANDARD_SUPPLY_CATALOG[0].cold_sensitivity.toString());
  const [stationName, setStationName] = useState<string>(user?.station_name || 'Maitri');

  const handleSelectCatalogItem = (item: SupplyCatalogItem) => {
    setSelectedCatalogItem(item);
    setDailyUse(item.default_daily_use.toString());
    setSensitivity(item.cold_sensitivity.toString());
  };

  const fetchExpeditionRequirements = async (expeditionId: number) => {
    if (!token) return;

    setRequirementsLoading(true);
    try {
      const response = await fetch(
        `${BACKEND_URL}/expedition-requirements?expedition_id=${expeditionId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) {
        throw new Error(`Requirements request failed (${response.status})`);
      }
      const result: ExpeditionRequirement[] = await response.json();
      setRequirements(result);
    } catch (error) {
      setOperationsError(error instanceof Error ? error.message : 'Unable to load expedition requirements.');
    } finally {
      setRequirementsLoading(false);
    }
  };

  const fetchOperationalData = async () => {
    if (!token) {
      setOperationsLoading(false);
      return;
    }

    setOperationsLoading(true);
    setOperationsError(null);
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const [inventoryResponse, catalogResponse, cargoResponse, expeditionResponse] = await Promise.all([
        fetch(`${BACKEND_URL}/inventory`, { headers }),
        fetch(`${BACKEND_URL}/supply-catalog`, { headers }),
        fetch(`${BACKEND_URL}/cargo`, { headers }),
        fetch(`${BACKEND_URL}/expeditions`, { headers }),
      ]);
      const failedResponse = [inventoryResponse, catalogResponse, cargoResponse, expeditionResponse]
        .find((response) => !response.ok);
      if (failedResponse) {
        throw new Error(`Inventory data request failed (${failedResponse.status})`);
      }

      const [stockResult, catalogResult, shipmentResult, expeditionResult] = await Promise.all([
        inventoryResponse.json() as Promise<StationStockItem[]>,
        catalogResponse.json() as Promise<SupplyCatalogItem[]>,
        cargoResponse.json() as Promise<ShipmentItem[]>,
        expeditionResponse.json() as Promise<ExpeditionOption[]>,
      ]);
      setStationStock(stockResult);
      setCatalogItems(catalogResult);
      setShipments(shipmentResult);
      setExpeditions(expeditionResult);
      setSelectedRequirementSupply((current) =>
        current && catalogResult.some((item) => item.name === current.name)
          ? current
          : catalogResult[0] || null
      );

      const selectedExpedition = expeditionResult.find((item) => item.id === selectedExpeditionId)
        || expeditionResult.find((item) => item.status === 'Active')
        || expeditionResult[0];
      setSelectedExpeditionId(selectedExpedition?.id ?? null);
      if (selectedExpedition && isLeader) {
        await fetchExpeditionRequirements(selectedExpedition.id);
      } else {
        setRequirements([]);
      }
    } catch (error) {
      setOperationsError(error instanceof Error ? error.message : 'Unable to load station operations data.');
    } finally {
      setOperationsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (token) {
      void fetchOperationalData();
    }
  }, [token]);

  const handleSelectExpedition = (expeditionId: number) => {
    setSelectedExpeditionId(expeditionId);
    setRequirements([]);
    setOperationsError(null);
    void fetchExpeditionRequirements(expeditionId);
  };

  const handleCreateRequirement = async () => {
    const amount = Number(requiredQuantity);
    if (!selectedExpeditionId || !selectedRequirementSupply || !Number.isFinite(amount) || amount <= 0) {
      setOperationsError('Choose an expedition and catalog supply, then enter a quantity greater than zero.');
      return;
    }

    setRequirementSubmitting(true);
    setOperationsError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/expedition-requirements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          expedition_id: selectedExpeditionId,
          supply_name: selectedRequirementSupply.name,
          quantity: amount,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Supply request failed (${response.status})`);
      }

      setRequiredQuantity('');
      await fetchExpeditionRequirements(selectedExpeditionId);
      Alert.alert('Supply Request Saved', 'The expedition requirement is now available to station operations.');
    } catch (error) {
      setOperationsError(error instanceof Error ? error.message : 'Unable to submit supply request.');
    } finally {
      setRequirementSubmitting(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    void fetchOperationalData();
  };

  const handleAddStock = async () => {
    if (!selectedCatalogItem) {
      Alert.alert('Validation Error', 'Please select a catalog item.');
      return;
    }

    setSubmitting(true);
    const itemPayload = {
      name: selectedCatalogItem.name,
      category: selectedCatalogItem.category,
      quantity: parseFloat(quantity) || 0,
      unit: selectedCatalogItem.unit,
      min_required: parseFloat(minReq) || 0,
      daily_use_per_person: parseFloat(dailyUse) || selectedCatalogItem.default_daily_use,
      location_station: stationName.trim() || user?.station_name || 'Maitri',
      cold_factor_sensitivity: parseFloat(sensitivity) || selectedCatalogItem.cold_sensitivity,
    };

    if (syncStatus === 'Offline') {
      await addToQueue('inventory_create', itemPayload, 2, '/inventory', 'POST');
      Alert.alert('Saved to Queue', 'Item saved on device. It will be synced when connected.');
      setShowAddModal(false);
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
      void fetchOperationalData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add inventory item.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedExpedition = expeditions.find((item) => item.id === selectedExpeditionId) || null;
  const selectedStationName = selectedExpedition?.station_name.trim().toLowerCase();
  const stationStockItems = stationStock.filter((item) => {
    const stockStationName = (item.location_station || '').trim().toLowerCase();
    return !stockStationName || stockStationName === selectedStationName;
  });
  const selectedRequirements = requirements.filter(
    (item) => item.expedition_id === selectedExpeditionId
  );
  const incomingShipments = shipments.filter(
    (item) => item.expedition_id === selectedExpeditionId
      && ['In-Transit', 'Delivered'].includes(item.status)
  );


  const isBaseAdmin = user?.role === 'Base Admin';
  const isWriteAllowed = isBaseAdmin;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Inventory Operations" />

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
        {operationsError ? (
          <View style={{ backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: colors.dangerRed, borderRadius: radius.default, padding: spacing.sm }}>
            <Text style={{ fontFamily: typography.fontFamily.medium, fontSize: 12, color: colors.dangerRed }}>
              {operationsError}
            </Text>
          </View>
        ) : null}

        {isLeader && (
          <View style={{ gap: spacing.xs }}>
              <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text }}>
                Selected Expedition
              </Text>
              {expeditions.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
                  {expeditions.map((expedition) => {
                    const isSelected = selectedExpeditionId === expedition.id;
                    return (
                      <TouchableOpacity
                        key={expedition.id}
                        onPress={() => handleSelectExpedition(expedition.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${expedition.name}, ${expedition.status}`}
                        style={{
                          minWidth: 180,
                          maxWidth: 260,
                          backgroundColor: isSelected ? colors.primaryIce : colors.card,
                          borderWidth: 1,
                          borderColor: isSelected ? colors.primary : colors.cardBorder,
                          borderRadius: radius.default,
                          padding: spacing.sm,
                        }}
                      >
                        <Text numberOfLines={1} style={{ fontFamily: typography.fontFamily.bold, fontSize: 12, color: colors.text }}>
                          {expedition.name}
                        </Text>
                        <Text style={{ fontFamily: typography.fontFamily.regular, fontSize: 10, color: colors.secondaryText, marginTop: 3 }}>
                          {expedition.station_name} | {expedition.status}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : operationsLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.emptySub}>No expeditions are available for supply planning.</Text>
              )}
          </View>
        )}

        <View style={styles.sectionCard}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Station Stock</Text>
                  <Text style={styles.sectionSubtitle}>
                    {selectedExpedition?.station_name || user?.station_name || 'Station'} | Current backend quantities
                  </Text>
                </View>
                {isWriteAllowed ? (
                  <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
                    <MaterialIcons name="add" size={18} color={colors.white} />
                    <Text style={styles.addBtnText}>Add Stock</Text>
                  </TouchableOpacity>
                ) : (
                  <MaterialIcons name="inventory-2" size={22} color={colors.primary} />
                )}
              </View>
              {operationsLoading && stationStock.length === 0 ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : stationStockItems.length > 0 ? stationStockItems.map((item) => {
                const isLowStock = item.quantity <= item.min_required;
                return (
                  <View key={item.id} style={{
                    backgroundColor: colors.background,
                    borderWidth: 1,
                    borderColor: colors.cardBorder,
                    borderRadius: radius.default,
                    padding: spacing.sm,
                    gap: 4,
                  }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.xs }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemCategory}>
                          {item.category} | {item.location_station?.trim() || 'Station not recorded'}
                        </Text>
                      </View>
                      <View style={{
                        backgroundColor: isLowStock ? '#FEF2F2' : '#DCFCE7',
                        paddingHorizontal: spacing.xs,
                        paddingVertical: 3,
                        borderRadius: radius.pill,
                      }}>
                        <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 10, color: isLowStock ? colors.dangerRed : colors.okGreen }}>
                          {isLowStock ? 'LOW STOCK' : 'IN STOCK'}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.xs }}>
                      <Text style={{ fontFamily: typography.fontFamily.medium, fontSize: 11, color: colors.text }}>
                        Available: {item.quantity} {item.unit}
                      </Text>
                      <Text style={{ fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.secondaryText }}>
                        Minimum: {item.min_required} {item.unit}
                      </Text>
                    </View>
                  </View>
                );
              }) : (
                <Text style={styles.emptySub}>
                  {`No station stock is recorded for ${selectedExpedition?.station_name || user?.station_name || 'this station'}.`}
                </Text>
              )}
            </View>

        {isLeader && (
          <>
            <View style={styles.sectionCard}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.sectionTitle}>My Expedition Requirements</Text>
                  <Text style={styles.sectionSubtitle}>Saved supply requests for the selected expedition</Text>
                </View>
                <MaterialIcons name="assignment" size={22} color={colors.primary} />
              </View>
              {requirementsLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : selectedRequirements.length > 0 ? selectedRequirements.map((requirement) => (
                <View key={requirement.id} style={{
                  backgroundColor: colors.background,
                  borderWidth: 1,
                  borderColor: colors.cardBorder,
                  borderRadius: radius.default,
                  padding: spacing.sm,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: spacing.xs,
                }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 12, color: colors.text }}>
                      {requirement.supply_name}
                    </Text>
                    <Text style={styles.itemCategory}>{requirement.category}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 12, color: colors.text }}>
                      {requirement.quantity} {requirement.unit}
                    </Text>
                    <Text style={{ fontFamily: typography.fontFamily.medium, fontSize: 10, color: colors.accentOrange }}>
                      {requirement.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
              )) : (
                <Text style={styles.emptySub}>No requirements have been requested for this expedition.</Text>
              )}
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Incoming Shipments</Text>
                  <Text style={styles.sectionSubtitle}>Linked to the selected expedition</Text>
                </View>
                <MaterialIcons name="local-shipping" size={22} color={colors.accentOrange} />
              </View>
              {incomingShipments.length > 0 ? incomingShipments.map((shipment) => (
                <View key={shipment.id} style={{
                  backgroundColor: colors.background,
                  borderWidth: 1,
                  borderColor: colors.cardBorder,
                  borderRadius: radius.default,
                  padding: spacing.sm,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: spacing.xs,
                }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 12, color: colors.text }}>
                      {shipment.title}
                    </Text>
                    <Text style={styles.itemCategory}>
                      #{shipment.shipment_code} | {shipment.weight_kg} kg | {shipment.priority}
                    </Text>
                  </View>
                  <Text style={{
                    fontFamily: typography.fontFamily.bold,
                    fontSize: 10,
                    color: shipment.status === 'Delivered' ? colors.okGreen : colors.primary,
                  }}>
                    {shipment.status === 'In-Transit' ? 'IN TRANSIT' : 'DELIVERED'}
                  </Text>
                </View>
              )) : (
                <Text style={styles.emptySub}>No in-transit or delivered shipments are linked to this expedition.</Text>
              )}
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Supply Request</Text>
                  <Text style={styles.sectionSubtitle}>Create a requirement for station operations to fulfill</Text>
                </View>
                <MaterialIcons name="add-shopping-cart" size={22} color={colors.primary} />
              </View>
              <Text style={styles.inputLabel}>Supply Catalog</Text>
              <TouchableOpacity
                style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                onPress={() => setShowCatalogModal(true)}
                disabled={catalogItems.length === 0}
              >
                <Text numberOfLines={1} style={{ flex: 1, fontFamily: typography.fontFamily.medium, fontSize: 12, color: colors.text }}>
                  {selectedRequirementSupply?.name || 'Catalog is loading'}
                </Text>
                <MaterialIcons name="arrow-drop-down" size={20} color={colors.secondaryText} />
              </TouchableOpacity>
              {selectedRequirementSupply ? (
                <Text style={styles.itemCategory}>
                  {selectedRequirementSupply.category} | Unit: {selectedRequirementSupply.unit}
                </Text>
              ) : null}
              <Text style={styles.inputLabel}>Required quantity ({selectedRequirementSupply?.unit || 'unit'})</Text>
              <TextInput
                style={styles.input}
                value={requiredQuantity}
                onChangeText={setRequiredQuantity}
                keyboardType="decimal-pad"
                placeholder="Enter required quantity"
              />
              <TouchableOpacity
                style={[styles.submitBtn, (!selectedExpedition || !selectedRequirementSupply || requirementSubmitting) && { opacity: 0.55 }]}
                onPress={() => { void handleCreateRequirement(); }}
                disabled={!selectedExpedition || !selectedRequirementSupply || requirementSubmitting}
              >
                {requirementSubmitting
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.submitBtnText}>SUBMIT SUPPLY REQUEST</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}

      </ScrollView>

      <Modal visible={showCatalogModal} transparent animationType="slide" onRequestClose={() => setShowCatalogModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '82%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Supply Catalog</Text>
              <TouchableOpacity onPress={() => setShowCatalogModal(false)} accessibilityLabel="Close supply catalog">
                <MaterialIcons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {catalogItems.map((item) => (
                <TouchableOpacity
                  key={`${item.category}-${item.name}`}
                  onPress={() => {
                    setSelectedRequirementSupply(item);
                    setShowCatalogModal(false);
                  }}
                  style={{
                    padding: spacing.sm,
                    marginBottom: spacing.xs,
                    backgroundColor: selectedRequirementSupply?.name === item.name ? colors.primaryIce : colors.background,
                    borderWidth: 1,
                    borderColor: selectedRequirementSupply?.name === item.name ? colors.primary : colors.cardBorder,
                    borderRadius: radius.default,
                  }}
                >
                  <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 12, color: colors.text }}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemCategory}>{item.category} | {item.unit}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Stock Item Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={[styles.modalCard, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Station Stock Supply</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <MaterialIcons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* 1. Catalog Dropdown / Selector */}
            <Text style={styles.fieldLabel}>Select Supply from Standard Catalog</Text>
            <ScrollView style={{ maxHeight: 160, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.default, marginBottom: spacing.xs, padding: 4 }}>
              {STANDARD_SUPPLY_CATALOG.map((catItem, idx) => {
                const isSelected = selectedCatalogItem.name === catItem.name;
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => handleSelectCatalogItem(catItem)}
                    style={{
                      padding: spacing.xs,
                      borderRadius: radius.default,
                      backgroundColor: isSelected ? colors.primaryIce : colors.background,
                      marginBottom: 4,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.primary : colors.cardBorder,
                    }}
                  >
                    <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 12, color: colors.text }}>
                      {catItem.name}
                    </Text>
                    <Text style={{ fontFamily: typography.fontFamily.regular, fontSize: 10, color: colors.secondaryText }}>
                      Category: {catItem.category} • Unit: {catItem.unit}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 2. Auto-filled info card */}
            <View style={{
              backgroundColor: colors.background,
              borderRadius: radius.default,
              padding: spacing.xs + 2,
              borderWidth: 1,
              borderColor: colors.cardBorder,
              marginBottom: spacing.xs,
            }}>
              <Text style={{ fontFamily: typography.fontFamily.medium, fontSize: 11, color: colors.secondaryText }}>
                Auto-Filled Catalog Properties:
              </Text>
              <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 12, color: colors.primary, marginTop: 2 }}>
                Category: {selectedCatalogItem.category} | Unit: {selectedCatalogItem.unit}
              </Text>
            </View>

            {/* 3. User inputs: Quantity & Min Required Alert */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Initial Quantity ({selectedCatalogItem.unit})</Text>
                <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="numeric" placeholder="e.g. 500" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Min / Alert Level ({selectedCatalogItem.unit})</Text>
                <TextInput style={styles.input} value={minReq} onChangeText={setMinReq} keyboardType="numeric" placeholder="e.g. 100" />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Daily Use / Person</Text>
                <TextInput style={styles.input} value={dailyUse} onChangeText={setDailyUse} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Cold Sensitivity Multiplier</Text>
                <TextInput style={styles.input} value={sensitivity} onChangeText={setSensitivity} keyboardType="numeric" />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Station Name</Text>
            <TextInput style={styles.input} value={stationName} onChangeText={setStationName} placeholder="Maitri" />

            <TouchableOpacity style={styles.submitBtn} onPress={handleAddStock} disabled={submitting}>
              {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitBtnText}>ADD TO INVENTORY LEDGER</Text>}
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
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text },
  sectionSubtitle: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, color: colors.secondaryText },
  inputLabel: { fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.secondaryText },
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
  itemName: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text },
  itemCategory: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, color: colors.secondaryText },
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
});
