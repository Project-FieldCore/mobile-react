import { describe, expect, it } from 'vitest';

import { mapInspectionReview, toMobileInspectionFromPull } from './syncPullMapper';
import type { MobileSyncInspectionPayload } from './syncPullApi';

const basePayload = (): MobileSyncInspectionPayload => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  clientId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  siteId: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
  templateVersionId: 'tttttttt-tttt-4ttt-8ttt-tttttttttttt',
  technicianId: 'uuuuuuuu-uuuu-4uuu-8uuu-uuuuuuuuuuuu',
  title: 'Transformador TR-01',
  priority: 'HIGH',
  status: 'ASSIGNED',
  scheduledFor: '2026-01-02T14:00:00.000Z',
  version: 2,
  updatedAt: '2026-01-01T10:00:00.000Z',
  items: [],
});

describe('toMobileInspectionFromPull review (PBI-0062.1)', () => {
  it('mapeia REJECTED + review.motivo do pull', () => {
    const inspection = toMobileInspectionFromPull({
      ...basePayload(),
      status: 'REJECTED',
      review: {
        decision: 'REJECTED',
        motivo: 'Evidência ausente no item EPI',
        reviewerId: 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr',
        reviewerName: 'Ana Silva',
        reviewedAt: '2026-11-10T18:00:00.000Z',
      },
    });

    expect(inspection.status).toBe('REJECTED');
    expect(inspection.review).toEqual({
      decision: 'REJECTED',
      motivo: 'Evidência ausente no item EPI',
      reviewerId: 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr',
      reviewerName: 'Ana Silva',
      reviewedAt: '2026-11-10T18:00:00.000Z',
    });
  });

  it('preserva review existente quando o payload omite o campo', () => {
    const existingReview = {
      decision: 'REJECTED' as const,
      motivo: 'Motivo antigo',
      reviewerId: 'r1',
      reviewedAt: '2026-11-01T00:00:00.000Z',
    };
    const inspection = toMobileInspectionFromPull(basePayload(), {
      id: basePayload().id,
      client: 'Cliente',
      site: 'Site',
      equipment: 'EQ',
      scheduledAt: '—',
      priority: 'MEDIUM',
      status: 'REJECTED',
      instructions: '',
      review: existingReview,
    });
    expect(inspection.review).toEqual(existingReview);
  });

  it('limpa review quando a API envia null', () => {
    const inspection = toMobileInspectionFromPull(
      { ...basePayload(), status: 'ASSIGNED', review: null },
      {
        id: basePayload().id,
        client: 'Cliente',
        site: 'Site',
        equipment: 'EQ',
        scheduledAt: '—',
        priority: 'MEDIUM',
        status: 'REJECTED',
        instructions: '',
        review: {
          decision: 'REJECTED',
          motivo: 'x',
          reviewerId: 'r1',
          reviewedAt: '2026-11-01T00:00:00.000Z',
        },
      },
    );
    expect(inspection.review).toBeNull();
  });

  it('mapInspectionReview normaliza campos opcionais', () => {
    expect(mapInspectionReview(undefined)).toBeUndefined();
    expect(mapInspectionReview(null)).toBeNull();
    expect(mapInspectionReview({
      decision: 'APPROVED',
      motivo: null,
      reviewerId: 'r1',
      reviewedAt: '2026-11-10T12:00:00.000Z',
    })).toEqual({
      decision: 'APPROVED',
      motivo: null,
      reviewerId: 'r1',
      reviewerName: null,
      reviewedAt: '2026-11-10T12:00:00.000Z',
    });
  });
});
