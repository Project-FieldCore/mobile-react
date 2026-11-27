import type { SendOutcome } from './batchSync';
import type { EvidenceUploadStatus, InspectionDraft, LocalEvidence, PendingOperation } from './draftStore';

export type SendEvidenceDeps = {
  getDraft: (inspectionId: string) => Promise<InspectionDraft | undefined>;
  upload: (inspectionId: string, itemId: string, uri: string) => Promise<void>;
  setUploadStatus: (inspectionId: string, uri: string, status: EvidenceUploadStatus) => Promise<void>;
};

function parseEvidence(payload?: string): LocalEvidence | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as Partial<LocalEvidence>;
    return typeof parsed.uri === 'string' ? (parsed as LocalEvidence) : null;
  } catch {
    return null;
  }
}

/**
 * Sobe a foto pendente de um item. Se já subiu (upload online imediato), apenas
 * limpa a operação, sem reenviar. Fotos sem item não têm destino na API e ficam
 * na fila. Falhas de rede propagam (a operação fica FAILED para nova tentativa).
 */
export async function sendEvidenceOperation(
  operation: PendingOperation,
  deps: SendEvidenceDeps,
): Promise<SendOutcome> {
  const evidence = parseEvidence(operation.payload);
  if (!evidence) return { kind: 'failed', message: 'A operação de evidência está incompleta.' };
  if (!evidence.itemId) return { kind: 'skipped' };

  const draft = await deps.getDraft(operation.inspectionId);
  const current = draft?.evidence.find((item) => item.uri === evidence.uri);
  if (current?.uploadStatus === 'UPLOADED') return { kind: 'applied' };

  await deps.upload(operation.inspectionId, evidence.itemId, evidence.uri);
  // O rascunho pode já ter sido limpo na conclusão; não recria um rascunho vazio.
  if (draft) await deps.setUploadStatus(operation.inspectionId, evidence.uri, 'UPLOADED');
  return { kind: 'applied' };
}
