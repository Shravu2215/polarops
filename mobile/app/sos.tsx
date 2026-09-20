import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius, typography, layout } from '../theme';

export default function SOSScreen() {
  const router = useRouter();
  const [selectedSkill, setSelectedSkill] = useState<string>('doctor');
  const [sosSent, setSosSent] = useState<boolean>(false);

  const handleTriggerSOS = () => {
    setSosSent(true);
    Alert.alert(
      '🚨 SOS ALERT BROADCASTED',
      `Emergency priority message (QoS 2) dispatched to Maitri Base. Nearest ${selectedSkill} and Sno-Cat assigned.`,
      [{ text: 'OK' }]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Emergency SOS Dispatch</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.alertBanner}>
          <MaterialIcons name="warning" size={32} color={colors.dangerRed} />
          <Text style={styles.alertBannerText}>
            Priority Sync Active (QoS 2) — Emergency alerts bypass low-bandwidth delays.
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
                size={24}
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

        {/* Massive SOS Trigger Button */}
        <TouchableOpacity
          style={[styles.bigSosButton, sosSent && styles.bigSosButtonSent]}
          onPress={handleTriggerSOS}
          activeOpacity={0.8}
        >
          <MaterialIcons name="touch-app" size={48} color={colors.white} />
          <Text style={styles.bigSosButtonText}>
            {sosSent ? 'SOS BROADCAST ACTIVE' : 'PRESS TO BROADCAST SOS'}
          </Text>
          <Text style={styles.bigSosSubText}>
            {sosSent ? 'Dispatched to nearest responder' : 'Hold or Tap for Emergency Dispatch'}
          </Text>
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
    paddingBottom: spacing.xl,
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
    fontSize: typography.fontSize.lg,
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
  bigSosButton: {
    backgroundColor: colors.dangerRed,
    borderRadius: radius.card,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  bigSosButtonSent: {
    backgroundColor: colors.okGreen,
  },
  bigSosButtonText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    color: colors.white,
    letterSpacing: 1,
  },
  bigSosSubText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.white,
    opacity: 0.9,
  },
});
