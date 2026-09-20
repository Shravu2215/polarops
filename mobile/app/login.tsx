import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { colors, spacing, radius, typography, layout } from '../theme';
import { BACKEND_URL } from '../config';
import { useApp } from '../context/AppContext';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const router = useRouter();
  const { setUser, setToken } = useApp();
  const [email, setEmail] = useState<string>('leader@polarops.in');
  const [password, setPassword] = useState<string>('password123');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMessage('Please enter both email/username and password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${BACKEND_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password: password,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Server status ${response.status}`);
      }

      const data = await response.json();
      setUser(data.user);
      setToken(data.access_token);

      // Save token securely
      try {
        await SecureStore.setItemAsync('access_token', data.access_token);
      } catch (e) {
        console.log('SecureStore write failed:', e);
      }

      router.replace('/(tabs)');
    } catch (err: any) {
      console.log('Login failed:', err);
      setErrorMessage(err.message || 'Invalid credentials or server unreachable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header Branding */}
          <View style={styles.headerSection}>
            <View style={styles.iconCircle}>
              <MaterialIcons name="ac-unit" size={32} color={colors.primary} />
            </View>
            <Text style={styles.appTitle}>PolarOps</Text>
            <Text style={styles.subTitle}>Antarctic Expedition Operations</Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Account Sign In</Text>

            {errorMessage ? (
              <View style={styles.errorCard}>
                <MaterialIcons name="error-outline" size={18} color={colors.dangerRed} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* Email / Username Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email or Username</Text>
              <View style={styles.inputWrapper}>
                <MaterialIcons name="email" size={20} color={colors.secondaryText} />
                <TextInput
                  style={styles.textInput}
                  placeholder="leader@polarops.in"
                  placeholderTextColor={colors.secondaryText}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
            </View>

            {/* Password Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.inputWrapper}>
                <MaterialIcons name="lock" size={20} color={colors.secondaryText} />
                <TextInput
                  style={styles.textInput}
                  placeholder="••••••••"
                  placeholderTextColor={colors.secondaryText}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>
            </View>

            {/* Login Submit Button */}
            <TouchableOpacity
              style={styles.loginButton}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <>
                  <Text style={styles.loginButtonText}>LOGIN TO POLAROPS</Text>
                  <MaterialIcons name="arrow-forward" size={18} color={colors.white} />
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.hintText}>
              Default Bootstrap Admin: leader@polarops.in / password123
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.md,
    paddingTop: spacing.xl,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.circle,
    backgroundColor: colors.primaryIce,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  appTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xxl,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  subTitle: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    color: colors.secondaryText,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    color: colors.text,
  },
  errorCard: {
    backgroundColor: '#FDF2F2',
    borderColor: '#F8D7D7',
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.dangerRed,
  },
  inputGroup: {
    gap: spacing.xs,
  },
  inputLabel: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    color: colors.text,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    height: layout.minButtonHeight,
    gap: spacing.sm,
  },
  textInput: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    color: colors.text,
  },
  loginButton: {
    height: layout.minButtonHeight,
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  loginButtonText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    color: colors.white,
    letterSpacing: 0.5,
  },
  hintText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.secondaryText,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
