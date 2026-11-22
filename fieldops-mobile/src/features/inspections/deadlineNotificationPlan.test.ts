import { describe, expect, it } from 'vitest';

import { planDeadlineReminders } from './deadlineNotificationPlan';
import type { Inspection } from './mockRepository';

const baseInspection: Inspection = {
  id: 'inspection-1', client: 'Cliente', site: 'Unidade', equipment: 'Bomba hidráulica',
  scheduledAt: 'Hoje, 15:00', scheduledFor: '2026-11-22T15:00:00.000Z',
  priority: 'HIGH', status: 'ASSIGNED', instructions: '',
};

describe('planDeadlineReminders (PBI-0074)', () => {
  it('agenda o lembrete 30 minutos antes para uma inspeção ativa e futura', () => {
    const reminders = planDeadlineReminders([baseInspection], new Date('2026-11-22T14:00:00.000Z'));
    expect(reminders).toEqual([expect.objectContaining({
      inspectionId: 'inspection-1', scheduledFor: new Date('2026-11-22T14:30:00.000Z'),
      title: 'Prazo de inspeção próximo', body: 'Bomba hidráulica começa em 30 minutos.',
    })]);
  });

  it('ignora inspeções concluídas, sem data, inválidas ou cujo lembrete já passou', () => {
    const invalidDate = { ...baseInspection, id: 'invalid', scheduledFor: 'não é uma data' };
    const submitted = { ...baseInspection, id: 'submitted', status: 'SUBMITTED' as const };
    const noDate = { ...baseInspection, id: 'without-date', scheduledFor: undefined };
    const tooClose = { ...baseInspection, id: 'too-close', scheduledFor: '2026-11-22T14:20:00.000Z' };
    expect(planDeadlineReminders([invalidDate, submitted, noDate, tooClose], new Date('2026-11-22T14:00:00.000Z'))).toEqual([]);
  });
});
