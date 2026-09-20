import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import Header from '../../components/Header';
import { useApp } from '../../context/AppContext';
import { colors, spacing, radius, typography, layout } from '../../theme';
import { BACKEND_URL } from '../../config';

export default function MoreScreen() {
  const router = useRouter();
  const { user, token, logout } = useApp();

  // Modals state
  const [showExpeditionModal, setShowExpeditionModal] = useState<boolean>(false);
  const [showInventoryModal, setShowInventoryModal] = useState<boolean>(false);
  const [showUserModal, setShowUserModal] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Expedition Form
  const [expName, setExpName] = useState<string>('44th Indian Expedition to Maitri');
  const [stationName, setStationName] = useState<string>('Maitri');
  const [teamSize, setTeamSize] = useState<string>('25');

  // Inventory Form
  const [itemName, setItemName] = useState<string>('Polar Diesel Fuel Drums');
  const [category, setCategory] = useState<string>('Fuel');
  const [quantity, setQuantity] = useState<string>('15000');
  const [unit, setUnit] = useState<string>('Litres');
  const [minReq, setMinReq] = useState<string>('4000');
  const [dailyUse, setDailyUse] = useState<string>('15');

  // User Provisioning Form (Leader only)
  const [newUsername, setNewUsername] = useState<string>('');
  const [newUserEmail, setNewUserEmail] = useState<string>('');
  const [newUserPassword, setNewUserPassword] = useState<string>('password123');
  const [newUserRole, setNewUserRole] = useState<string>('Logistics Officer');

  const handleLogout = async () => {
    logout();
    try {
      await SecureStore.deleteItemAsync('access_token');
    } catch (e) {}
    router.replace('/login');
  };

  const handleCreateExpedition = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/expeditions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: expName,
          station_name: stationName,
          latitude: stationName === 'Maitri' ? -70.766 : -69.407,
          longitude: stationName === 'Maitri' ? 11.733 : 76.191,
          start_date: '2025-11-15',
          end_date: '2026-04-10',
          target_team_size: parseInt(teamSize, 10) || 20,
          status: 'Active',
        }),
      });

      if (!res.ok) throw new Error(`HTTP status ${res.status}`);

      Alert.alert('Success', 'Expedition created successfully!');
      setShowExpeditionModal(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create expedition.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateInventory = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/inventory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: itemName,
          category: category,
          quantity: parseFloat(quantity) || 0,
          unit: unit,
          min_required: parseFloat(minReq) || 0,
          daily_use_per_person: parseFloat(dailyUse) || 1.0,
          location_station: stationName,
        }),
      });

      if (!res.ok) throw new Error(`HTTP status ${res.status}`);

      Alert.alert('Success', 'Inventory item added to station ledger!');
      setShowInventoryModal(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add inventory item.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProvisionUser = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: newUsername.trim(),
          email: newUserEmail.trim(),
          password: newUserPassword,
          role: newUserRole,
          station_name: stationName,
          skills: [newUserRole.toLowerCase().split(' ')[0]],
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP status ${res.status}`);
      }

      Alert.alert('Success', `User account created for ${newUsername}!`);
      setShowUserModal(false);
      setNewUsername('');
      setNewUserEmail('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to provision user.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Station Management" />
      <ScrollView contentContainerStyle={styles.content}>
        {/* User Card */}
        <View style={styles.userCard}>
          <MaterialIcons name="account-circle" size={44} color={colors.primary} />
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.username || 'Expedition Member'}</Text>
            <Text style={styles.userRole}>
              {user?.role || 'Expedition Leader'} • {user?.station_name || 'Maitri'}
            </Text>
          </View>
        </View>

        {/* Action Buttons for Data Entry */}
        <Text style={styles.sectionHeader}>Station Entry Forms</Text>
        <View style={styles.formButtonGrid}>
          <TouchableOpacity
            style={styles.formButton}
            onPress={() => setShowExpeditionModal(true)}
          >
            <MaterialIcons name="flag" size={24} color={colors.primary} />
            <Text style={styles.formButtonTitle}>Create Expedition</Text>
            <Text style={styles.formButtonSub}>Station name & team size</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.formButton}
            onPress={() => setShowInventoryModal(true)}
          >
            <MaterialIcons name="inventory" size={24} color={colors.accentOrange} />
            <Text style={styles.formButtonTitle}>Add Station Stock</Text>
            <Text style={styles.formButtonSub}>Fuel, Rations, Spares</Text>
          </TouchableOpacity>

          {user?.role === 'Expedition Leader' ? (
            <TouchableOpacity
              style={styles.formButton}
              onPress={() => setShowUserModal(true)}
            >
              <MaterialIcons name="person-add" size={24} color={colors.okGreen} />
              <Text style={styles.formButtonTitle}>Provision User Account</Text>
              <Text style={styles.formButtonSub}>Leader role management</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Module Shortcuts */}
        <Text style={styles.sectionHeader}>Analytical Tools</Text>
        <View style={styles.menuContainer}>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/planner')}>
            <MaterialIcons name="event" size={22} color={colors.primary} />
            <Text style={styles.menuText}>Expedition Planner</Text>
            <MaterialIcons name="chevron-right" size={22} color={colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/cargo')}>
            <MaterialIcons name="local-shipping" size={22} color={colors.accentOrange} />
            <Text style={styles.menuText}>Cargo & Knapsack Optimizer</Text>
            <MaterialIcons name="chevron-right" size={22} color={colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/simulator')}>
            <MaterialIcons name="equalizer" size={22} color={colors.warningAmber} />
            <Text style={styles.menuText}>What-If Simulator (Monte Carlo)</Text>
            <MaterialIcons name="chevron-right" size={22} color={colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/compliance')}>
            <MaterialIcons name="gavel" size={22} color={colors.okGreen} />
            <Text style={styles.menuText}>Environmental & Hash Audit</Text>
            <MaterialIcons name="chevron-right" size={22} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <MaterialIcons name="logout" size={20} color={colors.dangerRed} />
          <Text style={styles.logoutText}>Sign Out Account</Text>
        </TouchableOpacity>

        {/* Create Expedition Modal */}
        <Modal visible={showExpeditionModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Create Active Expedition</Text>
                <TouchableOpacity onPress={() => setShowExpeditionModal(false)}>
                  <MaterialIcons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Expedition Name</Text>
              <TextInput
                style={styles.input}
                value={expName}
                onChangeText={setExpName}
              />

              <Text style={styles.fieldLabel}>Station Name (Maitri or Bharati)</Text>
              <TextInput
                style={styles.input}
                value={stationName}
                onChangeText={setStationName}
              />

              <Text style={styles.fieldLabel}>Target Team Size</Text>
              <TextInput
                style={styles.input}
                value={teamSize}
                onChangeText={setTeamSize}
                keyboardType="numeric"
              />

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleCreateExpedition}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.submitBtnText}>SAVE EXPEDITION</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Create Inventory Modal */}
        <Modal visible={showInventoryModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Station Stock Supply</Text>
                <TouchableOpacity onPress={() => setShowInventoryModal(false)}>
                  <MaterialIcons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Item Name</Text>
              <TextInput style={styles.input} value={itemName} onChangeText={setItemName} />

              <Text style={styles.fieldLabel}>Category (Fuel, Ration, Spares, Medical)</Text>
              <TextInput style={styles.input} value={category} onChangeText={setCategory} />

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Quantity</Text>
                  <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Unit</Text>
                  <TextInput style={styles.input} value={unit} onChangeText={setUnit} />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Min Required</Text>
                  <TextInput style={styles.input} value={minReq} onChangeText={setMinReq} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Daily Use/Person</Text>
                  <TextInput style={styles.input} value={dailyUse} onChangeText={setDailyUse} keyboardType="numeric" />
                </View>
              </View>

              <TouchableOpacity style={styles.submitBtn} onPress={handleCreateInventory} disabled={submitting}>
                {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitBtnText}>ADD TO LEDGER</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Provision User Modal (Leader Only) */}
        <Modal visible={showUserModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Provision Team Account</Text>
                <TouchableOpacity onPress={() => setShowUserModal(false)}>
                  <MaterialIcons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Username</Text>
              <TextInput style={styles.input} value={newUsername} onChangeText={setNewUsername} autoCapitalize="none" />

              <Text style={styles.fieldLabel}>Email Address</Text>
              <TextInput style={styles.input} value={newUserEmail} onChangeText={setNewUserEmail} autoCapitalize="none" keyboardType="email-address" />

              <Text style={styles.fieldLabel}>Role (Logistics Officer, Base Admin, Team Member)</Text>
              <TextInput style={styles.input} value={newUserRole} onChangeText={setNewUserRole} />

              <Text style={styles.fieldLabel}>Initial Password</Text>
              <TextInput style={styles.input} value={newUserPassword} onChangeText={setNewUserPassword} secureTextEntry />

              <TouchableOpacity style={styles.submitBtn} onPress={handleProvisionUser} disabled={submitting}>
                {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitBtnText}>CREATE ACCOUNT</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 110, gap: spacing.md },
  userCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  userInfo: { flex: 1 },
  userName: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text },
  userRole: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, color: colors.secondaryText, marginTop: 2 },
  sectionHeader: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text },
  formButtonGrid: { gap: spacing.sm },
  formButton: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: 2,
  },
  formButtonTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm, color: colors.text, marginTop: 4 },
  formButtonSub: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, color: colors.secondaryText },
  menuContainer: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    gap: spacing.md,
  },
  menuText: { flex: 1, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm, color: colors.text },
  logoutButton: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  logoutText: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm, color: colors.dangerRed },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: spacing.md,
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  modalTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text },
  fieldLabel: { fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.secondaryText, marginTop: 4 },
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
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  submitBtnText: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, color: colors.white, letterSpacing: 0.5 },
});
