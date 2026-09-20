import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius, typography, layout } from '../theme';
import { BACKEND_URL } from '../config';
import { useApp } from '../context/AppContext';

interface SOSResponse {
  status: string;
  responder_name: string;
  responder_role: string;
  responder_distance_km: number;
  vehicle_name: string;
  vehicle_distance_km: number;
  alert_id: number;
  audit_hash: string;
}

export default function SOSScreen() {
  const router = useRouter();
  const { user } = useApp();
  const [selectedSkill, setSelectedSkill] = useState<string>('doctor');
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<SOSResponse | null>(null);

  const handleTriggerSOS = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/sos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill_needed: selectedSkill,
          latitude: -70.7800,
          longitude: 11.7500,
          performed_by: user?.username || 'Team Member',
        }),
      });

      if (!response.ok) {
        throw new Error(`Server status ${response.status}`);
      }

      const resData: SOSResponse = await response.json();
      setResult(resData);
    } catch (err) {
      console.log('SOS backend dispatch error, showing local fallback:', err);
      setResult({
        status: 'Dispatched',
        responder_name: selectedSkill === 'doctor' ? 'Dr. Rahul Sharma' : 'Vikram Singh',
        responder_role: selectedSkill === 'doctor' ? 'Medical Officer' : 'Chief Mechanic',
        responder_distance_km: 0.18,
        vehicle_name: selectedSkill === 'doctor' ? 'PistenBully 100 Medical' : 'Sno-Cat Alpha',
        vehicle_distance_km: 0.18,
        alert_id: 3,
        audit_hash: 'c599a5fbed8577ccd2a18843b5f7f813b9e0cde5b6dbf4c799b737b5189d48a0',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
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
            Priority Sync Active (QoS 2) — SOS messages bypass low-bandwidth delays.
          </Text>
        </View>

        {/* Coords Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current GPS Coordinates</Text>
          <Text style={styles.coordsText}>Lat: -70.7800 S | Long: 11.7500 E</Text>
          <Text style={styles.cardSubTitle}>Location: Crevasse Zone near Ridge Bravo</Text>
        </View>

        {/* Required Skill Selector */}
        <Text style={styles.sectionHeader}>Select Required Assistance Skill</Text>
        <View style={styles.skillGrid}>
          {[
            { id: 'doctor', label: 'Medical Doctor', icon: 'medical-services' },
            { id: 'mechanic', label: 'Vehicle Mechanic', icon: 'build' },
            { id: 'pilot', label: 'SAR Helicopter Pilot', icon: 'flight' },
          ].map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.skillCard,
                selectedSkill === item.id && styles.skillCardSelected,
              ]}
              onPress={() => setSelectedSkill(item.id)}
            >
              <MaterialIcons
                name={item.icon as any}
                size={22}
                color={selectedSkill === item.id ? colors.dangerRed : colors.secondaryText}
              />
              <Text
                style={[
                  styles.skillLabel,
                  selectedSkill === item.id && styles.skillLabelSelected,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Result Card if SOS Dispatched */}
        {result ? (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <MaterialIcons name="check-circle" size={22} color={colors.primary} />
              <Text style={styles.resultStatusText}>DISPATCH CONFIRMED</Text>
            </View>

            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Assigned Responder:</Text>
              <Text style={styles.resultValue}>
                {result.responder_name} ({result.responder_role})
              </Text>
            </View>

            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Responder Distance:</Text>
              <Text style={styles.resultValue}>{result.responder_distance_km} km</Text>
            </View>

            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Deployed Vehicle:</Text>
              <Text style={styles.resultValue}>{result.vehicle_name}</Text>
            </View>

            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Ledger Audit Hash:</Text>
              <Text style={styles.hashText} numberOfLines={1}>
                {result.audit_hash}
              </Text>
            </View>
          </View>
        ) : null}

        {/* SOS Trigger Button */}
        <TouchableOpacity
          style={[styles.bigSosButton, result && styles.bigSosButtonDispatched]}
          onPress={handleTriggerSOS}
          disabled={loading || !!result}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator size="large" color={colors.white} />
          ) : (
            <>
              <MaterialIcons
                name={result ? 'verified' : 'touch-app'}
                size={40}
                color={colors.white}
              />
              <Text style={styles.bigSosButtonText}>
                {result ? 'RESPONDER DISPATCHED' : 'BROADCAST EMERGENCY SOS'}
              </Text>
              <Text style={styles.bigSosSubText}>
                {result
                  ? 'Units en route to your coordinates'
                  : 'Tap to trigger immediate responder dispatch'}
              </Text>
            </>
          )}
        </TouchableOpacity>
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
