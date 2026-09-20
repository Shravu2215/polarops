import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme';

export default function ComplianceScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Compliance & Audit Ledger</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.placeholderCard}>
          <MaterialIcons name="verified-user" size={48} color={colors.okGreen} />
          <Text style={styles.title}>Environmental & Tamper-Proof Audit</Text>
          <Text style={styles.sub}>
            SHA-256 Hash Chain verification engine & waste returned environmental compliance tracker.
          </Text>
        </View>
      </ScrollView>
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
  headerTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.lg, color: colors.text },
  content: { padding: spacing.md },
  placeholderCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  title: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.lg, color: colors.text },
  sub: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm, color: colors.secondaryText, textAlign: 'center' },
});
