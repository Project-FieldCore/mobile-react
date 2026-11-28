/**
 * ErrorResponse do contrato OpenAPI (doc. 12.2 / fieldops-v1.yaml).
 * Campos obrigatórios: timestamp, status, code, message, path.
 */

export type FieldError = {
  field: string;
  message: string;
};

export type ErrorResponse = {
  timestamp: string;
  status: number;
  code: string;
  message: string;
  path: string;
  requestId?: string;
  fieldErrors?: FieldError[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Extrai ErrorResponse quando o body segue o contrato; senão null. */
export function parseErrorResponse(body: unknown): ErrorResponse | null {
  if (!isRecord(body)) return null;
  const { timestamp, status, code, message, path, requestId, fieldErrors } = body;
  if (
    typeof timestamp !== 'string' ||
    typeof status !== 'number' ||
    typeof code !== 'string' ||
    typeof message !== 'string' ||
    typeof path !== 'string'
  ) {
    return null;
  }

  const parsed: ErrorResponse = { timestamp, status, code, message, path };
  if (typeof requestId === 'string') parsed.requestId = requestId;
  if (Array.isArray(fieldErrors)) {
    parsed.fieldErrors = fieldErrors
      .filter(isRecord)
      .filter((e) => typeof e.field === 'string' && typeof e.message === 'string')
      .map((e) => ({ field: e.field as string, message: e.message as string }));
  }
  return parsed;
}

export function formatErrorMessage(error: ErrorResponse, fallback: string): string {
  if (error.fieldErrors && error.fieldErrors.length > 0) {
    const parts = error.fieldErrors.map((e) => e.message).filter(Boolean);
    if (parts.length > 0) return parts.join(' ');
  }
  return error.message || error.code || fallback;
}

/** Códigos locais (não vêm da API) para falhas de rede/timeout do cliente HTTP. */
export const NETWORK_UNAVAILABLE_CODE = 'NETWORK_UNAVAILABLE';
export const NETWORK_TIMEOUT_CODE = 'NETWORK_TIMEOUT';

/**
 * `true` quando a requisição nem chegou ao servidor (sem rede, DNS, recusa de
 * conexão ou timeout). Respostas HTTP 4xx/5xx NÃO são indisponibilidade.
 */
export function isNetworkUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { status, code } = error as Error & { status?: number; code?: string };
  return status == null && (code === NETWORK_UNAVAILABLE_CODE || code === NETWORK_TIMEOUT_CODE);
}
