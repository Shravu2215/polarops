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
  Platform,
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

function DateField({
  value,
  onChange,
  editable,
  accessibilityLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  editable: boolean;
  accessibilityLabel: string;
}) {
  if (Platform.OS === 'web') {
    return React.createElement('input' as any, {
      type: 'date',
      value,
      disabled: !editable,
      'aria-label': accessibilityLabel,
      onChange: (event: { currentTarget: { value: string } }) => onChange(event.currentTarget.value),
      style: {
        boxSizing: 'border-box',
        width: '100%',
        height: 42,
        padding: '8px 10px',
        backgroundColor: colors.background,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: radius.default,
        color: colors.text,
        fontFamily: typography.fontFamily.regular,
        fontSize: typography.fontSize.sm,
        marginBottom: spacing.xs,
      },
    });
  }

  return (
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      placeholder="YYYY-MM-DD"
      editable={editable}
    />
  );
}

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : new Date(Number.NaN);
};

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function PlannerScreen() {
  const router = useRouter();
  const { token, user } = useApp();
  const isTeamMember = user?.role === 'Team Member';

  const [expeditions, setExpeditions] = useState<any[]>([]);
  const [selectedExpeditionId, setSelectedExpeditionId] = useState<number | null>(null);
  const [stations, setStations] = useState<string[]>([]);
  const [showExpeditionOptions, setShowExpeditionOptions] = useState<boolean>(false);
  const [showStationOptions, setShowStationOptions] = useState<boolean>(false);

  const [expeditionName, setExpeditionName] = useState<string>('');
  const [stationName, setStationName] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [departureDeadline, setDepartureDeadline] = useState<string>('');
  const [milestones, setMilestones] = useState<MilestoneItem[]>([]);

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

      const [expRes, auditRes, stationRes] = await Promise.all([
        fetch(`${BACKEND_URL}/expeditions`, { headers }),
        fetch(`${BACKEND_URL}/audit`, { headers }),
        fetch(`${BACKEND_URL}/stations`, { headers }),
      ]);

      if (expRes.ok) {
        const data = await expRes.json();
        setExpeditions(data);
        if (data.length > 0 && !selectedExpeditionId) {
          handleSelectExpedition(data[0]);
        } else if (selectedExpeditionId) {
            const current = data.find((e: any) => e.id === selectedExpeditionId);
            if(current) handleSelectExpedition(current, false);
        }
      }

      if (stationRes.ok) {
        const stationData = await stationRes.json();
        setStations(stationData.map((station: { name: string }) => station.name));
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

  const handleSelectExpedition = (exp: any, override: boolean = true) => {
    setSelectedExpeditionId(exp.id);
    if(override) {
        setExpeditionName(exp.name);
        setStationName(exp.station_name);
        setStartDate(exp.start_date || '');
        setDepartureDeadline(exp.departure_deadline || exp.end_date || '');
        setSchedule(exp.schedule_output || null);
        if (exp.schedule_output) {
            setSchedule(exp.schedule_output);
        }
        if (exp.milestones_json) {
            setMilestones(exp.milestones_json);
        } else {
            // defaults
            setMilestones([
                { name: "Equipment Maintenance", duration_days: 15 },
                { name: "Medical Clearances", duration_days: 10 }
            ]);
        }
    }
  };

  useEffect(() => {
    fetchPlannerAndAudit();
  }, [token]);

  useEffect(() => {
    if (!departureDeadline || milestones.length === 0) return;

    const deadlineDate = parseLocalDate(departureDeadline);
    if (isNaN(deadlineDate.getTime())) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const scheduled: ScheduledMilestone[] = [];
    let currFinish = new Date(deadlineDate);

    for (let i = milestones.length - 1; i >= 0; i--) {
      const m = milestones[i];
      const duration = Number(m.duration_days) || 1;

      const startDateCalc = new Date(currFinish);
      startDateCalc.setDate(startDateCalc.getDate() - duration);

      const isAtRisk = startDateCalc < today;

      scheduled.push({
        name: m.name,
        duration_days: duration,
        latest_start_date: formatLocalDate(startDateCalc),
        latest_finish_date: formatLocalDate(currFinish),
        is_at_risk: isAtRisk
      });

      currFinish = new Date(startDateCalc);
    }

    scheduled.reverse();

    const earliestStart = scheduled.length > 0 ? parseLocalDate(scheduled[0].latest_start_date) : today;
    const diffTime = earliestStart.getTime() - today.getTime();
    const totalBufferDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const atRiskCount = scheduled.filter(s => s.is_at_risk).length;

    setSchedule({
      departure_deadline: departureDeadline,
      total_buffer_days: totalBufferDays,
      scheduled_milestones: scheduled,
      at_risk_count: atRiskCount,
      has_at_risk: atRiskCount > 0,
    });
  }, [departureDeadline, milestones]);

  const handleComputeAndSave = async () => {
    if (!selectedExpeditionId) {
      Alert.alert('Select Expedition', 'Choose an existing expedition before saving its plan.');
      return;
    }
    if (!startDate.match(/^\d{4}-\d{2}-\d{2}$/) || !departureDeadline.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert('Dates Required', 'Choose both an expedition start date and end date.');
      return;
    }
    if (startDate > departureDeadline) {
      Alert.alert('Invalid Date Range', 'The start date must be on or before the end date.');
      return;
    }

    setSaving(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const payload = {
        expedition_id: selectedExpeditionId,
        expedition_name: expeditionName,
        station_name: stationName,
        start_date: startDate,
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
        Alert.alert('Schedule Saved', 'Expedition plan, station, and dates were saved.');
        void fetchPlannerAndAudit();
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
          {isTeamMember ? (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.primaryIce,
              borderColor: colors.cardBorder,
              borderWidth: 1,
              borderRadius: radius.card,
              padding: spacing.sm + 2,
              gap: spacing.xs,
              marginBottom: spacing.xs,
            }}>
              <MaterialIcons name="visibility" size={16} color={colors.primary} />
              <Text style={{ fontFamily: typography.fontFamily.medium, fontSize: 12, color: colors.primary, flex: 1 }}>
                View-Only Mode • Schedule calculations & milestone edits are reserved for Expedition Leaders.
              </Text>
            </View>
          ) : null}

          {/* Plan Configuration Box */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Departure Deadline & Milestones</Text>

            <Text style={styles.inputLabel}>Existing Expedition</Text>
            <TouchableOpacity
              style={[styles.input, styles.selectInput, isTeamMember && styles.disabledInput]}
              onPress={() => setShowExpeditionOptions((visible) => !visible)}
              disabled={isTeamMember || expeditions.length === 0}
            >
              <Text style={styles.selectText}>
                {expeditions.find((exp) => exp.id === selectedExpeditionId)?.name || 'No expeditions available'}
              </Text>
              <MaterialIcons name={showExpeditionOptions ? 'expand-less' : 'expand-more'} size={20} color={colors.secondaryText} />
            </TouchableOpacity>
            {showExpeditionOptions ? (
              <View style={styles.optionList}>
                {expeditions.map((exp) => (
                  <TouchableOpacity
                    key={exp.id}
                    style={styles.optionButton}
                    onPress={() => {
                      handleSelectExpedition(exp);
                      setShowExpeditionOptions(false);
                    }}
                  >
                    <Text style={styles.optionText}>{exp.name}</Text>
                    <Text style={styles.optionSubText}>{exp.station_name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <Text style={styles.inputLabel}>Expedition Name</Text>
            <TextInput
              style={[styles.input, isTeamMember && { backgroundColor: colors.cardBorder + '30', color: colors.secondaryText }]}
              value={expeditionName}
              onChangeText={setExpeditionName}
              placeholder="Expedition Name"
              editable={!isTeamMember}
            />

            <Text style={styles.inputLabel}>Station</Text>
            <TouchableOpacity
              style={[styles.input, styles.selectInput, isTeamMember && styles.disabledInput]}
              onPress={() => setShowStationOptions((visible) => !visible)}
              disabled={isTeamMember}
            >
              <Text style={styles.selectText}>{stationName || 'Choose a station'}</Text>
              <MaterialIcons name={showStationOptions ? 'expand-less' : 'expand-more'} size={20} color={colors.secondaryText} />
            </TouchableOpacity>
            {showStationOptions ? (
              <View style={styles.optionList}>
                {stations.map((station) => (
                  <TouchableOpacity
                    key={station}
                    style={styles.optionButton}
                    onPress={() => {
                      setStationName(station);
                      setShowStationOptions(false);
                    }}
                  >
                    <Text style={styles.optionText}>{station}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: spacing.xs }}>
                <Text style={styles.inputLabel}>Start Date</Text>
                <DateField value={startDate} onChange={setStartDate} editable={!isTeamMember} accessibilityLabel="Expedition start date" />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.xs }}>
                <Text style={styles.inputLabel}>End Date</Text>
                <DateField value={departureDeadline} onChange={setDepartureDeadline} editable={!isTeamMember} accessibilityLabel="Expedition end date" />
              </View>
            </View>

            {/* Milestones List */}
            <Text style={[styles.inputLabel, { marginTop: spacing.md }]}>Milestones & Durations (Days)</Text>
            {milestones.map((m, idx) => (
              <View key={idx} style={styles.milestoneRow}>
                <Text style={styles.milestoneIndex}>{idx + 1}.</Text>
                <TextInput
                  style={[styles.input, { flex: 2, marginBottom: 0 }, isTeamMember && { backgroundColor: colors.cardBorder + '30', color: colors.secondaryText }]}
                  value={m.name}
                  editable={!isTeamMember}
                  onChangeText={txt => {
                    const updated = [...milestones];
                    updated[idx].name = txt;
                    setMilestones(updated);
                  }}
                />
                <TextInput
                  style={[styles.input, { width: 50, marginBottom: 0, textAlign: 'center' }, isTeamMember && { backgroundColor: colors.cardBorder + '30', color: colors.secondaryText }]}
                  keyboardType="numeric"
                  value={String(m.duration_days)}
                  editable={!isTeamMember}
                  onChangeText={txt => {
                    const updated = [...milestones];
                    updated[idx].duration_days = Number(txt) || 1;
                    setMilestones(updated);
                  }}
                />
                <Text style={styles.daysText}>days</Text>
                {!isTeamMember ? (
                  <TouchableOpacity onPress={() => removeMilestone(idx)} style={styles.deleteBtn}>
                    <MaterialIcons name="close" size={18} color={colors.dangerRed} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}

            {/* Add Custom Milestone Form */}
            {!isTeamMember ? (
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
            ) : null}

            <TouchableOpacity
              onPress={handleComputeAndSave}
              disabled={saving || isTeamMember || !selectedExpeditionId}
              style={[
                styles.computeBtn,
                (saving || isTeamMember || !selectedExpeditionId) && { opacity: 0.6, backgroundColor: isTeamMember ? colors.secondaryText : colors.primary },
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <MaterialIcons name={isTeamMember ? "lock" : "event-available"} size={20} color="#FFF" />
                  <Text style={styles.computeBtnText}>
                    {isTeamMember ? 'View-Only Schedule (Leader Required)' : 'Compute & Save Schedule'}
                  </Text>
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
                  <MaterialIcons name="warning" size={18} color={colors.dangerRed} />
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
    fontSize: typography.fontSize.base,
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
    borderRadius: radius.default,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  selectInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 42,
  },
  disabledInput: { backgroundColor: colors.cardBorder + '30' },
  selectText: { fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm, color: colors.text },
  optionList: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.default,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  optionText: { fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm, color: colors.text },
  optionSubText: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, color: colors.secondaryText },
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
    borderRadius: radius.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  computeBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radius.default,
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
    fontSize: typography.fontSize.base,
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
    borderRadius: radius.circle,
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
    color: colors.dangerRed,
    flex: 1,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.base,
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
  nodeAtRisk: { backgroundColor: colors.dangerRed },
  timelineContent: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
  },
  contentAtRisk: {
    borderColor: colors.dangerRed,
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
    borderRadius: radius.default,
  },
  atRiskBadgeText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 10,
    color: colors.dangerRed,
  },
  onTrackBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.default,
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
    borderRadius: radius.default,
  },
  dateCol: { alignItems: 'center' },
  dateLabel: { fontFamily: typography.fontFamily.regular, fontSize: 10, color: colors.secondaryText },
  dateVal: { fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.text },
  dateValRisk: { color: colors.dangerRed },
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
