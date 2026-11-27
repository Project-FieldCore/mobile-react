import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Inspection } from './mockRepository';
import { planDeadlineReminders } from './deadlineNotificationPlan';

const NOTIFICATION_KIND = 'inspection-deadline';
let schedulingPromise: Promise<void> | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Mantém uma única notificação local por inspeção ativa. */
export function scheduleDeadlineNotifications(inspections: Inspection[]): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  if (schedulingPromise) return schedulingPromise;
  schedulingPromise = syncDeadlineNotifications(inspections)
    .catch(() => undefined)
    .finally(() => { schedulingPromise = null; });
  return schedulingPromise;
}

/** Disponível somente pelos cenários de desenvolvimento para validar o canal nativo. */
export async function scheduleNotificationTest(): Promise<void> {
  if (Platform.OS === 'web') throw new Error('Notificações locais não estão disponíveis no navegador.');
  await ensureNotificationPermission();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Teste de notificação local',
      body: 'O aviso local do FieldOps está funcionando.',
      sound: 'default',
      data: { kind: NOTIFICATION_KIND, test: true },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + 10_000),
    },
  });
}

async function syncDeadlineNotifications(inspections: Inspection[]) {
  await ensureNotificationPermission();
  const planned = planDeadlineReminders(inspections);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const existing = scheduled.filter((notification) => notification.content.data?.kind === NOTIFICATION_KIND);
  await Promise.all(existing.map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier)));
  await Promise.all(planned.map((reminder) => Notifications.scheduleNotificationAsync({
    content: {
      title: reminder.title, body: reminder.body, sound: 'default',
      data: { kind: NOTIFICATION_KIND, inspectionId: reminder.inspectionId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminder.scheduledFor,
    },
  })));
}

async function ensureNotificationPermission() {
  const permissions = await Notifications.getPermissionsAsync();
  const granted = permissions.granted || (permissions.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  if (!granted) throw new Error('Permissão de notificações não concedida.');

}
