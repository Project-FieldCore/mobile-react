import { describe, expect, it } from 'vitest';

import {
  formatReviewedAt,
  inspectionStatusLabel,
  isRejectedInspection,
  MISSING_REJECT_MOTIVO,
  rejectionMotivoText,
  reviewerCaption,
} from './inspectionReviewUi';

describe('inspectionReviewUi (PBI-0062.1)', () => {
  it('rotula REJECTED como Reprovada', () => {
    expect(inspectionStatusLabel('REJECTED')).toBe('Reprovada');
    expect(isRejectedInspection({ status: 'REJECTED' })).toBe(true);
  });

  it('usa fallback quando motivo está ausente ou em branco', () => {
    expect(rejectionMotivoText(null)).toBe(MISSING_REJECT_MOTIVO);
    expect(rejectionMotivoText({
      decision: 'REJECTED',
      motivo: '   ',
      reviewerId: 'r1',
      reviewedAt: '2026-11-10T12:00:00.000Z',
    })).toBe(MISSING_REJECT_MOTIVO);
    expect(rejectionMotivoText({
      decision: 'REJECTED',
      motivo: 'Evidência ausente',
      reviewerId: 'r1',
      reviewedAt: '2026-11-10T12:00:00.000Z',
    })).toBe('Evidência ausente');
  });

  it('monta revisor e data só com nome / ISO válido', () => {
    expect(reviewerCaption({
      decision: 'REJECTED',
      motivo: 'x',
      reviewerId: 'r1',
      reviewerName: 'Ana Silva',
      reviewedAt: '2026-11-10T12:00:00.000Z',
    })).toBe('Revisor: Ana Silva');
    expect(reviewerCaption({
      decision: 'REJECTED',
      motivo: 'x',
      reviewerId: 'r1',
      reviewedAt: '2026-11-10T12:00:00.000Z',
    })).toBeNull();
    expect(formatReviewedAt('2026-11-10T15:30:00.000Z')).toMatch(/^Em /);
    expect(formatReviewedAt('not-a-date')).toBeNull();
  });
});
