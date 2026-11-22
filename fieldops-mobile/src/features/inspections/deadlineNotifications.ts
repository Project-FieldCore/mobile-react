import { AndroidImportance } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Inspection } from './mockRepository';
import { planDeadlineReminders } from './deadlineNotificationPlan';

const NOTIFICATION_KIND = 'inspection-deadline';
const CHANNEL_ID = 'inspection-deadlines';
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

async function syncDeadlineNotifications(inspections: Inspection[]) {
  const permissions = await Notifications.getPermissionsAsync();
  const granted = permissions.granted || (permissions.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  if (!granted) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Prazos de inspeção', importance: AndroidImportance.HIGH,
    });
  }

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
      channelId: CHANNEL_ID,
    },
  })));
}
