import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearInspectionDraft, mergeServerAnswers } from './draftStore';
import {
  deleteDownloadedInspection,
  readDownloadedInspections,
  saveDownloadedChecklist,
  saveDownloadedInspection,
} from './mockRepository';
import { applyPullChanges } from './syncPullApply';
import type { MobileSyncChange } from './syncPullApi';

vi.mock('./draftStore', () => ({
  clearInspectionDraft: vi.fn(),
  mergeServerAnswers: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./mockRepository', () => ({
  deleteDownloadedInspection: vi.fn().mockResolvedValue(undefined),
  readDownloadedInspections: vi.fn().mockResolvedValue([]),
  saveDownloadedChecklist: vi.fn().mockResolvedValue(undefined),
  saveDownloadedInspection: vi.fn().mockResolvedValue(undefined),
}));

const mockedSaveInspection = saveDownloadedInspection as unknown as ReturnType<typeof vi.fn>;
const mockedSaveChecklist = saveDownloadedChecklist as unknown as ReturnType<typeof vi.fn>;
const mockedDelete = deleteDownloadedInspection as unknown as ReturnType<typeof vi.fn>;
const mockedRead = readDownloadedInspections as unknown as ReturnType<typeof vi.fn>;
const mockedMerge = mergeServerAnswers as unknown as ReturnType<typeof vi.fn>;
const mockedClear = clearInspectionDraft as unknown as ReturnType<typeof vi.fn>;

const inspectionUpsert = (): MobileSyncChange => ({
  entityType: 'INSPECTION',
  entityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  operation: 'UPSERT',
  updatedAt: '2026-01-01T10:00:00.000Z',
  payload: {
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
    items: [{
      id: 'iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii',
      sectionTitle: 'Segurança',
      sectionOrder: 0,
      itemTitle: 'EPI',
      responseType: 'CONFORMITY',
      required: true,
      itemOrder: 0,
      rulesJson: '{"observationRequiredOnFailure":true}',
    }],
  },
});

describe('applyPullChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRead.mockResolvedValue([]);
  });

  it('faz UPSERT de inspeção + checklist e UPSERT de resposta no draft', async () => {
    const responseUpsert: MobileSyncChange = {
      entityType: 'INSPECTION_RESPONSE',
      entityId: 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr',
      operation: 'UPSERT',
      updatedAt: '2026-01-01T10:01:00.000Z',
      payload: {
        id: 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr',
        inspectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        inspectionItemId: 'iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii',
        conformity: 'NON_CONFORMING',
        observation: 'Trinca',
        version: 1,
        updatedAt: '2026-01-01T10:01:00.000Z',
      },
    };

    const result = await applyPullChanges([inspectionUpsert(), responseUpsert]);

    expect(result).toEqual({ upsertedInspections: 1, upsertedResponses: 1, deletedInspections: 0 });
    expect(mockedSaveInspection).toHaveBeenCalledWith(expect.objectContaining({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      equipment: 'Transformador TR-01',
      status: 'ASSIGNED',
      version: 2,
    }));
    expect(mockedSaveChecklist).toHaveBeenCalledWith(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      [expect.objectContaining({
        title: 'Segurança',
        items: [expect.objectContaining({ id: 'iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii', label: 'EPI', type: 'conformity' })],
      })],
    );
    expect(mockedMerge).toHaveBeenCalledWith(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      { 'iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii': 'Não conforme' },
      'Trinca',
      1,
    );
  });

  it('DELETE remove inspeção local pelo entityId do envelope', async () => {
    const result = await applyPullChanges([{
      entityType: 'INSPECTION',
      entityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      operation: 'DELETE',
      updatedAt: '2026-01-01T11:00:00.000Z',
      payload: null,
    }]);

    expect(result.deletedInspections).toBe(1);
    expect(mockedDelete).toHaveBeenCalledWith('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(mockedClear).toHaveBeenCalledWith('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });
});
