import React, { useEffect, useState } from 'react';
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
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Header from '../components/Header';
import { useApp } from '../context/AppContext';
import { colors, spacing, radius, typography } from '../theme';
import { BACKEND_URL } from '../config';

interface UserItem {
  id: number;
  username: string;
  email: string;
  role: string;
  station_name: string;
  skills: string[];
}

const AVAILABLE_SKILLS = ['doctor', 'mechanic', 'pilot', 'engineer'];
const ROLES = ['Expedition Leader', 'Logistics Officer', 'Base Admin', 'Team Member'];

export default function UsersScreen() {
  const router = useRouter();
  const { token, user } = useApp();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showRoleModal, setShowRoleModal] = useState<boolean>(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Form State
  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [role, setRole] = useState<string>('Team Member');
  const [stationName, setStationName] = useState<string>('Maitri');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  // Role Edit State
  const [newRoleForSelected, setNewRoleForSelected] = useState<string>('Team Member');

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.log('Error fetching users:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const toggleSkill = (skill: string) => {
    if (selectedSkills.includes(skill)) {
      setSelectedSkills(selectedSkills.filter((s) => s !== skill));
    } else {
      setSelectedSkills([...selectedSkills, skill]);
    }
  };

  const handleAddUser = async () => {
    if (!username.trim() || !email.trim()) {
      Alert.alert('Validation Error', 'Username and email are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password: password,
          role: role,
          station_name: stationName,
          skills: selectedSkills,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP status ${res.status}`);
      }

      Alert.alert('Success', `User account created for ${username}!`);
      setShowAddModal(false);
      setUsername('');
      setEmail('');
      setSelectedSkills([]);
      fetchUsers();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create user account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/users/${selectedUser.id}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRoleForSelected }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP status ${res.status}`);
      }

      Alert.alert('Success', `Updated role for ${selectedUser.username} to ${newRoleForSelected}!`);
      setShowRoleModal(false);
      fetchUsers();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update user role.');
    } finally {
      setSubmitting(false);
    }
  };

  const isLeader = user?.role === 'Expedition Leader';
  const isTeamMember = user?.role === 'Team Member';

  if (isTeamMember) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header title="Personnel & Roles" />
        <View style={styles.restrictedBox}>
          <MaterialIcons name="lock" size={40} color={colors.secondaryText} />
          <Text style={styles.restrictedTitle}>Restricted</Text>
          <Text style={styles.restrictedText}>
            Personnel & role management is only available to the Expedition Leader, Logistics Officer and Base Admin.
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={20} color={colors.text} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Personnel & Roles" />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={20} color={colors.text} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        {isLeader ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
            <MaterialIcons name="person-add" size={18} color={colors.white} />
            <Text style={styles.addBtnText}>Provision Account</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{item.username}</Text>
                  <Text style={styles.userEmail}>{item.email} • {item.station_name}</Text>
                </View>

                {isLeader ? (
                  <TouchableOpacity
                    style={styles.roleBadge}
                    onPress={() => {
                      setSelectedUser(item);
                      setNewRoleForSelected(item.role);
                      setShowRoleModal(true);
                    }}
                  >
                    <Text style={styles.roleBadgeText}>{item.role}</Text>
                    <MaterialIcons name="edit" size={12} color={colors.primary} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.roleBadgeReadOnly}>
                    <Text style={styles.roleBadgeText}>{item.role}</Text>
                  </View>
                )}
              </View>

              {item.skills && item.skills.length > 0 ? (
                <View style={styles.skillsContainer}>
                  <Text style={styles.skillsLabel}>Skills:</Text>
                  {item.skills.map((s, idx) => (
                    <View key={idx} style={styles.skillPill}>
                      <Text style={styles.skillPillText}>{s}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No registered personnel accounts found.</Text>
          }
        />
      )}

      {/* Add User Modal with Skills Multi-select */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Provision Station Account</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <MaterialIcons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Username</Text>
            <TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" />

            <Text style={styles.fieldLabel}>Email Address</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />

            <Text style={styles.fieldLabel}>Initial Password</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />

            <Text style={styles.fieldLabel}>Role</Text>
            <View style={styles.chipRow}>
              {ROLES.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.chip, role === r ? styles.chipActive : null]}
                  onPress={() => setRole(r)}
                >
                  <Text style={[styles.chipText, role === r ? styles.chipTextActive : null]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Station Name</Text>
            <TextInput style={styles.input} value={stationName} onChangeText={setStationName} />

            <Text style={styles.fieldLabel}>Skills Multi-Select</Text>
            <View style={styles.chipRow}>
              {AVAILABLE_SKILLS.map((sk) => {
                const isSel = selectedSkills.includes(sk);
                return (
                  <TouchableOpacity
                    key={sk}
                    style={[styles.chip, isSel ? styles.chipActive : null]}
                    onPress={() => toggleSkill(sk)}
                  >
                    <Text style={[styles.chipText, isSel ? styles.chipTextActive : null]}>
                      {isSel ? '✓ ' : ''}{sk}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleAddUser} disabled={submitting}>
              {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitBtnText}>PROVISION USER</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Change Role Modal */}
      <Modal visible={showRoleModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Role for {selectedUser?.username}</Text>
              <TouchableOpacity onPress={() => setShowRoleModal(false)}>
                <MaterialIcons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Select New Role</Text>
            <View style={styles.chipRow}>
              {ROLES.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.chip, newRoleForSelected === r ? styles.chipActive : null]}
                  onPress={() => setNewRoleForSelected(r)}
                >
                  <Text style={[styles.chipText, newRoleForSelected === r ? styles.chipTextActive : null]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleUpdateRole} disabled={submitting}>
              {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitBtnText}>UPDATE ROLE</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  restrictedBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  restrictedTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    color: colors.text,
    marginTop: spacing.sm,
  },
  restrictedText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    color: colors.secondaryText,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  backText: { fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm, color: colors.text },
  addBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.button,
  },
  addBtnText: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, color: colors.white },
  listContent: { padding: spacing.md, gap: spacing.sm, paddingBottom: 60 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  userName: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base, color: colors.text },
  userEmail: { fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, color: colors.secondaryText },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeReadOnly: { backgroundColor: colors.cardBorder, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  roleBadgeText: { fontFamily: typography.fontFamily.bold, fontSize: 11, color: colors.primary },
  skillsContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  skillsLabel: { fontFamily: typography.fontFamily.medium, fontSize: 11, color: colors.secondaryText },
  skillPill: { backgroundColor: colors.okGreen + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  skillPillText: { fontFamily: typography.fontFamily.medium, fontSize: 10, color: colors.okGreen },
  emptyText: { textAlign: 'center', marginTop: 40, fontFamily: typography.fontFamily.regular, color: colors.secondaryText },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.md },
  modalCard: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.lg, gap: spacing.xs },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 4 },
  chip: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: typography.fontFamily.medium, fontSize: 11, color: colors.text },
  chipTextActive: { color: colors.white },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  submitBtnText: { fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, color: colors.white, letterSpacing: 0.5 },
});
