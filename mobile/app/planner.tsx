import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme';
import { BACKEND_URL } from '../config';
import { useApp } from '../context/AppContext';

interface MilestoneItem {
  name: string;
  duration_days: number;
}

interface ScheduledMilestone {
  name: string;
  duration_days: number;
  latest_start_date: string;
  latest_finish_date: string;
  is_at_risk: boolean;
}

interface ScheduleData {
  departure_deadline: string;
  total_buffer_days: number;
  scheduled_milestones: ScheduledMilestone[];
  at_risk_count: number;
  has_at_risk: boolean;
}

interface AuditEntry {
  id: number;
  action: string;
  performed_by: string;
  target_resource: string;
  payload: any;
  timestamp: string;
  hash: string;
}

export default function PlannerScreen() {
  const router = useRouter();
  const { token } = useApp();

  const [expeditionName, setExpeditionName] = useState<string>('Bharati 45th Expedition');
  const [stationName, setStationName] = useState<string>('Bharati');
  const [departureDeadline, setDepartureDeadline] = useState<string>('2026-11-15');

  const [milestones, setMilestones] = useState<MilestoneItem[]>([
    { name: 'Procurement & Gear Sourcing', duration_days: 14 },
    { name: 'Packing & Cold Cargo Prep', duration_days: 7 },
    { name: 'Vessel / Air Shipping to Base', duration_days: 18 },
    { name: 'Station Setup & Safety Audit', duration_days: 5 },
  ]);

  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const [newMName, setNewMName] = useState<string>('');
  const [newMDuration, setNewMDuration] = useState<string>('7');

  const fetchPlannerAndAudit = async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [planRes, auditRes] = await Promise.all([
        fetch(`${BACKEND_URL}/planner`, { headers }),
        fetch(`${BACKEND_URL}/audit`, { headers }),
      ]);

      if (planRes.ok) {
        const pData = await planRes.json();
        if (pData.expedition_name) setExpeditionName(pData.expedition_name);
        if (pData.station_name) setStationName(pData.station_name);
        if (pData.schedule) {
          setSchedule(pData.schedule);
          if (pData.schedule.departure_deadline) {
            setDepartureDeadline(pData.schedule.departure_deadline);
          }
          if (pData.schedule.scheduled_milestones) {
            setMilestones(
              pData.schedule.scheduled_milestones.map((m: any) => ({
                name: m.name,
                duration_days: m.duration_days,
              }))
            );
          }
        }
      }

      if (auditRes.ok) {
        const aData = await auditRes.json();
        const planLogs = aData.filter((log: AuditEntry) => log.action === 'PLAN_UPDATE');
        setAuditLogs(planLogs);
      }
    } catch (err) {
      console.warn('Error fetching planner data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlannerAndAudit();
  }, [token]);

  const handleComputeAndSave = async () => {
    if (!departureDeadline.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert('Invalid Date', 'Please enter departure deadline in YYYY-MM-DD format');
      return;
    }

    setSaving(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const payload = {
        expedition_name: expeditionName,
        station_name: stationName,
        departure_deadline: departureDeadline,
        milestones: milestones.map(m => ({
          name: m.name,
          duration_days: Number(m.duration_days) || 1,
        })),
      };

      const res = await fetch(`${BACKEND_URL}/planner/schedule`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setSchedule(data.schedule);
        Alert.alert('Schedule Saved', 'Backward schedule computed and logged to immutable AuditLog!');
        fetchPlannerAndAudit();
      } else {
        const err = await res.json();
        Alert.alert('Save Failed', err.detail || 'Failed to save planner schedule');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Network error saving schedule');
    } finally {
      setSaving(false);
    }
  };

  const addMilestone = () => {
    if (!newMName.trim()) {
      Alert.alert('Milestone Name Required', 'Please enter a name for the new milestone.');
      return;
    }
    const dur = parseInt(newMDuration, 10);
    if (isNaN(dur) || dur <= 0) {
      Alert.alert('Invalid Duration', 'Duration must be a positive integer in days.');
      return;
    }

    setMilestones([...milestones, { name: newMName.trim(), duration_days: dur }]);
    setNewMName('');
    setNewMDuration('7');
  };

  const removeMilestone = (index: number) => {
    if (milestones.length <= 1) {
      Alert.alert('Min Milestones', 'Expedition plan must have at least 1 milestone.');
      return;
    }
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Expedition Planner</Text>
        <TouchableOpacity onPress={fetchPlannerAndAudit} style={styles.backButton}>
          <MaterialIcons name="refresh" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Computing backward schedule...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Plan Configuration Box */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Departure Deadline & Milestones</Text>

            <Text style={styles.inputLabel}>Expedition Name</Text>
            <TextInput
              style={styles.input}
              value={expeditionName}
              onChangeText={setExpeditionName}
              placeholder="Expedition Name"
            />

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: spacing.xs }}>
                <Text style={styles.inputLabel}>Station Name</Text>
                <TextInput
                  style={styles.input}
                  value={stationName}
                  onChangeText={setStationName}
                  placeholder="Station Name"
                />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.xs }}>
                <Text style={styles.inputLabel}>Deadline (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={departureDeadline}
                  onChangeText={setDepartureDeadline}
                  placeholder="2026-11-15"
                />
              </View>
            </View>

            {/* Milestones List */}
            <Text style={[styles.inputLabel, { marginTop: spacing.md }]}>Milestones & Durations (Days)</Text>
            {milestones.map((m, idx) => (
              <View key={idx} style={styles.milestoneRow}>
                <Text style={styles.milestoneIndex}>{idx + 1}.</Text>
                <TextInput
                  style={[styles.input, { flex: 2, marginBottom: 0 }]}
                  value={m.name}
                  onChangeText={txt => {
                    const updated = [...milestones];
                    updated[idx].name = txt;
                    setMilestones(updated);
                  }}
                />
                <TextInput
                  style={[styles.input, { width: 50, marginBottom: 0, textAlign: 'center' }]}
                  keyboardType="numeric"
                  value={String(m.duration_days)}
                  onChangeText={txt => {
                    const updated = [...milestones];
                    updated[idx].duration_days = Number(txt) || 1;
                    setMilestones(updated);
                  }}
                />
                <Text style={styles.daysText}>days</Text>
                <TouchableOpacity onPress={() => removeMilestone(idx)} style={styles.deleteBtn}>
                  <MaterialIcons name="close" size={18} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))}

            {/* Add Custom Milestone Form */}
            <View style={styles.addMilestoneForm}>
              <TextInput
                style={[styles.input, { flex: 2, marginBottom: 0 }]}
                placeholder="New Milestone Name"
                value={newMName}
                onChangeText={setNewMName}
              />
              <TextInput
                style={[styles.input, { width: 50, marginBottom: 0, textAlign: 'center' }]}
                keyboardType="numeric"
                placeholder="Days"
                value={newMDuration}
                onChangeText={setNewMDuration}
              />
              <TouchableOpacity onPress={addMilestone} style={styles.addBtn}>
                <MaterialIcons name="add" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleComputeAndSave}
              disabled={saving}
              style={[styles.computeBtn, saving && { opacity: 0.6 }]}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <MaterialIcons name="event-available" size={20} color="#FFF" />
                  <Text style={styles.computeBtnText}>Compute & Save Schedule</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Backward Schedule Summary Banner */}
          {schedule && (
            <View style={[styles.summaryCard, schedule.has_at_risk && styles.summaryCardAtRisk]}>
              <View style={styles.summaryHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryTitle}>Backward Schedule Summary</Text>
                  <Text style={styles.summarySub}>Target Departure: {schedule.departure_deadline}</Text>
                </View>
                <View
                  style={[
                    styles.bufferBadge,
                    schedule.total_buffer_days >= 0 ? styles.bufferSuccess : styles.bufferDanger,
                  ]}
                >
                  <Text style={styles.bufferText}>
                    {schedule.total_buffer_days >= 0 ? `+${schedule.total_buffer_days} Days Buffer` : `${schedule.total_buffer_days} Days Delay`}
                  </Text>
                </View>
              </View>

              {schedule.has_at_risk && (
                <View style={styles.atRiskBanner}>
                  <MaterialIcons name="warning" size={18} color={colors.danger} />
                  <Text style={styles.atRiskBannerText}>
                    ATTENTION: {schedule.at_risk_count} milestone(s) flagged AT RISK (Latest start in the past)!
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Vertical Timeline */}
          <Text style={styles.sectionTitle}>Vertical Timeline & Milestones</Text>
          {schedule && schedule.scheduled_milestones ? (
            <View style={styles.timelineContainer}>
              {schedule.scheduled_milestones.map((item, index) => {
                const isLast = index === schedule.scheduled_milestones.length - 1;
                return (
                  <View key={index} style={styles.timelineItem}>
                    {!isLast && <View style={styles.timelineLine} />}

                    <View style={[styles.timelineNode, item.is_at_risk ? styles.nodeAtRisk : styles.nodeNormal]}>
                      <MaterialIcons
                        name={item.is_at_risk ? 'priority-high' : 'check'}
                        size={12}
                        color="#FFFFFF"
                      />
                    </View>

                    <View style={[styles.timelineContent, item.is_at_risk && styles.contentAtRisk]}>
                      <View style={styles.timelineHeaderRow}>
                        <Text style={styles.milestoneNameText}>{item.name}</Text>
                        {item.is_at_risk ? (
                          <View style={styles.atRiskBadge}>
                            <Text style={styles.atRiskBadgeText}>AT RISK</Text>
                          </View>
                        ) : (
                          <View style={styles.onTrackBadge}>
                            <Text style={styles.onTrackBadgeText}>ON TRACK</Text>
                          </View>
                        )}
                      </View>

                      <Text style={styles.durationText}>
                        Duration: {item.duration_days} day{item.duration_days > 1 ? 's' : ''}
                      </Text>

                      <View style={styles.datesRow}>
                        <View style={styles.dateCol}>
                          <Text style={styles.dateLabel}>Latest Start</Text>
                          <Text style={[styles.dateVal, item.is_at_risk && styles.dateValRisk]}>
                            {item.latest_start_date}
                          </Text>
                        </View>
                        <MaterialIcons name="arrow-forward" size={16} color={colors.secondaryText} />
                        <View style={styles.dateCol}>
                          <Text style={styles.dateLabel}>Latest Finish</Text>
                          <Text style={styles.dateVal}>{item.latest_finish_date}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.sub}>No schedule computed yet. Click above to compute timeline.</Text>
            </View>
          )}

          {/* Audit Ledger for Plan Changes */}
          <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>Plan Changes Audit Ledger</Text>
          {auditLogs.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.sub}>No plan change audit entries recorded yet.</Text>
            </View>
          ) : (
            auditLogs.map(log => {
              let payloadObj: any = {};
              try {
                payloadObj = typeof log.payload === 'string' ? JSON.parse(log.payload) : log.payload;
              } catch (e) {
                payloadObj = {};
              }

              return (
                <View key={log.id} style={styles.auditCard}>
                  <View style={styles.auditHeader}>
                    <View style={styles.auditTag}>
                      <MaterialIcons name="verified" size={14} color={colors.primary} />
                      <Text style={styles.auditActionText}>{log.action}</Text>
                    </View>
                    <Text style={styles.auditTime}>
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>

                  <Text style={styles.auditUser}>
                    Updated by: <Text style={{ fontFamily: typography.fontFamily.bold }}>{log.performed_by}</Text> ({log.target_resource})
                  </Text>

                  {payloadObj.departure_deadline && (
                    <Text style={styles.auditDetails}>
                      Deadline: {payloadObj.departure_deadline} • Buffer: {payloadObj.total_buffer_days}d • At Risk: {payloadObj.at_risk_count}
                    </Text>
                  )}

                  <View style={styles.hashBox}>
                    <Text style={styles.hashLabel}>SHA-256 Hash:</Text>
                    <Text style={styles.hashVal} numberOfLines={1}>
                      {log.hash}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topHeader: {
    height: 64,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  backButton: { padding: spacing.xs },
  headerTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    color: colors.text,
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
  content: { padding: spacing.md, paddingBottom: 100 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  inputLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.secondaryText,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs,
  },
  milestoneIndex: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: colors.secondaryText,
    width: 18,
  },
  daysText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: colors.secondaryText,
  },
  deleteBtn: { padding: 4 },
  addMilestoneForm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  addBtn: {
    backgroundColor: colors.primary,
    padding: 8,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  computeBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  computeBtnText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    color: '#FFFFFF',
  },
  summaryCard: {
    backgroundColor: '#F0F9FF',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  summaryCardAtRisk: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    color: colors.text,
  },
  summarySub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
    marginTop: 2,
  },
  bufferBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  bufferSuccess: { backgroundColor: '#DCFCE7' },
  bufferDanger: { backgroundColor: '#FEE2E2' },
  bufferText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: colors.text,
  },
  atRiskBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#FCA5A5',
  },
  atRiskBannerText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 11,
    color: colors.danger,
    flex: 1,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  timelineContainer: {
    paddingLeft: spacing.xs,
    marginBottom: spacing.md,
  },
  timelineItem: {
    position: 'relative',
    paddingLeft: 24,
    marginBottom: spacing.md,
  },
  timelineLine: {
    position: 'absolute',
    left: 7,
    top: 16,
    bottom: -24,
    width: 2,
    backgroundColor: colors.cardBorder,
  },
  timelineNode: {
    position: 'absolute',
    left: 0,
    top: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  nodeNormal: { backgroundColor: colors.primary },
  nodeAtRisk: { backgroundColor: colors.danger },
  timelineContent: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
  },
  contentAtRisk: {
    borderColor: colors.danger,
    backgroundColor: '#FFF5F5',
  },
  timelineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  milestoneNameText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    color: colors.text,
    flex: 1,
  },
  atRiskBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  atRiskBadgeText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 10,
    color: colors.danger,
  },
  onTrackBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  onTrackBadgeText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 10,
    color: '#15803D',
  },
  durationText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: colors.secondaryText,
    marginBottom: spacing.xs,
  },
  datesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    padding: spacing.xs,
    borderRadius: radius.sm,
  },
  dateCol: { alignItems: 'center' },
  dateLabel: { fontFamily: typography.fontFamily.regular, fontSize: 10, color: colors.secondaryText },
  dateVal: { fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.text },
  dateValRisk: { color: colors.danger },
  sub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    color: colors.secondaryText,
  },
  auditCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    gap: 2,
  },
  auditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  auditTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  auditActionText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 11,
    color: colors.primary,
  },
  auditTime: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 10,
    color: colors.secondaryText,
  },
  auditUser: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.text,
  },
  auditDetails: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.secondaryText,
  },
  hashBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  hashLabel: { fontFamily: typography.fontFamily.medium, fontSize: 9, color: colors.secondaryText },
  hashVal: { fontFamily: typography.fontFamily.regular, fontSize: 9, color: colors.primary, flex: 1 },
});
