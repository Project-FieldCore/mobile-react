import type {
  ChecklistSection,
  Inspection,
  InspectionPriority,
  InspectionReview,
  InspectionStatus,
} from './mockRepository';
import type {
  MobileSyncInspectionItem,
  MobileSyncInspectionPayload,
  MobileSyncInspectionReview,
  MobileSyncResponsePayload,
} from './syncPullApi';

const PRIORITY: Record<MobileSyncInspectionPayload['priority'], InspectionPriority> = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'HIGH',
};

const CONFORMITY_TO_LABEL: Record<string, string> = {
  CONFORMING: 'Conforme',
  NON_CONFORMING: 'Não conforme',
  NOT_APPLICABLE: 'Não aplicável',
};

function formatWhen(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function mapStatus(status: string): InspectionStatus {
  switch (status) {
    case 'ASSIGNED':
    case 'IN_PROGRESS':
    case 'SUBMITTED':
    case 'PENDING_SYNC':
    case 'CANCELED':
    case 'APPROVED':
    case 'REJECTED':
      return status;
    // Formal review in progress on server — technician already submitted.
    case 'UNDER_REVIEW':
      return 'SUBMITTED';
    default:
      return 'ASSIGNED';
  }
}

export function mapInspectionReview(
  review?: MobileSyncInspectionReview | null,
): InspectionReview | null | undefined {
  if (review == null) return review;
  return {
    decision: review.decision,
    motivo: review.motivo ?? null,
    reviewerId: review.reviewerId,
    reviewerName: review.reviewerName ?? null,
    reviewedAt: review.reviewedAt,
  };
}

function itemType(responseType: string): ChecklistSection['items'][number]['type'] {
  switch (responseType) {
    case 'NUMBER':
      return 'number';
    case 'BOOLEAN':
      return 'boolean';
    case 'CONFORMITY':
      return 'conformity';
    case 'SINGLE_CHOICE':
      return 'choice';
    case 'DATE':
      return 'date';
    case 'TEXT_LONG':
      return 'long';
    default:
      return 'text';
  }
}

export function toChecklistSections(items: MobileSyncInspectionItem[]): ChecklistSection[] {
  const bySection = new Map<string, { order: number; title: string; items: ChecklistSection['items'] }>();
  const sorted = [...items].sort((left, right) => (
    left.sectionOrder - right.sectionOrder || left.itemOrder - right.itemOrder
  ));

  for (const item of sorted) {
    const key = `${item.sectionOrder}:${item.sectionTitle}`;
    const section = bySection.get(key) ?? {
      order: item.sectionOrder,
      title: item.sectionTitle,
      items: [],
    };
    section.items.push({
      id: item.id,
      label: item.itemTitle,
      type: itemType(item.responseType),
      required: item.required,
      options: item.optionsJson ? (JSON.parse(item.optionsJson) as string[]) : undefined,
      observationRequired: item.rulesJson?.includes('"observationRequiredOnFailure":true') ?? false,
      evidenceRequired: item.rulesJson?.includes('"evidenceRequiredOnFailure":true') ?? false,
    });
    bySection.set(key, section);
  }

  return [...bySection.values()]
    .sort((left, right) => left.order - right.order)
    .map((section) => ({
      id: `${section.order}-${section.title}`,
      title: section.title,
      items: section.items,
    }));
}

export function toMobileInspectionFromPull(
  payload: MobileSyncInspectionPayload,
  existing?: Inspection | null,
): Inspection {
  const review = mapInspectionReview(payload.review);
  return {
    id: payload.id,
    client: existing?.client ?? 'Cliente',
    site: existing?.site ?? 'Site',
    equipment: existing?.equipment ?? payload.title,
    scheduledAt: formatWhen(payload.scheduledFor),
    scheduledFor: payload.scheduledFor ?? undefined,
    priority: PRIORITY[payload.priority] ?? 'MEDIUM',
    status: mapStatus(payload.status),
    instructions: payload.instructions ?? existing?.instructions ?? '',
    startedAt: payload.startedAtDevice ?? payload.startedAtServer ?? existing?.startedAt,
    version: payload.version,
    // Explicit null clears a prior review; undefined keeps existing when API omits the field.
    review: review !== undefined ? review : existing?.review,
  };
}

export function responseValueToAnswer(payload: MobileSyncResponsePayload): string | null {
  if (payload.conformity) {
    return CONFORMITY_TO_LABEL[payload.conformity] ?? payload.conformity;
  }
  if (typeof payload.valueBoolean === 'boolean') {
    return payload.valueBoolean ? 'Sim' : 'Não';
  }
  if (typeof payload.valueNumber === 'number') {
    return String(payload.valueNumber);
  }
  if (payload.valueDate) return payload.valueDate;
  if (payload.valueText) return payload.valueText;
  return null;
}
