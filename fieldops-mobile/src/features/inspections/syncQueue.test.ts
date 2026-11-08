import { describe, expect, it } from 'vitest';

import { canRetry, nextRetryStatus } from './syncQueue';

describe('syncQueue (PBI-0065.3)', () => {
  it('permite nova tentativa apenas para operações que falharam', () => {
    expect(canRetry('FAILED')).toBe(true);
    expect(canRetry('PENDING')).toBe(false);
    expect(canRetry('SYNCING')).toBe(false);
    expect(canRetry('CONFLICT')).toBe(false);
  });

  it('retorna falhas à fila e preserva conflitos para resolução explícita', () => {
    expect(nextRetryStatus('FAILED')).toBe('PENDING');
    expect(nextRetryStatus('CONFLICT')).toBe('CONFLICT');
  });
});
