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
import { BACKEND_URL, DEMO_PASSWORD } from '../config';
import { useApp } from '../context/AppContext';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const router = useRouter();
  const { setUser, setToken } = useApp();
  const [isSignUp, setIsSignUp] = useState<boolean>(false);

  // Sign In Form State
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');

  // Sign Up Form State
  const [regUsername, setRegUsername] = useState<string>('');
  const [regEmail, setRegEmail] = useState<string>('');
  const [regPassword, setRegPassword] = useState<string>('');
  const [regRole, setRegRole] = useState<string>('Team Member');
  const [regStation, setRegStation] = useState<string>('Maitri');

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);



  const handleSignIn = async () => {
    if (!loginEmail.trim() || !loginPassword) {
      setErrorMessage('Please enter your email/username and password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${BACKEND_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Invalid credentials (${response.status})`);
      }

      const data = await response.json();
      setUser(data.user);
      setToken(data.access_token);

      try {
        await SecureStore.setItemAsync('access_token', data.access_token);
      } catch (e) {}

      router.replace('/(tabs)');
    } catch (err: any) {
      console.log('Login failed:', err);
      setErrorMessage(
        err.message || `Unable to reach backend at ${BACKEND_URL}. Check network connection.`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!regUsername.trim() || !regEmail.trim() || !regPassword) {
      setErrorMessage('Username, email, and password are all required.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${BACKEND_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regUsername.trim(),
          email: regEmail.trim(),
          password: regPassword,
          role: regRole,
          station_name: regStation,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Registration failed (${response.status})`);
      }

      const data = await response.json();
      setUser(data.user);
      setToken(data.access_token);

      try {
        await SecureStore.setItemAsync('access_token', data.access_token);
      } catch (e) {}

      router.replace('/(tabs)');
    } catch (err: any) {
      console.log('Registration failed:', err);
      setErrorMessage(err.message || 'Registration failed. Username or email may exist.');
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
            <Text style={styles.subTitle}>Antarctic Expedition Operations Engine</Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            {/* Mode Switcher Tabs */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabButton, !isSignUp && styles.tabButtonActive]}
                onPress={() => {
                  setIsSignUp(false);
                  setErrorMessage(null);
                }}
              >
                <Text style={[styles.tabText, !isSignUp && styles.tabTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabButton, isSignUp && styles.tabButtonActive]}
                onPress={() => {
                  setIsSignUp(true);
                  setErrorMessage(null);
                }}
              >
                <Text style={[styles.tabText, isSignUp && styles.tabTextActive]}>
                  Create Account
                </Text>
              </TouchableOpacity>
            </View>

            {errorMessage ? (
              <View style={styles.errorCard}>
                <MaterialIcons name="error-outline" size={18} color={colors.dangerRed} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {!isSignUp ? (
              /* --- SIGN IN FORM --- */
              <View style={styles.formContent}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email or Username</Text>
                  <View style={styles.inputWrapper}>
                    <MaterialIcons name="person" size={20} color={colors.secondaryText} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Enter username or email"
                      placeholderTextColor={colors.secondaryText}
                      value={loginEmail}
                      onChangeText={setLoginEmail}
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <View style={styles.inputWrapper}>
                    <MaterialIcons name="lock" size={20} color={colors.secondaryText} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Enter password"
                      placeholderTextColor={colors.secondaryText}
                      value={loginPassword}
                      onChangeText={setLoginPassword}
                      secureTextEntry
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleSignIn}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <>
                      <Text style={styles.actionButtonText}>SIGN IN</Text>
                      <MaterialIcons name="arrow-forward" size={18} color={colors.white} />
                    </>
                  )}
                </TouchableOpacity>

                {/* Quick Demo Login Presets — all 4 roles (DEV only) */}
                {__DEV__ && (
                  <View style={{ marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.cardBorder }}>
                    <Text style={{ fontFamily: typography.fontFamily.medium, fontSize: 11, color: colors.secondaryText, marginBottom: spacing.xs }}>
                      QUICK FILL — DEMO ACCOUNTS:
                    </Text>
                    <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                      {/* Leader */}
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          alignItems: 'center',
                          backgroundColor: colors.primaryIce,
                          borderColor: colors.primary,
                          borderWidth: 1,
                          borderRadius: radius.button,
                          paddingHorizontal: spacing.xs,
                          paddingVertical: 8,
                          gap: 3,
                        }}
                        onPress={() => {
                          setLoginEmail('leader@polarops.in');
                          setLoginPassword(DEMO_PASSWORD);
                        }}
                      >
                        <MaterialIcons name="stars" size={16} color={colors.primary} />
                        <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 10, color: colors.primary, textAlign: 'center' }}>
                          Leader
                        </Text>
                      </TouchableOpacity>

                      {/* Officer */}
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          alignItems: 'center',
                          backgroundColor: '#EDF7F0',
                          borderColor: '#34A853',
                          borderWidth: 1,
                          borderRadius: radius.button,
                          paddingHorizontal: spacing.xs,
                          paddingVertical: 8,
                          gap: 3,
                        }}
                        onPress={() => {
                          setLoginEmail('officer@polarops.in');
                          setLoginPassword(DEMO_PASSWORD);
                        }}
                      >
                        <MaterialIcons name="shield" size={16} color="#34A853" />
                        <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 10, color: '#34A853', textAlign: 'center' }}>
                          Officer
                        </Text>
                      </TouchableOpacity>

                      {/* Base Admin */}
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          alignItems: 'center',
                          backgroundColor: '#FEF3C7',
                          borderColor: '#D97706',
                          borderWidth: 1,
                          borderRadius: radius.button,
                          paddingHorizontal: spacing.xs,
                          paddingVertical: 8,
                          gap: 3,
                        }}
                        onPress={() => {
                          setLoginEmail('admin@polarops.in');
                          setLoginPassword(DEMO_PASSWORD);
                        }}
                      >
                        <MaterialIcons name="admin-panel-settings" size={16} color="#D97706" />
                        <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 10, color: '#D97706', textAlign: 'center' }}>
                          Admin
                        </Text>
                      </TouchableOpacity>

                      {/* Team Member */}
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          alignItems: 'center',
                          backgroundColor: '#F3F4F6',
                          borderColor: colors.secondaryText,
                          borderWidth: 1,
                          borderRadius: radius.button,
                          paddingHorizontal: spacing.xs,
                          paddingVertical: 8,
                          gap: 3,
                        }}
                        onPress={() => {
                          setLoginEmail('member@polarops.in');
                          setLoginPassword(DEMO_PASSWORD);
                        }}
                      >
                        <MaterialIcons name="person" size={16} color={colors.secondaryText} />
                        <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 10, color: colors.secondaryText, textAlign: 'center' }}>
                          Member
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={{ fontFamily: typography.fontFamily.regular, fontSize: 10, color: colors.secondaryText, marginTop: 4, textAlign: 'center' }}>
                      Tap a role → fills credentials → press Sign In
                    </Text>
                  </View>
                )}
              </View>

            ) : (
              /* --- SIGN UP FORM --- */
              <View style={styles.formContent}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Username</Text>
                  <View style={styles.inputWrapper}>
                    <MaterialIcons name="person-outline" size={20} color={colors.secondaryText} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. rajesh_gupta"
                      placeholderTextColor={colors.secondaryText}
                      value={regUsername}
                      onChangeText={setRegUsername}
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email Address</Text>
                  <View style={styles.inputWrapper}>
                    <MaterialIcons name="email" size={20} color={colors.secondaryText} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. rajesh@polarops.in"
                      placeholderTextColor={colors.secondaryText}
                      value={regEmail}
                      onChangeText={setRegEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <View style={styles.inputWrapper}>
                    <MaterialIcons name="lock" size={20} color={colors.secondaryText} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Create a password"
                      placeholderTextColor={colors.secondaryText}
                      value={regPassword}
                      onChangeText={setRegPassword}
                      secureTextEntry
                    />
                  </View>
                </View>

                {/* Security Note on Assigned Role */}
                <View style={styles.roleNoteCard}>
                  <MaterialIcons name="security" size={16} color={colors.primary} />
                  <Text style={styles.roleNoteText}>
                    Account Role: <Text style={{ fontFamily: typography.fontFamily.bold }}>Team Member</Text>
                  </Text>
                </View>
                <Text style={styles.roleSubNote}>
                  New registrations are created as Team Member. Leadership & Officer roles are provisioned by station authority.
                </Text>

                {/* Station Selector */}
                <Text style={styles.inputLabel}>Assigned Research Station</Text>
                <View style={styles.stationRow}>
                  {['Maitri', 'Bharati'].map((st) => (
                    <TouchableOpacity
                      key={st}
                      style={[
                        styles.stationOption,
                        regStation === st && styles.stationOptionActive,
                      ]}
                      onPress={() => setRegStation(st)}
                    >
                      <Text
                        style={[
                          styles.stationOptionText,
                          regStation === st && styles.stationOptionTextActive,
                        ]}
                      >
                        {st} Station
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleSignUp}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <>
                      <Text style={styles.actionButtonText}>CREATE ACCOUNT & SIGN IN</Text>
                      <MaterialIcons name="check" size={18} color={colors.white} />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}



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
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconCircle: {
    width: 52,
    height: 52,
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
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: spacing.md,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radius.button,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    alignItems: 'center',
    borderRadius: radius.button - 2,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
  },
  tabTextActive: {
    color: colors.white,
  },
  errorCard: {
    backgroundColor: '#FDF2F2',
    borderColor: '#F8D7D7',
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.sm,
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
  formContent: {
    gap: spacing.sm,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    color: colors.text,
    marginTop: 2,
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
  roleNoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryIce,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  roleNoteText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.primary,
  },
  roleSubNote: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 10,
    color: colors.secondaryText,
    marginBottom: spacing.xs,
  },
  stationRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stationOption: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  stationOptionActive: {
    backgroundColor: colors.primaryIce,
    borderColor: colors.primary,
  },
  stationOptionText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.secondaryText,
  },
  stationOptionTextActive: {
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
  },
  actionButton: {
    height: layout.minButtonHeight,
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionButtonText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    color: colors.white,
    letterSpacing: 0.5,
  },
  configNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  configNoticeText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    color: colors.primary,
  },
  urlEditWrapper: {
    gap: 4,
    marginTop: spacing.xs,
  },
  textInputUrl: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.text,
  },

});
