import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiRequest, apiUpload } from '@/infrastructure/api/client';
import { getSession } from '@/infrastructure/storage/session';
import {
  completeAssignedInspection,
  fetchAssignedInspections,
  fetchChecklist,
  startAssignedInspection,
  uploadItemEvidence,
} from './executionApi';

vi.mock('@/config/dataSource', () => ({ dataSource: 'api' }));
vi.mock('@/infrastructure/api/client', () => ({ apiRequest: vi.fn(), apiUpload: vi.fn() }));
vi.mock('@/infrastructure/storage/session', () => ({ getSession: vi.fn() }));

const mockedApiRequest = apiRequest as unknown as ReturnType<typeof vi.fn>;
const mockedApiUpload = apiUpload as unknown as ReturnType<typeof vi.fn>;
const mockedGetSession = getSession as unknown as ReturnType<typeof vi.fn>;
const session = { accessToken: 'access-token', refreshToken: 'refresh-token', expiresAt: 1 };

describe('executionApi (PBI-0065.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSession.mockResolvedValue(session);
  });

  it('carrega e adapta as inspeções atribuídas ao modelo mobile', async () => {
    mockedApiRequest.mockResolvedValueOnce([{
      id: 'inspection-1', clientName: 'Usina Solar', siteName: 'Unidade A', equipmentName: 'TR-01',
      title: 'Inspeção do transformador', instructions: 'Use EPI', priority: 'CRITICAL',
      status: 'ASSIGNED', scheduledFor: '2026-11-10T14:30:00.000Z', version: 3,
    }]);

    const inspections = await fetchAssignedInspections();

    expect(mockedApiRequest).toHaveBeenCalledWith('/inspections/my', { session });
    expect(inspections).toEqual([expect.objectContaining({
      id: 'inspection-1', client: 'Usina Solar', site: 'Unidade A', equipment: 'TR-01',
      priority: 'HIGH', status: 'ASSIGNED', version: 3,
    })]);
  });

  it('adapta o checklist e preserva os requisitos de observação e evidência', async () => {
    mockedApiRequest.mockResolvedValueOnce([{
      title: 'Segurança', order: 1, items: [{
        id: 'item-1', title: 'Proteção instalada', responseType: 'CONFORMITY', required: true,
        rulesJson: '{"observationRequiredOnFailure":true,"evidenceRequiredOnFailure":true}', optionsJson: null,
      }],
    }]);

    const sections = await fetchChecklist('inspection-1');

    expect(mockedApiRequest).toHaveBeenCalledWith('/inspections/my/inspection-1/checklist', { session });
    expect(sections[0].items[0]).toEqual(expect.objectContaining({
      id: 'item-1', type: 'conformity', required: true, observationRequired: true, evidenceRequired: true,
    }));
  });

  it('envia início, evidência e conclusão para os endpoints do técnico', async () => {
    mockedApiRequest.mockResolvedValue({
      id: 'inspection-1', clientName: 'Usina Solar', siteName: 'Unidade A', title: 'Inspeção',
      priority: 'MEDIUM', status: 'IN_PROGRESS', scheduledFor: '2026-11-10T14:30:00.000Z', version: 4,
    });

    await startAssignedInspection('inspection-1', '2026-11-10T14:00:00.000Z', { latitude: -23.5, longitude: -47.4 });
    await uploadItemEvidence('inspection-1', 'item-1', 'file:///photo.jpg');
    await completeAssignedInspection('inspection-1', 4, [{ itemId: 'item-1', valueText: 'ok' }], { latitude: -23.5, longitude: -47.4 });

    expect(mockedApiRequest).toHaveBeenCalledWith('/inspections/my/inspection-1/start', expect.objectContaining({
      method: 'POST', session, body: expect.objectContaining({ latitude: -23.5, longitude: -47.4 }),
    }));
    expect(mockedApiUpload).toHaveBeenCalledWith('/inspections/my/inspection-1/items/item-1/evidence', expect.any(Object), session);
    expect(mockedApiRequest).toHaveBeenCalledWith('/inspections/my/inspection-1/complete', expect.objectContaining({
      method: 'POST', session, body: expect.objectContaining({ version: 4, answers: [{ itemId: 'item-1', valueText: 'ok' }] }),
    }));
  });
});
