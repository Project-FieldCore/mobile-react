import type { Inspection } from './mockRepository';

export const DEADLINE_REMINDER_MINUTES = 30;

export type DeadlineReminder = {
  inspectionId: string;
  scheduledFor: Date;
  title: string;
  body: string;
};

/** Produz lembretes para inspeções ativas, futuras e com horário válido. */
export function planDeadlineReminders(
  inspections: Inspection[],
  now = new Date(),
  minutesBefore = DEADLINE_REMINDER_MINUTES,
): DeadlineReminder[] {
  const reminderOffset = minutesBefore * 60 * 1000;

  return inspections.flatMap((inspection) => {
    if (!['ASSIGNED', 'IN_PROGRESS'].includes(inspection.status) || !inspection.scheduledFor) return [];

    const scheduledFor = new Date(inspection.scheduledFor);
    const reminderAt = new Date(scheduledFor.getTime() - reminderOffset);
    if (Number.isNaN(scheduledFor.getTime()) || reminderAt.getTime() <= now.getTime()) return [];

    return [{
      inspectionId: inspection.id,
      scheduledFor: reminderAt,
      title: 'Prazo de inspeção próximo',
      body: `${inspection.equipment} começa em ${minutesBefore} minutos.`,
    }];
  });
}
