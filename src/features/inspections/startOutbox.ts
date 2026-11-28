/**
 * Início de inspeção offline-first (modo API): tipos da operação `START` da outbox.
 * O servidor só aceita respostas/evidências/conclusão com a inspeção EM ANDAMENTO,
 * então o início precisa chegar primeiro (`POST /inspections/my/{id}/start`).
 */
export const START_PAYLOAD_VERSION = 1;

export type StartPayload = {
  kind: 'INSPECTION_START';
  v: typeof START_PAYLOAD_VERSION;
  /** Igual ao `id` da linha da outbox: estável entre reenvios (enviado em X-Operation-Id). */
  operationId: string;
  inspectionId: string;
  /** Instante real do início no aparelho (ISO-8601). */
  startedAtDevice: string;
  latitude?: number;
  longitude?: number;
};

export function parseStartPayload(payload?: string): StartPayload | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as Partial<StartPayload>;
    if (parsed.kind !== 'INSPECTION_START' || parsed.v !== START_PAYLOAD_VERSION) return null;
    if (typeof parsed.inspectionId !== 'string' || typeof parsed.operationId !== 'string') return null;
    if (typeof parsed.startedAtDevice !== 'string') return null;
    return parsed as StartPayload;
  } catch {
    return null;
  }
}
