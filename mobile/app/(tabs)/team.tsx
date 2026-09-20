import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Header from '../../components/Header';
import { colors, spacing, radius, typography } from '../../theme';

export default function TeamScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Station Personnel & Team" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.placeholderCard}>
          <Text style={styles.title}>Personnel & Duty Hours Tracker</Text>
          <Text style={styles.sub}>
            Expedition team member locations, skills, duty hours & contact details will appear here.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: 100,
  },

  placeholderCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    color: colors.text,
  },
  sub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    color: colors.secondaryText,
    textAlign: 'center',
  },
});
