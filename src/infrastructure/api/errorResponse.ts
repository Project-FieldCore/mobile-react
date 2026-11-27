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
