import React, { useEffect, useState, useMemo } from 'react';
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
import { MaterialIcons } from '@expo/vector-icons';
import Header from '../../components/Header';
import { useApp } from '../../context/AppContext';
import { colors, spacing, radius, typography } from '../../theme';
import { BACKEND_URL } from '../../config';

interface Person {
  id: number;
  name: string;
  role: string;
  skills: string[];
  station_name: string;
  status: string;
  phone?: string;
  vehicle_assigned?: string;
  latitude?: number;
  longitude?: number;
  last_location_update?: string;
}

interface Vehicle {
  id: number;
  name: string;
  type: string;
  status: string;
  station_name: string;
  weather_limit: string;
  latitude: number;
  longitude: number;
}

export default function TeamScreen() {
  const { token, user } = useApp();
  const [people, setPeople] = useState<Person[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedSkill, setSelectedSkill] = useState<string>('All');

  const fetchData = async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [peopleRes, usersRes, vehicleRes] = await Promise.all([
        fetch(`${BACKEND_URL}/people`, { headers }),
        fetch(`${BACKEND_URL}/users`, { headers }),
        fetch(`${BACKEND_URL}/vehicles`, { headers }),
      ]);

      let peopleList: Person[] = [];
      if (peopleRes.ok) {
        peopleList = await peopleRes.json();
      }

      if (usersRes.ok) {
        const users = await usersRes.json();
        users.forEach((u: any) => {
          const exists = peopleList.some(
            p => p.name.toLowerCase() === (u.username || '').toLowerCase()
          );
          if (!exists) {
            peopleList.push({
              id: 1000 + u.id,
              name: u.username || u.email,
              role: u.role || 'Team Member',
              skills: u.skills || ['general'],
              station_name: u.station_name || 'Maitri',
              status: 'Active',
              last_location_update: u.last_location_update,
            });
          }
        });
      }

      setPeople(peopleList);

      if (vehicleRes.ok) {
        const vehData = await vehicleRes.json();
        setVehicles(vehData);
      }
    } catch (err) {
      console.warn('Error fetching team roster:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const allSkills = useMemo(() => {
    const skillSet = new Set<string>();
    people.forEach(p => {
      if (Array.isArray(p.skills)) {
        p.skills.forEach(s => skillSet.add(s.toLowerCase()));
      }
    });
    return ['All', ...Array.from(skillSet)];
  }, [people]);

  const filteredPeople = useMemo(() => {
    if (selectedSkill === 'All') return people;
    return people.filter(
      p =>
        Array.isArray(p.skills) &&
        p.skills.some(s => s.toLowerCase() === selectedSkill.toLowerCase())
    );
  }, [people, selectedSkill]);

  const getLocationFreshness = (lastUpdate?: string) => {
    if (!lastUpdate) return { isFresh: false, label: 'No update recorded' };
    const dateMs = new Date(lastUpdate).getTime();
    if (isNaN(dateMs)) return { isFresh: false, label: 'No update recorded' };
    const diffMs = Date.now() - dateMs;
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return { isFresh: true, label: 'updated just now' };
    if (diffMins <= 10) return { isFresh: true, label: `updated ${diffMins} min ago` };
    if (diffMins < 60) return { isFresh: false, label: `updated ${diffMins} min ago` };
    const diffHours = Math.floor(diffMins / 60);
    return { isFresh: false, label: `updated ${diffHours} hr${diffHours > 1 ? 's' : ''} ago` };
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Station Personnel & Team" />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading station roster & vehicles...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        >
          {/* Section Header */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Personnel Roster ({filteredPeople.length})</Text>
            <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
              <MaterialIcons name="refresh" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Skill Filter Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScrollView}
            contentContainerStyle={styles.chipContainer}
          >
            {allSkills.map(skill => {
              const active = selectedSkill.toLowerCase() === skill.toLowerCase();
              return (
                <TouchableOpacity
                  key={skill}
                  onPress={() => setSelectedSkill(skill)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {skill.charAt(0).toUpperCase() + skill.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Personnel Cards */}
          {filteredPeople.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="group-off" size={44} color={colors.secondaryText} />
              <Text style={styles.emptyTitle}>No Personnel Found</Text>
              <Text style={styles.emptySub}>No team members match the selected skill filter.</Text>
            </View>
          ) : (
            filteredPeople.map(person => {
              const freshness = getLocationFreshness(person.last_location_update);
              return (
                <View key={person.id} style={styles.personCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.avatarBox}>
                      <Text style={styles.avatarText}>{person.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.mainInfo}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.personName}>{person.name}</Text>
                        {(person.name.toLowerCase() === (user?.username || '').toLowerCase() || person.name.toLowerCase() === (user?.email || '').toLowerCase()) ? (
                          <View style={{ backgroundColor: colors.primaryIce, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, borderWidth: 1, borderColor: colors.cardBorder }}>
                            <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: 10, color: colors.primary }}>You</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.personRole}>{person.role}</Text>
                      <Text style={styles.stationLabel}>
                        <MaterialIcons name="location-on" size={13} color={colors.primary} /> {person.station_name} Station
                      </Text>
                    </View>
                    {/* Fresh / Stale Badge */}
                    <View style={[styles.badge, freshness.isFresh ? styles.badgeFresh : styles.badgeStale]}>
                      <View style={[styles.badgeDot, freshness.isFresh ? styles.dotFresh : styles.dotStale]} />
                      <Text style={[styles.badgeText, freshness.isFresh ? styles.textFresh : styles.textStale]}>
                        {freshness.isFresh ? 'Fresh' : 'Stale'}
                      </Text>
                    </View>
                  </View>

                  {/* Skills Tags */}
                  <View style={styles.tagsContainer}>
                    {Array.isArray(person.skills) &&
                      person.skills.map((s, idx) => (
                        <View key={idx} style={styles.skillTag}>
                          <Text style={styles.skillTagText}>#{s}</Text>
                        </View>
                      ))}
                  </View>

                  {/* Footer */}
                  <View style={styles.cardFooter}>
                    <Text style={styles.updateText}>
                      <MaterialIcons name="access-time" size={13} color={colors.secondaryText} /> {freshness.label}
                    </Text>
                    <View style={styles.statusPill}>
                      <Text style={styles.statusText}>{person.status || 'Active'}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}

          {/* Vehicles Section */}
          <View style={[styles.sectionHeader, { marginTop: spacing.xl }]}>
            <Text style={styles.sectionTitle}>Station Fleet & Vehicles ({vehicles.length})</Text>
          </View>

          {vehicles.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="directions-car" size={40} color={colors.secondaryText} />
              <Text style={styles.emptyTitle}>No Vehicles Registered</Text>
            </View>
          ) : (
            vehicles.map(veh => (
              <View key={veh.id} style={styles.vehicleCard}>
                <View style={styles.vehicleIconBox}>
                  <MaterialIcons
                    name={
                      veh.type === 'Helicopter'
                        ? 'flight'
                        : veh.type === 'Sno-Cat'
                        ? 'commute'
                        : 'two-wheeler'
                    }
                    size={24}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.vehicleInfo}>
                  <Text style={styles.vehicleName}>{veh.name}</Text>
                  <Text style={styles.vehicleDetails}>
                    {veh.type} • {veh.station_name} • Limit: {veh.weather_limit}
                  </Text>
                  <Text style={styles.vehicleCoords}>
                    Location: {veh.latitude.toFixed(3)}°, {veh.longitude.toFixed(3)}°
                  </Text>
                </View>
                <View style={[styles.statusPill, veh.status === 'Available' ? styles.pillAvailable : styles.pillBusy]}>
                  <Text style={styles.statusText}>{veh.status}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    color: colors.secondaryText,
  },
  content: {
    padding: spacing.md,
    paddingBottom: 100,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.base,
    color: colors.text,
  },
  refreshBtn: {
    padding: spacing.xs,
  },
  chipScrollView: {
    marginBottom: spacing.md,
  },
  chipContainer: {
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.circle,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.base,
    color: colors.text,
  },
  emptySub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    color: colors.secondaryText,
    textAlign: 'center',
  },
  personCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.base,
    color: colors.primary,
  },
  mainInfo: {
    flex: 1,
  },
  personName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.base,
    color: colors.text,
  },
  personRole: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    color: colors.secondaryText,
  },
  stationLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    color: colors.primary,
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.default,
    gap: 4,
  },
  badgeFresh: {
    backgroundColor: '#DCFCE7',
  },
  badgeStale: {
    backgroundColor: '#FEF3C7',
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotFresh: {
    backgroundColor: '#16A34A',
  },
  dotStale: {
    backgroundColor: '#D97706',
  },
  badgeText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 11,
  },
  textFresh: {
    color: '#15803D',
  },
  textStale: {
    color: '#B45309',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.xs,
  },
  skillTag: {
    backgroundColor: colors.background,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.default,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  skillTagText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.secondaryText,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  updateText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.secondaryText,
  },
  statusPill: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.default,
  },
  statusText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 11,
    color: colors.text,
  },
  vehicleCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    marginBottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  vehicleIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.card,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    color: colors.text,
  },
  vehicleDetails: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.secondaryText,
  },
  vehicleCoords: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 10,
    color: colors.secondaryText,
    marginTop: 2,
  },
  pillAvailable: {
    backgroundColor: '#DCFCE7',
  },
  pillBusy: {
    backgroundColor: '#FEE2E2',
  },
});
