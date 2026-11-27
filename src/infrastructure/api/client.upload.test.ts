import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiUpload } from './client';

const fileCtor = vi.hoisted(() => vi.fn());
vi.mock('expo-file-system', () => ({ File: fileCtor }));

type Appended = { name: string; value: unknown; filename?: string };

describe('apiUpload (PBI-0046 / Expo SDK 58)', () => {
  const appended: Appended[] = [];
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    appended.length = 0;
    process.env.EXPO_PUBLIC_API_URL = 'http://api.test/api/v1';
    vi.stubGlobal(
      'FormData',
      class {
        append(name: string, value: unknown, filename?: string) {
          appended.push({ name, value, filename });
        }
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'e1' }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EXPO_PUBLIC_API_URL;
  });

  it('anexa um File do expo-file-system (não o formato { uri, name, type })', async () => {
    const file = { type: 'image/jpeg', bytes: vi.fn() };
    fileCtor.mockImplementation(function () {
      return file;
    });

    await apiUpload('/x/evidence', { uri: 'file:///tmp/foto.jpg', name: 'foto.jpg', type: 'image/jpeg' }, {
      accessToken: 'tok',
      refreshToken: 'r',
      expiresAt: Date.now() + 1000,
    });

    expect(fileCtor).toHaveBeenCalledWith('file:///tmp/foto.jpg');
    expect(appended).toEqual([{ name: 'file', value: file, filename: 'foto.jpg' }]);
    expect(appended[0]?.value).not.toHaveProperty('uri');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('http://api.test/api/v1/x/evidence');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    // Sem Content-Type manual: o fetch define o multipart com boundary.
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('usa o tipo esperado quando o SO não informa o mime type', async () => {
    fileCtor.mockImplementation(function () {
      return { type: '', bytes: vi.fn() };
    });

    await apiUpload('/x/evidence', { uri: 'file:///tmp/foto.png', name: 'foto.png', type: 'image/png' });

    expect(appended[0]?.value).toMatchObject({ name: 'foto.png', type: 'image/png' });
  });

  it('arquivo ilegível vira ApiError com mensagem de negócio, sem chamar a rede', async () => {
    fileCtor.mockImplementation(function () {
      throw new Error('invalid path');
    });

    await expect(apiUpload('/x/evidence', { uri: 'x', name: 'a.jpg', type: 'image/jpeg' })).rejects.toThrow(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mantém o erro padronizado da API em respostas não-ok', async () => {
    fileCtor.mockImplementation(function () {
      return { type: 'image/jpeg', bytes: vi.fn() };
    });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 413,
      json: async () => ({
        timestamp: '2026-11-26T00:00:00Z',
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Arquivo muito grande.',
        path: '/x/evidence',
      }),
    });

    await expect(apiUpload('/x/evidence', { uri: 'f', name: 'a.jpg', type: 'image/jpeg' })).rejects.toMatchObject({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Arquivo muito grande.',
    });
  });

  it('falha de rede continua com a mensagem de conexão', async () => {
    fileCtor.mockImplementation(function () {
      return { type: 'image/jpeg', bytes: vi.fn() };
    });
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    await expect(apiUpload('/x/evidence', { uri: 'f', name: 'a.jpg', type: 'image/jpeg' })).rejects.toThrow(
      /conectar ao servidor/,
    );
  });
});
