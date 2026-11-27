import { describe, expect, it } from 'vitest';

import {
  canKeepLocal,
  formatLocalConflictValue,
  formatServerConflictValue,
  valuesDiffer,
  versionLine,
} from './conflictAnalysisUi';

describe('conflictAnalysisUi', () => {
  it('formata lados local e servidor em PT-BR', () => {
    expect(formatLocalConflictValue({
      entityId: 'e',
      inspectionItemId: 'i',
      valueBoolean: true,
      observation: 'obs',
    })).toEqual({ primary: 'Sim', observation: 'obs', empty: false });

    expect(formatServerConflictValue({
      conformity: 'NON_CONFORMING',
      observation: null,
    })).toEqual({ primary: 'Não conforme', observation: null, empty: false });

    expect(formatServerConflictValue(null).primary).toBe('Servidor sem valor gravado');
    expect(formatLocalConflictValue(null).primary).toBe('Sem valor local');
  });

  it('detecta diferença e regra de versão', () => {
    const local = formatLocalConflictValue({ entityId: 'e', inspectionItemId: 'i', valueText: 'A' });
    const server = formatServerConflictValue({ valueText: 'B' });
    expect(valuesDiffer(local, server)).toBe(true);
    expect(versionLine(3)).toBe('Versão no servidor: 3');
    expect(versionLine(null)).toBe('Versão no servidor: desconhecida');
    expect(canKeepLocal(2)).toBe(true);
    expect(canKeepLocal(null)).toBe(false);
  });
});
