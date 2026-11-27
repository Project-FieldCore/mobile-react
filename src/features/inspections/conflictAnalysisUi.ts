import type { ConflictServerSnapshot } from './draftStore';
import type { AnswerSyncPayload } from './syncPushMapper';

const CONFORMITY_LABELS: Record<string, string> = {
  CONFORMING: 'Conforme',
  NON_CONFORMING: 'Não conforme',
  NOT_APPLICABLE: 'Não aplicável',
};

export type FormattedConflictValue = {
  primary: string;
  observation: string | null;
  empty: boolean;
};

type ValueSource = {
  conformity?: string | null;
  valueBoolean?: boolean | null;
  valueNumber?: number | null;
  valueDate?: string | null;
  valueText?: string | null;
  observation?: string | null;
};

function formatDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
}

function truncate(value: string, max = 200): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function formatConflictSide(source: ValueSource | null | undefined, emptyLabel: string): FormattedConflictValue {
  if (!source) {
    return { primary: emptyLabel, observation: null, empty: true };
  }

  let primary: string | null = null;
  if (source.conformity) {
    primary = CONFORMITY_LABELS[source.conformity] ?? source.conformity;
  } else if (typeof source.valueBoolean === 'boolean') {
    primary = source.valueBoolean ? 'Sim' : 'Não';
  } else if (typeof source.valueNumber === 'number') {
    primary = String(source.valueNumber);
  } else if (source.valueDate) {
    primary = formatDate(source.valueDate);
  } else if (source.valueText) {
    primary = truncate(source.valueText);
  }

  if (!primary) {
    return { primary: emptyLabel, observation: source.observation?.trim() || null, empty: true };
  }

  return {
    primary,
    observation: source.observation?.trim() || null,
    empty: false,
  };
}

export function formatLocalConflictValue(payload: AnswerSyncPayload | null): FormattedConflictValue {
  return formatConflictSide(payload, 'Sem valor local');
}

export function formatServerConflictValue(server: ConflictServerSnapshot | null | undefined): FormattedConflictValue {
  return formatConflictSide(server, 'Servidor sem valor gravado');
}

export function valuesDiffer(local: FormattedConflictValue, server: FormattedConflictValue): boolean {
  if (local.empty && server.empty) return false;
  return local.primary !== server.primary || (local.observation ?? '') !== (server.observation ?? '');
}

export function versionLine(entityVersion: number | null | undefined): string {
  return typeof entityVersion === 'number'
    ? `Versão no servidor: ${entityVersion}`
    : 'Versão no servidor: desconhecida';
}

export function canKeepLocal(entityVersion: number | null | undefined): boolean {
  return typeof entityVersion === 'number';
}
