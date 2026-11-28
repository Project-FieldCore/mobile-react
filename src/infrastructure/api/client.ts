import { API_TIMEOUT_MS, getApiBaseUrl } from '@/config/api';
import type { Session } from '@/infrastructure/storage/session';
import {
  formatErrorMessage,
  NETWORK_TIMEOUT_CODE,
  NETWORK_UNAVAILABLE_CODE,
  parseErrorResponse,
  type ErrorResponse,
  type FieldError,
} from './errorResponse';
import { toUploadPart } from './uploadPart';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly path?: string,
    public readonly requestId?: string,
    public readonly fieldErrors?: FieldError[],
    public readonly timestamp?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Envelope 12.2 quando o body da API era ErrorResponse completo. */
  toErrorResponse(): ErrorResponse | null {
    if (
      this.status == null ||
      !this.code ||
      !this.path ||
      !this.timestamp ||
      !this.message
    ) {
      return null;
    }
    return {
      timestamp: this.timestamp,
      status: this.status,
      code: this.code,
      message: this.message,
      path: this.path,
      requestId: this.requestId,
      fieldErrors: this.fieldErrors,
    };
  }
}

type RequestOptions = Omit<RequestInit, 'body' | 'headers'> & {
  body?: unknown;
  headers?: Record<string, string>;
  session?: Session | null;
};

function assertApiBaseUrl(): string {
  const apiBaseUrl = getApiBaseUrl().replace(/\/$/, '');

  if (!apiBaseUrl || !/^https?:\/\//i.test(apiBaseUrl)) {
    throw new ApiError('A URL da API não foi configurada. Defina EXPO_PUBLIC_API_URL.');
  }

  return apiBaseUrl;
}

async function buildApiError(response: Response): Promise<ApiError> {
  const fallback = 'Não foi possível concluir esta operação.';
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new ApiError(fallback, response.status);
  }

  const errorResponse = parseErrorResponse(body);
  if (errorResponse) {
    return new ApiError(
      formatErrorMessage(errorResponse, fallback),
      errorResponse.status,
      errorResponse.code,
      errorResponse.path,
      errorResponse.requestId,
      errorResponse.fieldErrors,
      errorResponse.timestamp,
    );
  }

  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const message =
    (record && typeof record.message === 'string' && record.message) ||
    (record && typeof record.code === 'string' && record.code) ||
    fallback;
  const code = record && typeof record.code === 'string' ? record.code : undefined;
  return new ApiError(message, response.status, code);
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, session, ...requestOptions } = options;
  const apiBaseUrl = assertApiBaseUrl();
  const ngrokHeaders: Record<string, string> = apiBaseUrl.includes('.ngrok-free.dev') ? { 'ngrok-skip-browser-warning': 'true' } : {};
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...requestOptions,
      signal: abortController.signal,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        ...ngrokHeaders,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('A conexão com o servidor excedeu 15 segundos. Tente novamente.', undefined, NETWORK_TIMEOUT_CODE);
    }

    throw new ApiError('Não foi possível conectar ao servidor. Verifique a URL da API e a rede.', undefined, NETWORK_UNAVAILABLE_CODE);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw await buildApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

type UploadFile = { uri: string; name: string; type: string };

export async function apiUpload<T>(path: string, file: UploadFile, session?: Session | null): Promise<T> {
  const form = new FormData();
  // Expo SDK 58: o fetch exige `File`/Blob no FormData; `{ uri, name, type }` não é suportado.
  let part;
  try {
    // Import tardio: o módulo nativo só é carregado ao enviar uma foto (e não nos testes de Node).
    const { File } = await import('expo-file-system');
    part = toUploadPart(new File(file.uri), file.name, file.type);
  } catch {
    throw new ApiError('Não foi possível ler a foto selecionada. Tire a foto novamente.');
  }
  form.append('file', part as unknown as Blob, file.name);
  const abortController = new AbortController();
  const apiBaseUrl = assertApiBaseUrl();
  const ngrokHeaders: Record<string, string> = apiBaseUrl.includes('.ngrok-free.dev') ? { 'ngrok-skip-browser-warning': 'true' } : {};
  const timeout = setTimeout(() => abortController.abort(), API_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: 'POST',
      signal: abortController.signal,
      headers: {
        Accept: 'application/json',
        ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        ...ngrokHeaders,
      },
      body: form,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('A conexão com o servidor excedeu 15 segundos. Tente novamente.', undefined, NETWORK_TIMEOUT_CODE);
    }
    throw new ApiError('Não foi possível conectar ao servidor. Verifique a URL da API e a rede.', undefined, NETWORK_UNAVAILABLE_CODE);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw await buildApiError(response);
  return response.json() as Promise<T>;
}

export type { ErrorResponse, FieldError };
