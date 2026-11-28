/**
 * Mensagens de falha de sincronização exibidas na tela "Sincronização".
 * Traduz o `code` do ErrorResponse do servidor (quando conhecido) e sempre
 * acrescenta o código, para o técnico/suporte saber o motivo real da falha.
 */

const KNOWN_CODES: Record<string, string> = {
  INSPECTION_NOT_IN_PROGRESS: 'A inspeção não está em andamento no servidor.',
  INSPECTION_NOT_STARTABLE: 'A inspeção não pode mais ser iniciada (já foi concluída ou cancelada).',
  INSPECTION_INCOMPLETE: 'Há itens obrigatórios sem resposta, observação ou evidência.',
  VERSION_CONFLICT: 'A inspeção foi alterada no servidor. Sincronize novamente.',
  OPERATION_IN_PROGRESS: 'O servidor ainda está processando esta operação. Tente novamente em instantes.',
};

/** Mensagem pt-BR para um erro da API; erros sem `code` mantêm a própria mensagem. */
export function describeSyncError(error: unknown, fallback = 'Não foi possível enviar a operação.'): string {
  const message = error instanceof Error && error.message ? error.message : fallback;
  const code = typeof (error as { code?: unknown } | null)?.code === 'string' ? (error as { code: string }).code : undefined;
  if (!code) return message;
  const known = KNOWN_CODES[code];
  return known ? `${known} [${code}]` : `${message} [${code}]`;
}

/** Prefixos que identificam recibos terminais do servidor (não reaplicáveis com o mesmo operationId). */
export const REJECTED_MESSAGE_PREFIX = 'O servidor rejeitou a operação';
export const DEPENDENCY_FAILED_MESSAGE = 'A operação ficou bloqueada por falha em uma dependência.';

export function isTerminalReceiptMessage(message?: string): boolean {
  return Boolean(message) && (message!.startsWith(REJECTED_MESSAGE_PREFIX) || message === DEPENDENCY_FAILED_MESSAGE);
}
