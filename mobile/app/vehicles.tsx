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
}

export default function VehiclesScreen() {
  const router = useRouter();
  const { token, user } = useApp();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Form State
  const [name, setName] = useState<string>('Sno-Cat Alpha');
  const [type, setType] = useState<string>('Sno-Cat');
  const [stationName, setStationName] = useState<string>('Maitri');
  const [status, setStatus] = useState<string>('Available');
  const [weatherLimit, setWeatherLimit] = useState<string>('80 km/h');
  const [lat, setLat] = useState<string>('-70.7660');
  const [lon, setLon] = useState<string>('11.7330');

  const fetchVehicles = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/vehicles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setVehicles(data);
      }
    } catch (e) {
      console.log('Error fetching vehicles:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicles();
  }, []);

  const handleAddVehicle = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Vehicle name is required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/vehicles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          type: type.trim(),
          station_name: stationName.trim(),
          status: status.trim(),
          weather_limit: weatherLimit.trim(),
          latitude: parseFloat(lat) || -70.766,
          longitude: parseFloat(lon) || 11.733,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP status ${res.status}`);
      }

      Alert.alert('Success', 'Vehicle added to station fleet!');
      setShowAddModal(false);
      fetchVehicles();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add vehicle.');
    } finally {
      setSubmitting(false);
    }
  };

  const isWriteAllowed = user?.role !== 'Team Member';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Fleet & Vehicles" />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={20} color={colors.text} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        {isWriteAllowed ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
            <MaterialIcons name="add" size={18} color={colors.white} />
            <Text style={styles.addBtnText}>Add Vehicle</Text>
          </TouchableOpacity>
        ) : null}
      </View>

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
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        item.status === 'Available'
                          ? colors.okGreen + '20'
                          : item.status === 'Dispatched'
                          ? colors.accentOrange + '20'
                          : colors.warningAmber + '20',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      {
                        color:
                          item.status === 'Available'
                            ? colors.okGreen
                            : item.status === 'Dispatched'
                            ? colors.accentOrange
                            : colors.warningAmber,
                      },
                    ]}
                  >
                    {item.status}
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
              <Text style={styles.modalTitle}>Add Fleet Vehicle</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <MaterialIcons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Vehicle Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Sno-Cat Alpha" />

            <Text style={styles.fieldLabel}>Type (Sno-Cat, Helicopter, Quad)</Text>
            <TextInput style={styles.input} value={type} onChangeText={setType} />

            <Text style={styles.fieldLabel}>Station Name</Text>
            <TextInput style={styles.input} value={stationName} onChangeText={setStationName} />

            <Text style={styles.fieldLabel}>Weather Limit</Text>
            <TextInput style={styles.input} value={weatherLimit} onChangeText={setWeatherLimit} placeholder="e.g. 80 km/h" />

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Latitude</Text>
                <TextInput style={styles.input} value={lat} onChangeText={setLat} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Longitude</Text>
                <TextInput style={styles.input} value={lon} onChangeText={setLon} keyboardType="numeric" />
              </View>
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleAddVehicle} disabled={submitting}>
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
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  submitBtnText: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, color: colors.white, letterSpacing: 0.5 },
});
