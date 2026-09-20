import React, { useState } from 'react';
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
import Header from '../components/Header';
import { useApp } from '../context/AppContext';
import { colors, spacing, radius, typography } from '../theme';
import { BACKEND_URL } from '../config';

interface SimulatedItem {
  name: string;
  category: string;
  available_quantity: number;
  unit: string;
  cold_factor_used: number;
  stockout_probability_percent: number;
  p10_days: number;
  p50_days: number;
  p90_days: number;
  risk_level: string;
}

interface SimulationResponse {
  active_expedition: string;
  station_name: string;
  team_size: number;
  temperature_c: number;
  resupply_in_days: number;
  delay_days: number;
  blizzard_days: number;
  fuel_loss_percent: number;
  assumptions: {
    monte_carlo_runs: number;
    daily_consumption_noise: string;
    resupply_delay_jitter: string;
    cold_factor_formula: string;
  };
  baseline_items: SimulatedItem[];
  scenario_items: SimulatedItem[];
  error?: string;
}

export default function SimulatorScreen() {
  const router = useRouter();
  const { token } = useApp();

  // Inputs State
  const [resupplyInDays, setResupplyInDays] = useState<string>('60');
  const [delayDays, setDelayDays] = useState<string>('5');
  const [blizzardDays, setBlizzardDays] = useState<string>('0');
  const [fuelLossPercent, setFuelLossPercent] = useState<string>('0');
  const [temperature, setTemperature] = useState<string>('-33.5');

  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<SimulationResponse | null>(null);

  const handleRunSimulation = async () => {
    const resupplyVal = parseFloat(resupplyInDays);
    if (isNaN(resupplyVal) || resupplyVal <= 0) {
      Alert.alert('Validation Error', 'Planned resupply days must be a positive number.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/simulate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resupply_in_days: resupplyVal,
          delay_days: parseFloat(delayDays) || 0,
          blizzard_days: parseFloat(blizzardDays) || 0,
          fuel_loss_percent: parseFloat(fuelLossPercent) || 0,
          temperature: parseFloat(temperature) || -33.5,
          runs: 1000,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP status ${res.status}`);
      }

      const data: SimulationResponse = await res.json();
      setResult(data);
    } catch (err: any) {
      Alert.alert('Simulation Error', err.message || 'Failed to execute Monte Carlo simulation.');
    } finally {
      setLoading(false);
    }
  };

  const getRiskBadgeColor = (risk: string) => {
    switch (risk.toLowerCase()) {
      case 'critical':
        return colors.dangerRed;
      case 'elevated':
        return colors.warningAmber;
      default:
        return colors.okGreen;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="What-If Monte Carlo Simulator" />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={20} color={colors.text} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Simulation Controls Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="equalizer" size={24} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>1000-Run Monte Carlo Risk Engine</Text>
              <Text style={styles.cardSubTitle}>
                Simulate supply chain delays, blizzards & fuel leakage scenarios
              </Text>
            </View>
          </View>

          <View style={styles.inputGrid}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Planned Resupply (Days)</Text>
              <TextInput
                style={styles.input}
                value={resupplyInDays}
                onChangeText={setResupplyInDays}
                keyboardType="numeric"
                placeholder="60"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Shipment Delay (Days)</Text>
              <TextInput
                style={styles.input}
                value={delayDays}
                onChangeText={setDelayDays}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
          </View>

          <View style={styles.inputGrid}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Blizzard Days (No Arrival)</Text>
              <TextInput
                style={styles.input}
                value={blizzardDays}
                onChangeText={setBlizzardDays}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Fuel Leakage / Loss (%)</Text>
              <TextInput
                style={styles.input}
                value={fuelLossPercent}
                onChangeText={setFuelLossPercent}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Station Temperature (°C)</Text>
            <TextInput
              style={styles.input}
              value={temperature}
              onChangeText={setTemperature}
              keyboardType="numeric"
              placeholder="-33.5"
            />
          </View>

          <TouchableOpacity
            style={styles.runBtn}
            onPress={handleRunSimulation}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <MaterialIcons name="play-arrow" size={20} color={colors.white} />
                <Text style={styles.runBtnText}>RUN MONTE CARLO SIMULATION</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Results Section */}
        {result ? (
          <View style={styles.resultContainer}>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>
                Expedition: {result.active_expedition} • Station: {result.station_name} • Team: {result.team_size} • Temp: {result.temperature_c}°C
              </Text>
            </View>

            <Text style={styles.sectionHeader}>Baseline vs Scenario Risk Comparison</Text>

            {result.scenario_items.map((scenItem, idx) => {
              const baseItem = result.baseline_items[idx] || scenItem;

              return (
                <View key={scenItem.name} style={styles.itemComparisonCard}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemName}>{scenItem.name}</Text>
                    <Text style={styles.itemCategory}>{scenItem.category}</Text>
                  </View>

                  <View style={styles.comparisonGrid}>
                    {/* Baseline Column */}
                    <View style={styles.columnBox}>
                      <Text style={styles.columnTitle}>Baseline (Planned)</Text>
                      <Text style={styles.qtyText}>
                        Stock: {baseItem.available_quantity} {baseItem.unit}
                      </Text>

                      <View
                        style={[
                          styles.riskBadge,
                          { backgroundColor: getRiskBadgeColor(baseItem.risk_level) + '20' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.riskBadgeText,
                            { color: getRiskBadgeColor(baseItem.risk_level) },
                          ]}
                        >
                          {baseItem.stockout_probability_percent}% Stockout ({baseItem.risk_level})
                        </Text>
                      </View>

                      <Text style={styles.percentileText}>
                        P10: {baseItem.p10_days}d • P50: {baseItem.p50_days}d • P90: {baseItem.p90_days}d
                      </Text>
                    </View>

                    {/* Scenario Column */}
                    <View style={styles.columnBoxScenario}>
                      <Text style={styles.columnTitleScenario}>Scenario (With Delays)</Text>
                      <Text style={styles.qtyText}>
                        Stock: {scenItem.available_quantity} {scenItem.unit}
                      </Text>

                      <View
                        style={[
                          styles.riskBadge,
                          { backgroundColor: getRiskBadgeColor(scenItem.risk_level) + '20' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.riskBadgeText,
                            { color: getRiskBadgeColor(scenItem.risk_level) },
                          ]}
                        >
                          {scenItem.stockout_probability_percent}% Stockout ({scenItem.risk_level})
                        </Text>
                      </View>

                      <Text style={styles.percentileText}>
                        P10: {scenItem.p10_days}d • P50: {scenItem.p50_days}d • P90: {scenItem.p90_days}d
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}

            {/* Assumptions Box */}
            <View style={styles.assumptionsCard}>
              <View style={styles.assumptionsHeader}>
                <MaterialIcons name="info-outline" size={18} color={colors.secondaryText} />
                <Text style={styles.assumptionsTitle}>Model Assumptions</Text>
              </View>
              <Text style={styles.assumptionsItem}>
                Runs: {result.assumptions.monte_carlo_runs} iterations
              </Text>
              <Text style={styles.assumptionsItem}>
                Daily Burn Noise: {result.assumptions.daily_consumption_noise}
              </Text>
              <Text style={styles.assumptionsItem}>
                Resupply Jitter: {result.assumptions.resupply_delay_jitter}
              </Text>
              <Text style={styles.assumptionsItem}>
                Cold Multiplier: {result.assumptions.cold_factor_formula}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <MaterialIcons name="assessment" size={44} color={colors.secondaryText} />
            <Text style={styles.emptyTitle}>Monte Carlo Simulator Ready</Text>
            <Text style={styles.emptySub}>
              Enter planned resupply timeline and scenario parameters above, then tap 'RUN MONTE CARLO SIMULATION' to evaluate stockout risk.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm, color: colors.text },
  scrollContent: { padding: spacing.md, gap: spacing.md, paddingBottom: 60 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text },
  cardSubTitle: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, color: colors.secondaryText },
  inputGrid: { flexDirection: 'row', gap: spacing.sm },
  fieldLabel: { fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.secondaryText, marginTop: 2 },
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
    marginTop: 2,
  },
  runBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.button,
    marginTop: spacing.xs,
  },
  runBtnText: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, color: colors.white, letterSpacing: 0.5 },
  resultContainer: { gap: spacing.md },
  metaRow: {
    backgroundColor: colors.chipBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  metaText: { fontFamily: typography.fontFamily.medium, fontSize: 11, color: colors.secondaryText },
  sectionHeader: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text },
  itemComparisonCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: spacing.sm,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text },
  itemCategory: { fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.xs, color: colors.primary },
  comparisonGrid: { flexDirection: 'row', gap: spacing.sm },
  columnBox: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.sm,
    gap: 4,
  },
  columnTitle: { fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.secondaryText },
  columnBoxScenario: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.primary + '40',
    padding: spacing.sm,
    gap: 4,
  },
  columnTitleScenario: { fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.primary },
  qtyText: { fontFamily: typography.fontFamily.medium, fontSize: 11, color: colors.text },
  riskBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start', marginVertical: 2 },
  riskBadgeText: { fontFamily: typography.fontFamily.bold, fontSize: 10 },
  percentileText: { fontFamily: typography.fontFamily.regular, fontSize: 10, color: colors.secondaryText },
  assumptionsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: 4,
  },
  assumptionsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  assumptionsTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, color: colors.text },
  assumptionsItem: { fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.secondaryText },
  emptyCard: {
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
});
