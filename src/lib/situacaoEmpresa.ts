// Situação de uma empresa cliente: ativa, com aviso de atraso, desabilitada ou pronta para exclusão.
// Regra única, usada pela tela e pelo servidor. Prazos contados do vencimento da mensalidade não paga:
//   dias 1 a 15  -> usa normalmente, com aviso;
//   dia 16 em diante -> desabilitada (não entra; os dados ficam guardados);
//   dia 45 em diante -> pronta para exclusão (o sistema NUNCA apaga sozinho: o master confirma).
// Desativação manual pelo master (tenants.status) é permanente até reativar e não entra na fila de exclusão.
// Empresa sem assinatura cadastrada continua ativa: ninguém é suspenso por omissão.

export const DIAS_AVISO = 15;
export const DIAS_EXCLUSAO = 45;

export type EstadoEmpresa = "ativa" | "aviso" | "desabilitada" | "excluir";

export interface Situacao {
  estado: EstadoEmpresa;
  motivo: "manual" | "pagamento" | null;
  /** Vencimento que está em aberto (AAAA-MM-DD), quando há atraso. */
  vencimento: string | null;
  diasAtraso: number;
  /** Só no aviso: em quantos dias a empresa é desabilitada. */
  diasParaDesabilitar: number | null;
  /** Atrasada e ainda não pronta para exclusão: em quantos dias entra na fila. */
  diasParaExclusao: number | null;
}

export interface DadosSituacao {
  /** tenants.status */
  status?: string | null;
  assinatura?: { status?: string | null; current_period_end?: string | null; trial_ends_at?: string | null } | null;
  /** A empresa dona do sistema nunca é suspensa. */
  ehRaiz?: boolean;
}

/** Dia no horário de Brasília (AAAA-MM-DD) de um instante; vazio se ilegível. */
export function diaBR(iso: string | number | Date | null | undefined): string {
  const t = iso instanceof Date ? iso.getTime() : typeof iso === "number" ? iso : Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? new Date(t - 3 * 3_600_000).toISOString().slice(0, 10) : "";
}

const emDias = (dia: string) => Math.round(Date.parse(`${dia}T12:00:00Z`) / 86_400_000);

const normal: Situacao = { estado: "ativa", motivo: null, vencimento: null, diasAtraso: 0, diasParaDesabilitar: null, diasParaExclusao: null };

export function situacaoDaEmpresa(d: DadosSituacao, agora: Date | number = new Date()): Situacao {
  if (d.ehRaiz) return normal;
  if (d.status === "Inactive" || d.status === "Deleted") return { ...normal, estado: "desabilitada", motivo: "manual" };
  const a = d.assinatura;
  if (!a) return normal;
  // "date" puro (AAAA-MM-DD) já é o dia; instante completo é convertido para o dia em Brasília.
  const bruto = a.status === "trial" ? a.trial_ends_at : a.current_period_end;
  const venc = typeof bruto === "string" && /^\d{4}-\d{2}-\d{2}$/.test(bruto) ? bruto : diaBR(bruto);
  const dias = venc ? Math.max(0, emDias(diaBR(agora)) - emDias(venc)) : 0;
  const suspensa = a.status === "suspended" || a.status === "canceled";
  if (!suspensa && dias <= 0) return normal;
  const base = { motivo: "pagamento" as const, vencimento: dias > 0 ? venc : null, diasAtraso: dias };
  if (dias >= DIAS_EXCLUSAO) return { ...base, estado: "excluir", diasParaDesabilitar: null, diasParaExclusao: 0 };
  if (suspensa || dias > DIAS_AVISO) return { ...base, estado: "desabilitada", diasParaDesabilitar: null, diasParaExclusao: dias > 0 ? DIAS_EXCLUSAO - dias : null };
  return { ...base, estado: "aviso", diasParaDesabilitar: DIAS_AVISO + 1 - dias, diasParaExclusao: DIAS_EXCLUSAO - dias };
}

export const bloqueiaAcesso = (s: Situacao) => s.estado === "desabilitada" || s.estado === "excluir";
