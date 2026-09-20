import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
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

interface AuditLogEntry {
  id: number;
  action: string;
  performed_by: string;
  target_resource: string;
  payload: string | null;
  timestamp: string;
  prev_hash: string;
  hash: string;
  short_hash: string;
}

interface VerificationResult {
  valid: boolean;
  count?: number;
  broken_id?: number;
  index?: number;
  reason?: string;
  message?: string;
}

export default function ComplianceScreen() {
  const router = useRouter();
  const { token } = useApp();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [verification, setVerification] = useState<VerificationResult | null>(null);

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/audit`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
      console.log('Error fetching audit logs:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      const res = await fetch(`${BACKEND_URL}/audit/verify`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: VerificationResult = await res.json();
        setVerification(data);
      }
    } catch (e) {
      console.log('Error verifying audit chain:', e);
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setVerification(null);
    fetchAuditLogs();
  };

  const formatTimestamp = (isoStr: string) => {
    try {
      const date = new Date(isoStr);
      return date.toLocaleString();
    } catch (e) {
      return isoStr;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Compliance & Audit Ledger" />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={20} color={colors.text} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.verifyBtn}
          onPress={handleVerifyChain}
          disabled={verifying}
        >
          {verifying ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <>
              <MaterialIcons name="security" size={16} color={colors.white} />
              <Text style={styles.verifyBtnText}>VERIFY CHAIN</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

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
        {/* Verification Status Banner */}
        {verification ? (
          verification.valid ? (
            <View style={styles.validBanner}>
              <MaterialIcons name="check-circle" size={24} color={colors.okGreen} />
              <View style={{ flex: 1 }}>
                <Text style={styles.validTitle}>
                  Chain Verified, {verification.count ?? logs.length} entries
                </Text>
                <Text style={styles.validSub}>
                  Cryptographic SHA-256 hash chain is intact and untampered.
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.invalidBanner}>
              <MaterialIcons name="gavel" size={24} color={colors.dangerRed} />
              <View style={{ flex: 1 }}>
                <Text style={styles.invalidTitle}>
                  Tampered at entry #{verification.index !== undefined ? verification.index + 1 : verification.broken_id}
                </Text>
                <Text style={styles.invalidSub}>
                  {verification.reason || 'Cryptographic hash mismatch detected!'}
                </Text>
              </View>
            </View>
          )
        ) : (
          <View style={styles.infoBanner}>
            <MaterialIcons name="verified-user" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Audit Chain Integrity Engine</Text>
              <Text style={styles.infoSub}>
                Every action is cryptographically hash-chained with SHA-256. Tap 'VERIFY CHAIN' to validate ledger integrity.
              </Text>
            </View>
          </View>
        )}

        {/* Audit Log Entries */}
        <Text style={styles.sectionHeader}>Audit Trail Ledger ({logs.length} Entries)</Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : logs.length > 0 ? (
          logs.map((item, idx) => {
            const isTampered =
              verification &&
              !verification.valid &&
              (item.id === verification.broken_id || idx === verification.index);

            return (
              <View
                key={item.id}
                style={[
                  styles.logCard,
                  isTampered && styles.logCardTampered,
                ]}
              >
                <View style={styles.logHeader}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.actionTitle,
                        isTampered && styles.actionTitleTampered,
                      ]}
                    >
                      {item.action}
                    </Text>
                    <Text style={styles.logTime}>{formatTimestamp(item.timestamp)}</Text>
                  </View>

                  {isTampered ? (
                    <View style={styles.tamperedBadge}>
                      <MaterialIcons name="warning" size={14} color={colors.dangerRed} />
                      <Text style={styles.tamperedBadgeText}>TAMPERED ENTRY</Text>
                    </View>
                  ) : (
                    <View style={styles.hashBadge}>
                      <Text style={styles.hashBadgeText}>
                        #{item.id} • {item.short_hash || item.hash.substring(0, 8)}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>User:</Text>
                  <Text style={styles.detailValue}>{item.performed_by}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Resource:</Text>
                  <Text style={styles.detailValue}>{item.target_resource}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Hash:</Text>
                  <Text style={styles.hashText} numberOfLines={1} ellipsizeMode="middle">
                    {item.hash}
                  </Text>
                </View>

                {item.payload ? (
                  <View style={styles.payloadBox}>
                    <Text style={styles.payloadLabel}>Payload:</Text>
                    <Text style={styles.payloadText} numberOfLines={2}>
                      {item.payload}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })
        ) : (
          <View style={styles.emptyCard}>
            <MaterialIcons name="history" size={40} color={colors.secondaryText} />
            <Text style={styles.emptyTitle}>No Audit Entries Logged</Text>
            <Text style={styles.emptySub}>
              Audit log entries are recorded automatically whenever users perform station operations.
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm, color: colors.text },
  verifyBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.button,
  },
  verifyBtnText: { fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.white, letterSpacing: 0.5 },
  scrollContent: { padding: spacing.md, gap: spacing.md, paddingBottom: 60 },
  validBanner: {
    backgroundColor: colors.okGreen + '15',
    borderColor: colors.okGreen + '40',
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  validTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm, color: colors.okGreen },
  validSub: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, color: colors.text, marginTop: 2 },
  invalidBanner: {
    backgroundColor: colors.dangerRed + '15',
    borderColor: colors.dangerRed + '40',
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  invalidTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm, color: colors.dangerRed },
  invalidSub: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, color: colors.text, marginTop: 2 },
  infoBanner: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  infoTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm, color: colors.text },
  infoSub: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, color: colors.secondaryText, marginTop: 2 },
  sectionHeader: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text },
  logCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: spacing.xs,
  },
  logCardTampered: {
    backgroundColor: colors.dangerRed + '10',
    borderColor: colors.dangerRed,
    borderWidth: 2,
  },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  actionTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm, color: colors.primary },
  actionTitleTampered: { color: colors.dangerRed },
  logTime: { fontFamily: typography.fontFamily.regular, fontSize: 10, color: colors.secondaryText, marginTop: 1 },
  hashBadge: { backgroundColor: colors.chipBackground, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  hashBadgeText: { fontFamily: typography.fontFamily.medium, fontSize: 10, color: colors.secondaryText },
  tamperedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.dangerRed + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  tamperedBadgeText: { fontFamily: typography.fontFamily.bold, fontSize: 10, color: colors.dangerRed },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, color: colors.secondaryText },
  detailValue: { fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.xs, color: colors.text },
  hashText: { fontFamily: typography.fontFamily.regular, fontSize: 10, color: colors.secondaryText, flex: 1, textAlign: 'right', marginLeft: 16 },
  payloadBox: { backgroundColor: colors.background, padding: spacing.xs, borderRadius: radius.button, marginTop: 4 },
  payloadLabel: { fontFamily: typography.fontFamily.bold, fontSize: 10, color: colors.secondaryText },
  payloadText: { fontFamily: typography.fontFamily.regular, fontSize: 10, color: colors.text, marginTop: 1 },
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
