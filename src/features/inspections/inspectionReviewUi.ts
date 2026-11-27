import { colors } from '@/design-system/tokens';
import type { Inspection, InspectionReview, InspectionStatus } from './mockRepository';

export const MISSING_REJECT_MOTIVO =
  'Sem orientação detalhada. Fale com o supervisor.';

export function inspectionStatusLabel(status: InspectionStatus): string {
  switch (status) {
    case 'ASSIGNED':
      return 'Atribuída';
    case 'IN_PROGRESS':
      return 'Em andamento';
    case 'SUBMITTED':
      return 'Enviada';
    case 'PENDING_SYNC':
      return 'Aguardando sincronização';
    case 'CANCELED':
      return 'Cancelada';
    case 'APPROVED':
      return 'Aprovada';
    case 'REJECTED':
      return 'Reprovada';
    default:
      return status;
  }
}

export function inspectionStatusColor(status: InspectionStatus): string {
  if (status === 'REJECTED') return colors.danger;
  if (status === 'APPROVED') return colors.success;
  if (status === 'CANCELED') return colors.textMuted;
  return colors.navy;
}

export function isRejectedInspection(inspection: Pick<Inspection, 'status'>): boolean {
  return inspection.status === 'REJECTED';
}

/** Motivo / orientação for REJECTED banner (defensive fallback when blank). */
export function rejectionMotivoText(review?: InspectionReview | null): string {
  const trimmed = review?.motivo?.trim();
  return trimmed ? trimmed : MISSING_REJECT_MOTIVO;
}

export function formatReviewedAt(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `Em ${date.toLocaleString('pt-BR')}`;
}

export function reviewerCaption(review?: InspectionReview | null): string | null {
  const name = review?.reviewerName?.trim();
  return name ? `Revisor: ${name}` : null;
}

/** Título (eyebrow) do detalhe conforme o estado da inspeção. */
export function inspectionHeadline(status: InspectionStatus): string {
  switch (status) {
    case 'REJECTED': return 'INSPEÇÃO REPROVADA';
    case 'APPROVED': return 'INSPEÇÃO APROVADA';
    case 'SUBMITTED': return 'INSPEÇÃO ENVIADA';
    case 'PENDING_SYNC': return 'AGUARDANDO SINCRONIZAÇÃO';
    case 'CANCELED': return 'INSPEÇÃO CANCELADA';
    case 'IN_PROGRESS': return 'INSPEÇÃO EM ANDAMENTO';
    default: return 'INSPEÇÃO ATRIBUÍDA';
  }
}

/** Só inspeções atribuídas/em andamento permitem iniciar ou continuar o checklist. */
export function canExecuteInspection(status: InspectionStatus): boolean {
  return status === 'ASSIGNED' || status === 'IN_PROGRESS';
}

export function isApprovedInspection(inspection: Pick<Inspection, 'status'>): boolean {
  return inspection.status === 'APPROVED';
}

/** Comentário do revisor numa aprovação (pode vir vazio). */
export function approvalComment(review?: InspectionReview | null): string | null {
  return review?.motivo?.trim() || null;
}
