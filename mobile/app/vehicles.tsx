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
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Header from '../components/Header';
import { useApp } from '../context/AppContext';
import { colors, spacing, radius, typography } from '../theme';
import { BACKEND_URL } from '../config';

interface Vehicle {
  id: number;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  status: string;
  weather_limit: string;
  station_name: string;
  assigned_expedition_id: number | null;
  assigned_expedition_name: string | null;
  requested_expedition_id: number | null;
  requested_expedition_name: string | null;
  request_status: string | null;
  is_active: boolean;
}

interface Expedition {
  id: number;
  name: string;
  status: string;
  station_name: string;
}

const VEHICLE_TYPES = [
  'Sno-Cat',
  'Helicopter',
  'Quad Bike',
  'Snowmobile',
  'Tractor',
  'Truck',
  'Utility Vehicle',
  'Boat',
];

const STATIONS = [
  { name: 'Maitri', label: 'Maitri Station', latitude: -70.7660, longitude: 11.7330 },
  { name: 'Bharati', label: 'Bharati Station', latitude: -69.4070, longitude: 76.1910 },
  { name: 'Dakshin Gangotri', label: 'Dakshin Gangotri Station', latitude: -70.7500, longitude: 11.6333 },
];

const WEATHER_LIMITS: Record<string, string> = {
  'Sno-Cat': '80 km/h',
  Helicopter: '60 km/h',
  'Quad Bike': '50 km/h',
  Snowmobile: '60 km/h',
  Tractor: '50 km/h',
  Truck: '70 km/h',
  'Utility Vehicle': '60 km/h',
  Boat: '40 km/h',
};

const VEHICLE_STATUSES = ['Available', 'In Use', 'Maintenance', 'Unavailable'];

