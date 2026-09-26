import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius, typography, layout } from '../theme';
import { BACKEND_URL } from '../config';
import { useApp } from '../context/AppContext';
import { useSyncQueue } from '../context/SyncContext';
import * as Location from 'expo-location';

interface SOSContext {
  user_id: number;
  person_name: string;
  role: string;
  station_name: string;
  latitude: number | null;
  longitude: number | null;
  expedition_id: number | null;
  expedition_name: string | null;
  expedition_latitude: number | null;
  expedition_longitude: number | null;
}

interface SOSRecord {
  id: number;
  user_id: number;
  person_name: string;
  person_role: string;
  expedition_id: number | null;
  expedition_name: string | null;
  station_name: string;
  latitude: number;
  longitude: number;
  assistance_required: string;
  description: string | null;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESPONDING' | 'RESOLVED';
  created_at: string;
  updated_at: string;
}

export default function SOSScreen() {
  const router = useRouter();
  const { user, token, syncStatus } = useApp();
  const { addToQueue } = useSyncQueue();
  const [selectedSkill, setSelectedSkill] = useState<string>('Medical');
  const [description, setDescription] = useState<string>('');
  const [sosContext, setSosContext] = useState<SOSContext | null>(null);
  const [records, setRecords] = useState<SOSRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatingSosId, setUpdatingSosId] = useState<number | null>(null);
  const submitLock = useRef(false);
  const canBroadcastSOS = Boolean(user && token);
  const canManageSOS = ['Expedition Leader', 'Base Admin', 'Logistics Officer'].includes(user?.role || '');

  const closeSOS = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const fetchSOSData = useCallback(async (isRefresh = false) => {
    if (!token) {
      setLoadingData(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoadingData(true);
    setErrorMessage(null);

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const requests: Promise<Response>[] = [
        fetch(`${BACKEND_URL}/sos`, { headers }),
        fetch(`${BACKEND_URL}/sos/context`, { headers }),
      ];
      const responses = await Promise.all(requests);
      const sosResponse = responses[0];
      if (!sosResponse.ok) {
        const body = await sosResponse.json().catch(() => ({}));
        throw new Error(body.detail || `Unable to load SOS records (${sosResponse.status})`);
      }

      const sosRecords: SOSRecord[] = await sosResponse.json();
      setRecords(sosRecords);
      if (responses[1]?.ok) {
        setSosContext(await responses[1].json());
      } else {
        setSosContext(null);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load emergency records.');
    } finally {
      setLoadingData(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchSOSData();
  }, [fetchSOSData]);

  const handleTriggerSOS = async () => {
    if (submitLock.current || !token) return;
    submitLock.current = true;
    setLoading(true);
    setErrorMessage(null);
    setNotice(null);

    try {
      let coordinates: { latitude: number; longitude: number } | null = null;
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status === 'granted') {
          const currentPosition = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          coordinates = {
            latitude: currentPosition.coords.latitude,
            longitude: currentPosition.coords.longitude,
          };
        }
      } catch (locationError) {
        console.warn('Unable to read current GPS; backend will use the latest saved user location.', locationError);
      }

      const sosPayload: {
        skill_needed: string;
        description: string | null;
        latitude?: number;
        longitude?: number;
      } = {
        skill_needed: selectedSkill,
        description: description.trim() || null,
      };
      if (coordinates) {
        sosPayload.latitude = coordinates.latitude;
        sosPayload.longitude = coordinates.longitude;
      }

      if (syncStatus === 'Offline') {
        await addToQueue('sos', sosPayload, 0, '/sos', 'POST');
        setNotice('SOS saved in the priority sync queue. It will be broadcast when the connection returns.');
        return;
      }

      const idempotencyKey = `sos-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const response = await fetch(`${BACKEND_URL}/sos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(sosPayload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `SOS broadcast failed (${response.status})`);
      }

      const created: SOSRecord = await response.json();
      setDescription('');
      setNotice(`Emergency SOS #${created.id} broadcast successfully.`);
      await fetchSOSData(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to broadcast SOS.');
    } finally {
      submitLock.current = false;
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (sos: SOSRecord, nextStatus: SOSRecord['status']) => {
    if (!token || updatingSosId !== null) return;
    setUpdatingSosId(sos.id);
    setErrorMessage(null);
    try {
      const response = await fetch(`${BACKEND_URL}/sos/${sos.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': `sos-${sos.id}-${nextStatus}-${Date.now()}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `Status update failed (${response.status})`);
      }
      await fetchSOSData(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update SOS status.');
    } finally {
      setUpdatingSosId(null);
    }
  };

  const activeRecords = records.filter((sos) => sos.status !== 'RESOLVED');
  const resolvedRecords = records.filter((sos) => sos.status === 'RESOLVED');
  const assistanceOptions = [
    { id: 'Medical', label: 'Medical', icon: 'medical-services' },
    { id: 'Vehicle Mechanic', label: 'Vehicle Mechanic', icon: 'build' },
    { id: 'SAR Helicopter Pilot', label: 'SAR Helicopter Pilot', icon: 'flight' },
  ];

  const renderSOSRecord = (sos: SOSRecord) => {
    const nextStatus = sos.status === 'ACTIVE'
      ? 'ACKNOWLEDGED'
      : sos.status === 'ACKNOWLEDGED'
        ? 'RESPONDING'
        : sos.status === 'RESPONDING'
          ? 'RESOLVED'
          : null;
    const actionLabel = sos.status === 'ACTIVE'
      ? 'ACKNOWLEDGE'
      : sos.status === 'ACKNOWLEDGED'
        ? 'RESPOND'
        : sos.status === 'RESPONDING'
          ? 'RESOLVE'
          : null;
    const createdDate = new Date(sos.created_at);

    return (
      <View key={sos.id} style={styles.sosRecordCard}>
        <View style={styles.sosRecordHeader}>
          <View style={styles.sosRecordHeading}>
            <Text style={styles.sosPersonName}>{sos.person_name}</Text>
            <Text style={styles.sosPersonRole}>{sos.person_role} | {sos.station_name}</Text>
          </View>
          <View style={[styles.sosStatusPill, sos.status === 'RESOLVED' && styles.sosStatusResolved]}>
            <Text style={[styles.sosStatusText, sos.status === 'RESOLVED' && styles.sosStatusResolvedText]}>
              {sos.status}
            </Text>
          </View>
        </View>
        <View style={styles.sosRecordLine}>
          <MaterialIcons name="medical-services" size={16} color={colors.dangerRed} />
          <Text style={styles.sosRecordText}>{sos.assistance_required}</Text>
        </View>
        <View style={styles.sosRecordLine}>
          <MaterialIcons name="location-on" size={16} color={colors.primary} />
          <Text style={styles.sosRecordText}>
            {sos.latitude.toFixed(5)}, {sos.longitude.toFixed(5)}
          </Text>
        </View>
        <View style={styles.sosRecordLine}>
          <MaterialIcons name="access-time" size={16} color={colors.secondaryText} />
          <Text style={styles.sosRecordText}>
            {Number.isNaN(createdDate.getTime()) ? sos.created_at : createdDate.toLocaleString()}
          </Text>
        </View>
        <Text style={styles.sosExpeditionText}>
          {sos.expedition_name ? `Expedition: ${sos.expedition_name}` : 'No expedition assignment'}
        </Text>
        {sos.description ? <Text style={styles.sosDescription}>{sos.description}</Text> : null}
        {canManageSOS && nextStatus && actionLabel ? (
          <TouchableOpacity
            style={styles.statusActionButton}
            disabled={updatingSosId !== null}
            onPress={() => { void handleStatusUpdate(sos, nextStatus); }}
          >
            {updatingSosId === sos.id ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.statusActionText}>{actionLabel}</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={closeSOS} style={styles.backButton}>
          <MaterialIcons name="close" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Emergency SOS Dispatch</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Info Banner */}
        <View style={styles.alertBanner}>
          <MaterialIcons name="warning" size={24} color={colors.dangerRed} />
          <Text style={styles.alertBannerText}>
            Emergency alerts are sent immediately and prioritized.
          </Text>
        </View>

        {canBroadcastSOS && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Emergency Context</Text>
              <Text style={styles.contextValue}>{user?.username || sosContext?.person_name || 'Signed-in user'}</Text>
              <Text style={styles.cardSubTitle}>
                {sosContext?.station_name || user?.station_name || 'Station not assigned'}
                {sosContext?.expedition_name ? ` | ${sosContext.expedition_name}` : ' | No active expedition'}
              </Text>
              <Text style={styles.cardSubTitle}>
                GPS: {sosContext?.latitude != null && sosContext?.longitude != null
                  ? `${sosContext.latitude.toFixed(5)}, ${sosContext.longitude.toFixed(5)} (last saved)`
                  : 'Current location will be requested when broadcasting'}
              </Text>
            </View>

            <Text style={styles.sectionHeader}>Select Required Assistance</Text>
            <View style={styles.skillGrid}>
              {assistanceOptions.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.skillCard, selectedSkill === item.id && styles.skillCardSelected]}
                  onPress={() => setSelectedSkill(item.id)}
                >
                  <MaterialIcons
                    name={item.icon as any}
                    size={22}
                    color={selectedSkill === item.id ? colors.dangerRed : colors.secondaryText}
                  />
                  <Text style={[styles.skillLabel, selectedSkill === item.id && styles.skillLabelSelected]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Emergency Description (Optional)</Text>
              <TextInput
                style={styles.descriptionInput}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe the emergency or assistance needed"
                placeholderTextColor={colors.secondaryText}
                multiline
                maxLength={1000}
                textAlignVertical="top"
              />
            </View>

            {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <TouchableOpacity
              style={styles.bigSosButton}
              onPress={() => { void handleTriggerSOS(); }}
              disabled={loading || !token}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="large" color={colors.white} />
              ) : (
                <>
                  <MaterialIcons name="warning" size={36} color={colors.white} />
                  <Text style={styles.bigSosButtonText}>BROADCAST EMERGENCY SOS</Text>
                  <Text style={styles.bigSosSubText}>Your account, station, expedition and location are attached</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        {!canBroadcastSOS ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>SOS access is restricted</Text>
          </View>
        ) : null}

        {errorMessage && !canBroadcastSOS ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}

        <View style={styles.recordsHeader}>
          <Text style={styles.sectionHeader}>Active Emergencies ({activeRecords.length})</Text>
          <TouchableOpacity onPress={() => { void fetchSOSData(true); }} style={styles.refreshButton}>
            <MaterialIcons name="refresh" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
        {loadingData ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : activeRecords.length > 0 ? (
          activeRecords.map(renderSOSRecord)
        ) : (
          <View style={styles.card}><Text style={styles.cardSubTitle}>No active emergencies.</Text></View>
        )}

        <Text style={styles.sectionHeader}>Resolved History ({resolvedRecords.length})</Text>
        {resolvedRecords.length > 0 ? resolvedRecords.map(renderSOSRecord) : (
          <View style={styles.card}><Text style={styles.cardSubTitle}>Resolved emergencies will remain available here.</Text></View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topHeader: {
    height: layout.topHeaderHeight,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    color: colors.dangerRed,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl + 40,
    gap: spacing.md,
  },
  alertBanner: {
    backgroundColor: '#FDF2F2',
    borderWidth: 1,
    borderColor: '#F8D7D7',
    borderRadius: radius.card,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  alertBannerText: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    color: colors.dangerRed,
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
  },
  cardTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    color: colors.text,
  },
  coordsText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.base,
    color: colors.primary,
    marginVertical: spacing.xs,
  },
  cardSubTitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
  },
  contextValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.base,
    color: colors.text,
    marginVertical: spacing.xs,
  },
  sectionHeader: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.base,
    color: colors.text,
  },
  skillGrid: {
    gap: spacing.sm,
  },
  skillCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  skillCardSelected: {
    borderColor: colors.dangerRed,
    backgroundColor: '#FDF2F2',
  },
  skillLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    color: colors.secondaryText,
  },
  skillLabelSelected: {
    fontFamily: typography.fontFamily.bold,
    color: colors.dangerRed,
  },
  descriptionInput: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.default,
    backgroundColor: colors.background,
    padding: spacing.sm,
    marginTop: spacing.sm,
    color: colors.text,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
  },
  noticeText: {
    color: colors.okGreen,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
  },
  errorText: {
    color: colors.dangerRed,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
  },
  recordsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refreshButton: {
    padding: spacing.xs,
  },
  sosRecordCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: spacing.xs,
  },
  sosRecordHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sosRecordHeading: {
    flex: 1,
  },
  sosPersonName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.base,
    color: colors.text,
  },
  sosPersonRole: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
  },
  sosStatusPill: {
    backgroundColor: '#FEF3C7',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  sosStatusText: {
    color: '#B45309',
    fontFamily: typography.fontFamily.bold,
    fontSize: 10,
  },
  sosStatusResolved: {
    backgroundColor: '#DCFCE7',
  },
  sosStatusResolvedText: {
    color: colors.okGreen,
  },
  sosRecordLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sosRecordText: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
  },
  sosExpeditionText: {
    color: colors.secondaryText,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  sosDescription: {
    color: colors.text,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    backgroundColor: colors.background,
    borderRadius: radius.default,
    padding: spacing.sm,
  },
  statusActionButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  statusActionText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
  },
  resultCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    gap: spacing.xs,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  resultStatusText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  resultLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
  },
  resultValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    color: colors.text,
  },
  hashText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 10,
    color: colors.secondaryText,
    maxWidth: 180,
  },
  bigSosButton: {
    backgroundColor: colors.dangerRed,
    borderRadius: radius.card,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  bigSosButtonDispatched: {
    backgroundColor: colors.primary,
  },
  bigSosButtonText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.base,
    color: colors.white,
    letterSpacing: 0.5,
  },
  bigSosSubText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.white,
    opacity: 0.9,
  },
});
