/**
 * Lista de inspeções no modo API: o servidor (`/inspections/my`) só devolve as
 * ativas (ATRIBUÍDA/EM ANDAMENTO/REPROVADA). Inspeções já enviadas, aprovadas ou
 * reprovadas continuam na lista a partir da cópia local (pull/conclusão) e são
 * atualizadas pelo detalhe `/inspections/my/{id}` quando o pull não trouxe tudo.
 */
import type { Inspection } from './mockRepository';
import type { PendingOperation } from './draftStore';

/** Estados que o servidor não lista em /inspections/my, mas que o técnico precisa ver. */
const SETTLED_STATUSES = new Set<Inspection['status']>(['SUBMITTED', 'APPROVED', 'REJECTED', 'PENDING_SYNC']);

/** Dados genéricos deixados pelo pull incremental quando a cópia local não existia. */
export function isGenericInspection(inspection: Inspection): boolean {
  return inspection.client === 'Cliente' && inspection.site === 'Site';
}

/** Precisa do detalhe do servidor: enviada (aguardando decisão), decisão sem revisão ou dados genéricos. */
export function needsServerDetail(inspection: Inspection): boolean {
  if (inspection.status === 'SUBMITTED') return true;
  if ((inspection.status === 'APPROVED' || inspection.status === 'REJECTED') && !inspection.review) return true;
  return isGenericInspection(inspection);
}

/**
 * Une a lista do servidor com a cópia local: o servidor vence por id; cópias que o
 * servidor não lista são mantidas se já foram concluídas/decididas ou têm
 * operação pendente. Ativas obsoletas (ex.: reatribuídas) saem da lista.
 */
export function mergeServerWithLocal(
  server: Inspection[],
  local: Inspection[],
  operations: PendingOperation[],
): Inspection[] {
  const serverIds = new Set(server.map((inspection) => inspection.id));
  const pendingIds = new Set(operations.map((operation) => operation.inspectionId));
  const kept = local.filter((inspection) => (
    !serverIds.has(inspection.id) && (SETTLED_STATUSES.has(inspection.status) || pendingIds.has(inspection.id))
  ));
  return [...server, ...kept];
}

export type RefreshDeps = {
  fetchInspection: (id: string) => Promise<Inspection | null>;
  saveInspection: (inspection: Inspection) => Promise<void>;
};

/**
 * Atualiza (melhor esforço, sem derrubar a lista) as inspeções que precisam do
 * detalhe do servidor. Preserva o estado local quando a consulta falha.
 */
export async function refreshInspectionsFromServer(
  inspections: Inspection[],
  deps: RefreshDeps,
  skipIds: Set<string> = new Set(),
): Promise<Inspection[]> {
  return Promise.all(inspections.map(async (inspection) => {
    if (skipIds.has(inspection.id) || !needsServerDetail(inspection)) return inspection;
    try {
      const fresh = await deps.fetchInspection(inspection.id);
      if (!fresh) return inspection;
      await deps.saveInspection(fresh);
      return fresh;
    } catch {
      return inspection;
    }
  }));
}