export default function VehiclesScreen() {
  const router = useRouter();
  const { token, user } = useApp();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingVehicleId, setEditingVehicleId] = useState<number | null>(null);
  const [expeditions, setExpeditions] = useState<Expedition[]>([]);
  const [selectedExpeditionId, setSelectedExpeditionId] = useState<number | null>(null);
  const [showExpeditionOptions, setShowExpeditionOptions] = useState<boolean>(false);
  const [statusMenuVehicleId, setStatusMenuVehicleId] = useState<number | null>(null);

  // Form State
  const [name, setName] = useState<string>('');
  const [type, setType] = useState<string>('Sno-Cat');
  const [stationName, setStationName] = useState<string>('Maitri');
  const [openDropdown, setOpenDropdown] = useState<'type' | 'station' | null>(null);
  const selectedStation = STATIONS.find((station) => station.name === stationName) || STATIONS[0];
  const weatherLimit = WEATHER_LIMITS[type];

  const isBaseAdmin = user?.role === 'Base Admin';
  const isLogisticsOfficer = user?.role === 'Logistics Officer';
  const isExpeditionLeader = user?.role === 'Expedition Leader';
  const isTeamMember = user?.role === 'Team Member';
  const canUpdateOperationalStatus = isBaseAdmin || isLogisticsOfficer;
  const selectedExpedition = expeditions.find((expedition) => expedition.id === selectedExpeditionId) || null;

  const fetchVehicles = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [vehicleResponse, expeditionResponse] = await Promise.all([
        fetch(`${BACKEND_URL}/vehicles`, { headers }),
        isExpeditionLeader || isLogisticsOfficer ? fetch(`${BACKEND_URL}/expeditions`, { headers }) : Promise.resolve(null),
      ]);
      if (vehicleResponse.ok) {
        setVehicles(await vehicleResponse.json());
      } else if (vehicleResponse.status === 401) {
        Alert.alert('Session expired', 'Sign in again to view the fleet.');
      }
      if (expeditionResponse?.ok) {
        const expeditionData: Expedition[] = await expeditionResponse.json();
        setExpeditions(expeditionData);
        const active = expeditionData.find((expedition) => expedition.status === 'Active');
        setSelectedExpeditionId((current) => current || active?.id || expeditionData[0]?.id || null);
      }
    } catch (e) {
      console.log('Error fetching vehicles:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicles();
  }, [token, user?.role]);

  const handleSaveVehicle = async () => {
    if (!token || !isBaseAdmin) {
      setFormError('Sign in as a Base Admin to add or edit vehicles.');
      return;
    }
    if (!name.trim()) {
      setFormError('Enter a vehicle name before saving.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    const vehiclePayload = {
      name: name.trim(),
      type,
      station_name: selectedStation.name,
      weather_limit: weatherLimit,
      latitude: selectedStation.latitude,
      longitude: selectedStation.longitude,
    };
    try {
      const response = await fetch(
        editingVehicleId === null ? `${BACKEND_URL}/vehicles` : `${BACKEND_URL}/vehicles/${editingVehicleId}`,
        {
          method: editingVehicleId === null ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(vehiclePayload),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) throw new Error('Session expired. Sign in again before saving.');
        if (response.status === 403) throw new Error('Only a Base Admin can add or edit vehicles.');
        throw new Error(data.detail || `Could not save vehicle (HTTP ${response.status}).`);
      }
      setShowAddModal(false);
      setEditingVehicleId(null);
      setName('');
      await fetchVehicles();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save vehicle.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (vehicle: Vehicle, nextStatus: string) => {
    if (!token) return;
    setStatusMenuVehicleId(null);
    try {
      const response = await fetch(`${BACKEND_URL}/vehicles/${vehicle.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || `Status update failed (${response.status}).`);
      }
      await fetchVehicles();
    } catch (error) {
      Alert.alert('Could not update status', error instanceof Error ? error.message : 'Try again.');
    }
  };

  const handleVehicleRequest = async (vehicle: Vehicle) => {
    if (!token || !selectedExpeditionId) return;
    try {
      const response = await fetch(`${BACKEND_URL}/vehicles/${vehicle.id}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ expedition_id: selectedExpeditionId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || `Vehicle request failed (${response.status}).`);
      }
      await fetchVehicles();
      Alert.alert('Vehicle requested', 'Logistics can review and assign this vehicle.');
    } catch (error) {
      Alert.alert('Could not request vehicle', error instanceof Error ? error.message : 'Try again.');
    }
  };

  const handleAssignVehicle = async (vehicle: Vehicle) => {
    if (!token || !selectedExpeditionId) return;
    try {
      const response = await fetch(`${BACKEND_URL}/vehicles/${vehicle.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ expedition_id: vehicle.requested_expedition_id || selectedExpeditionId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || `Vehicle assignment failed (${response.status}).`);
      }
      await fetchVehicles();
    } catch (error) {
      Alert.alert('Could not assign vehicle', error instanceof Error ? error.message : 'Try again.');
    }
  };

  const handleDeactivateVehicle = async (vehicle: Vehicle) => {
    if (!token || !isBaseAdmin) return;
    try {
      const response = await fetch(`${BACKEND_URL}/vehicles/${vehicle.id}/deactivate`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || `Vehicle deactivation failed (${response.status}).`);
      }
      await fetchVehicles();
    } catch (error) {
      Alert.alert('Could not deactivate vehicle', error instanceof Error ? error.message : 'Try again.');
    }
  };

  const openEditVehicle = (vehicle: Vehicle) => {
    setName(vehicle.name);
    setType(VEHICLE_TYPES.includes(vehicle.type) ? vehicle.type : 'Sno-Cat');
    setStationName(STATIONS.find((station) => station.name === vehicle.station_name)?.name || 'Maitri');
    setEditingVehicleId(vehicle.id);
    setFormError(null);
    setShowAddModal(true);
  };

  const isWriteAllowed = Boolean(token) && isBaseAdmin;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Fleet & Vehicles" />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={20} color={colors.text} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        {isWriteAllowed ? (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => {
              setFormError(null);
              setName('');
              setShowAddModal(true);
            }}
          >
            <MaterialIcons name="add" size={18} color={colors.white} />
            <Text style={styles.addBtnText}>Add Vehicle</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primaryIce, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.button, borderWidth: 1, borderColor: colors.cardBorder }}>
            <MaterialIcons name={isExpeditionLeader ? 'assignment' : isLogisticsOfficer ? 'local-shipping' : 'visibility'} size={14} color={colors.primary} />
            <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.primary }}>
              {isExpeditionLeader ? 'Request Fleet' : isLogisticsOfficer ? 'Fleet Operations' : isTeamMember ? 'Assigned Fleet' : 'View Only'}
            </Text>
          </View>
        )}
      </View>

      {(isExpeditionLeader || isLogisticsOfficer) ? (
        <View style={styles.expeditionSelector}>
          <Text style={styles.detailLabel}>{isExpeditionLeader ? 'Request vehicle for expedition' : 'Assign vehicle to expedition'}</Text>
          <TouchableOpacity
            style={styles.dropdownButton}
            onPress={() => setShowExpeditionOptions((visible) => !visible)}
            accessibilityRole="button"
          >
            <Text style={styles.dropdownValue}>{selectedExpedition?.name || 'Select expedition'}</Text>
            <MaterialIcons name={showExpeditionOptions ? 'expand-less' : 'expand-more'} size={22} color={colors.secondaryText} />
          </TouchableOpacity>
          {showExpeditionOptions ? (
            <View style={styles.dropdownOptions}>
              {expeditions.map((expedition) => (
                <TouchableOpacity
                  key={expedition.id}
                  style={[styles.dropdownOption, expedition.id === selectedExpeditionId && styles.dropdownOptionSelected]}
                  onPress={() => {
                    setSelectedExpeditionId(expedition.id);
                    setShowExpeditionOptions(false);
                  }}
                >
                  <Text style={styles.dropdownOptionText}>{expedition.name} • {expedition.station_name} • {expedition.status}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.vehicleName}>{item.name}</Text>
                  <Text style={styles.vehicleType}>{item.type} • {item.station_name}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: item.is_active === false ? '#E2E8F0' : item.status === 'Available' ? colors.okGreen + '20' : item.status === 'In Use' ? colors.accentOrange + '20' : item.status === 'Maintenance' ? colors.warningAmber + '20' : colors.dangerRed + '15' }]}>
                  <Text
                    style={[
                      styles.statusText,
                      {
                        color: item.is_active === false ? colors.secondaryText : item.status === 'Available' ? colors.okGreen : item.status === 'In Use' ? colors.accentOrange : item.status === 'Maintenance' ? colors.warningAmber : colors.dangerRed,
                      },
                    ]}
                  >
                    {item.is_active === false ? 'Deactivated' : item.status}
                  </Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Weather Limit:</Text>
                <Text style={styles.detailVal}>{item.weather_limit}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Location:</Text>
                <Text style={styles.detailVal}>
                  ({item.latitude.toFixed(4)}, {item.longitude.toFixed(4)})
                </Text>
              </View>
              {item.assigned_expedition_name ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Assigned Expedition:</Text>
                  <Text style={styles.detailVal}>{item.assigned_expedition_name}</Text>
                </View>
              ) : null}
              {item.request_status === 'Requested' ? (
                <View style={styles.detailRow}>
                  <Text style={styles.requestNotice}>Requested for {item.requested_expedition_name || 'expedition'}</Text>
                </View>
              ) : null}

              {!isTeamMember && item.is_active !== false ? (
                <View style={styles.cardActions}>
                  {isBaseAdmin ? (
                    <>
                      <TouchableOpacity style={styles.secondaryAction} onPress={() => openEditVehicle(item)}>
                        <MaterialIcons name="edit" size={16} color={colors.primary} />
                        <Text style={styles.secondaryActionText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.secondaryAction} onPress={() => handleDeactivateVehicle(item)}>
                        <MaterialIcons name="archive" size={16} color={colors.dangerRed} />
                        <Text style={[styles.secondaryActionText, { color: colors.dangerRed }]}>Deactivate</Text>
                      </TouchableOpacity>
                    </>
                  ) : null}
                  {canUpdateOperationalStatus ? (
                    <TouchableOpacity style={styles.secondaryAction} onPress={() => setStatusMenuVehicleId(statusMenuVehicleId === item.id ? null : item.id)}>
                      <MaterialIcons name="sync-alt" size={16} color={colors.primary} />
                      <Text style={styles.secondaryActionText}>Change Status</Text>
                    </TouchableOpacity>
                  ) : null}
                  {isLogisticsOfficer && selectedExpedition && item.request_status === 'Requested' ? (
                    <TouchableOpacity style={styles.primaryAction} onPress={() => handleAssignVehicle(item)}>
                      <Text style={styles.primaryActionText}>Assign Requested Vehicle</Text>
                    </TouchableOpacity>
                  ) : null}
                  {isLogisticsOfficer && selectedExpedition && item.status === 'Available' && item.request_status !== 'Requested' ? (
                    <TouchableOpacity style={styles.primaryAction} onPress={() => handleAssignVehicle(item)}>
                      <Text style={styles.primaryActionText}>Assign to Expedition</Text>
                    </TouchableOpacity>
                  ) : null}
                  {isExpeditionLeader && selectedExpedition && item.status === 'Available' ? (
                    <TouchableOpacity
                      style={[styles.primaryAction, item.request_status === 'Requested' && item.requested_expedition_id === selectedExpedition.id && styles.pendingAction]}
                      disabled={item.request_status === 'Requested' && item.requested_expedition_id === selectedExpedition.id}
                      onPress={() => handleVehicleRequest(item)}
                    >
                      <Text style={styles.primaryActionText}>
                        {item.request_status === 'Requested' && item.requested_expedition_id === selectedExpedition.id ? 'Request Pending' : 'Request Vehicle'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
              {statusMenuVehicleId === item.id ? (
                <View style={styles.statusOptions}>
                  {VEHICLE_STATUSES.map((vehicleStatus) => (
                    <TouchableOpacity
                      key={vehicleStatus}
                      style={[styles.statusOption, item.status === vehicleStatus && styles.dropdownOptionSelected]}
                      onPress={() => handleStatusChange(item, vehicleStatus)}
                    >
                      <Text style={styles.dropdownOptionText}>{vehicleStatus}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No vehicles currently registered in fleet.</Text>
          }
        />
      )}

      {/* Add Vehicle Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingVehicleId === null ? 'Add Fleet Vehicle' : 'Edit Fleet Vehicle'}</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <MaterialIcons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {formError ? (
              <View style={styles.formErrorBox}>
                <MaterialIcons name="error-outline" size={18} color={colors.dangerRed} />
                <Text style={styles.formErrorText}>{formError}</Text>
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>Vehicle Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Sno-Cat Alpha" />

            <Text style={styles.fieldLabel}>Vehicle Type</Text>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => setOpenDropdown(openDropdown === 'type' ? null : 'type')}
              accessibilityRole="button"
              accessibilityLabel={`Vehicle type: ${type}`}
            >
              <Text style={styles.dropdownValue}>{type}</Text>
              <MaterialIcons name={openDropdown === 'type' ? 'expand-less' : 'expand-more'} size={22} color={colors.secondaryText} />
            </TouchableOpacity>
            {openDropdown === 'type' ? (
              <View style={styles.dropdownOptions}>
                {VEHICLE_TYPES.map((vehicleType) => (
                  <TouchableOpacity
                    key={vehicleType}
                    style={[styles.dropdownOption, type === vehicleType && styles.dropdownOptionSelected]}
                    onPress={() => {
                      setType(vehicleType);
                      setOpenDropdown(null);
                    }}
                  >
                    <Text style={[styles.dropdownOptionText, type === vehicleType && styles.dropdownOptionTextSelected]}>
                      {vehicleType}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>Station Name</Text>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => setOpenDropdown(openDropdown === 'station' ? null : 'station')}
              accessibilityRole="button"
              accessibilityLabel={`Station: ${selectedStation.label}`}
            >
              <Text style={styles.dropdownValue}>{selectedStation.label}</Text>
              <MaterialIcons name={openDropdown === 'station' ? 'expand-less' : 'expand-more'} size={22} color={colors.secondaryText} />
            </TouchableOpacity>
            {openDropdown === 'station' ? (
              <View style={styles.dropdownOptions}>
                {STATIONS.map((station) => (
                  <TouchableOpacity
                    key={station.name}
                    style={[styles.dropdownOption, stationName === station.name && styles.dropdownOptionSelected]}
                    onPress={() => {
                      setStationName(station.name);
                      setOpenDropdown(null);
                    }}
                  >
                    <Text style={[styles.dropdownOptionText, stationName === station.name && styles.dropdownOptionTextSelected]}>
                      {station.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>Weather Limit</Text>
            <View style={styles.readOnlyValue}>
              <Text style={styles.readOnlyText}>{weatherLimit}</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Latitude</Text>
                <View style={styles.readOnlyValue}>
                  <Text style={styles.readOnlyText}>{selectedStation.latitude.toFixed(4)}</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Longitude</Text>
                <View style={styles.readOnlyValue}>
                  <Text style={styles.readOnlyText}>{selectedStation.longitude.toFixed(4)}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
              onPress={handleSaveVehicle}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitBtnText}>SAVE VEHICLE</Text>}
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
  listContent: { padding: spacing.md, gap: spacing.sm, paddingBottom: 60 },
  expeditionSelector: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    gap: spacing.xs,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vehicleName: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text },
  vehicleType: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, color: colors.secondaryText },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontFamily: typography.fontFamily.bold, fontSize: 11 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  detailLabel: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, color: colors.secondaryText },
  detailVal: { fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.xs, color: colors.text },
  requestNotice: { fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.xs, color: colors.accentOrange },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.button,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  secondaryActionText: { fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.primary },
  primaryAction: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pendingAction: { backgroundColor: colors.secondaryText },
  primaryActionText: { fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.white },
  statusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingTop: spacing.xs },
  statusOption: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.button,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  emptyText: { textAlign: 'center', marginTop: 40, fontFamily: typography.fontFamily.regular, color: colors.secondaryText },
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
  dropdownButton: {
    minHeight: 40,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.button,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownValue: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    color: colors.text,
  },
  dropdownOptions: {
    maxHeight: 220,
    overflow: 'scroll',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.default,
    backgroundColor: colors.card,
  },
  dropdownOption: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  dropdownOptionSelected: {
    backgroundColor: colors.primaryIce,
  },
  dropdownOptionText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    color: colors.text,
  },
  dropdownOptionTextSelected: {
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
  },
  readOnlyValue: {
    minHeight: 40,
    justifyContent: 'center',
    backgroundColor: colors.primaryIce,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.button,
    paddingHorizontal: spacing.sm,
  },
  readOnlyText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    color: colors.secondaryText,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  submitBtnText: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, color: colors.white, letterSpacing: 0.5 },
  formErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: colors.dangerRed,
    borderRadius: radius.default,
    padding: spacing.sm,
  },
  formErrorText: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    color: colors.dangerRed,
  },
});
