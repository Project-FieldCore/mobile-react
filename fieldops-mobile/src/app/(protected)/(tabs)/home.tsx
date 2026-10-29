import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, colors, gradients, radius, shadows, spacing, typography } from '@/design-system';
import { useAuthStore } from '@/features/auth/store';

// Home is a tab route.

type Priority = 'alta' | 'media' | 'baixa';

type UpcomingInspection = {
  id: string;
  client: string;
  equipment: string;
  time: string;
  priority: Priority;
};

// Dados mockados; substituir por GET /mobile/inspections na Sprint 3.
const STATS = [
  {
    key: 'pending',
    label: 'Pendentes',
    value: 5,
    icon: 'clipboard-outline' as const,
    color: colors.navy,
  },
  {
    key: 'done',
    label: 'Concluídas hoje',
    value: 2,
    icon: 'checkmark-circle-outline' as const,
    color: colors.green,
  },
  {
    key: 'late',
    label: 'Em atraso',
    value: 1,
    icon: 'alert-circle-outline' as const,
    color: colors.danger,
  },
];

const UPCOMING: UpcomingInspection[] = [
  {
    id: '1',
    client: 'Usina Vale do Sol',
    equipment: 'Transformador TR-04',
    time: 'Hoje, 14:30',
    priority: 'alta',
  },
  {
    id: '2',
    client: 'Distribuidora Norte',
    equipment: 'Painel elétrico PE-12',
    time: 'Hoje, 16:00',
    priority: 'media',
  },
  {
    id: '3',
    client: 'Terminal Logístico Sul',
    equipment: 'Gerador GE-07',
    time: 'Amanhã, 09:00',
    priority: 'baixa',
  },
];

const PRIORITY_LABEL: Record<Priority, string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

const PRIORITY_COLOR: Record<Priority, string> = {
  alta: colors.danger,
  media: '#B7791F',
  baixa: colors.green,
};

export default function HomeScreen() {
  const signOut = useAuthStore((state) => state.signOut);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerTopRow}>
          <View>
            <Text style={styles.greeting}>Olá, técnico!</Text>
            <Text style={styles.subtitle}>Aqui está o resumo do seu dia</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sair da conta"
            onPress={() => void signOut()}
            style={styles.logoutButton}
          >
            <Ionicons name="log-out-outline" size={22} color={colors.textOnDark} />
          </Pressable>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsRow}>
          {STATS.map((stat) => (
            <Card key={stat.key} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: `${stat.color}1A` }]}>
                <Ionicons name={stat.icon} size={20} color={stat.color} />
              </View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </Card>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Próximas inspeções</Text>
        <View style={styles.list}>
          {UPCOMING.map((inspection) => (
            <Card key={inspection.id} style={styles.inspectionCard}>
              <View
                style={[
                  styles.priorityStripe,
                  { backgroundColor: PRIORITY_COLOR[inspection.priority] },
                ]}
              />
              <View style={styles.inspectionBody}>
                <View style={styles.inspectionHeader}>
                  <Text style={styles.inspectionClient}>{inspection.client}</Text>
                  <View
                    style={[
                      styles.priorityBadge,
                      { backgroundColor: `${PRIORITY_COLOR[inspection.priority]}1A` },
                    ]}
                  >
                    <Text
                      style={[styles.priorityText, { color: PRIORITY_COLOR[inspection.priority] }]}
                    >
                      {PRIORITY_LABEL[inspection.priority]}
                    </Text>
                  </View>
                </View>
                <Text style={styles.inspectionEquipment}>{inspection.equipment}</Text>
                <View style={styles.inspectionFooter}>
                  <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.inspectionTime}>{inspection.time}</Text>
                </View>
              </View>
            </Card>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    gap: spacing.xs,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoutButton: {
    padding: spacing.sm,
  },
  greeting: {
    ...typography.title,
    color: colors.textOnDark,
  },
  subtitle: {
    ...typography.body,
    color: colors.textOnDark,
    opacity: 0.85,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    ...typography.title,
    fontSize: 20,
    color: colors.navy,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  sectionTitle: {
    ...typography.subtitle,
    color: colors.text,
  },
  list: {
    gap: spacing.sm,
  },
  inspectionCard: {
    flexDirection: 'row',
    padding: 0,
    overflow: 'hidden',
    ...shadows.card,
  },
  priorityStripe: {
    width: 4,
  },
  inspectionBody: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  inspectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inspectionClient: {
    ...typography.subtitle,
    color: colors.text,
    flexShrink: 1,
  },
  priorityBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  priorityText: {
    ...typography.caption,
    fontWeight: '700',
  },
  inspectionEquipment: {
    ...typography.body,
    color: colors.textMuted,
  },
  inspectionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  inspectionTime: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
