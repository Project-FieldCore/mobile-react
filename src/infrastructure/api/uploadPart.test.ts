import { describe, expect, it, vi } from 'vitest';

import { toUploadPart } from './uploadPart';

describe('toUploadPart (upload de evidência, Expo SDK 58)', () => {
  it('usa o próprio File quando o SO informa o content-type', () => {
    const file = { type: 'image/jpeg', bytes: vi.fn() };
    expect(toUploadPart(file, 'foto.jpg', 'image/png')).toBe(file);
  });

  it('com tipo vazio usa o tipo esperado e delega os bytes ao arquivo', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const file = { type: '', bytes: vi.fn().mockResolvedValue(bytes) };
    const part = toUploadPart(file, 'foto.png', 'image/png');

    expect(part).toMatchObject({ name: 'foto.png', type: 'image/png' });
    await expect(part.bytes()).resolves.toBe(bytes);
  });
});
