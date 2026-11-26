// Situação de uma empresa cliente: ativa, com aviso de vencimento, desabilitada ou pronta para exclusão.
// Regra única, usada pela tela e pelo servidor. Prazos contados do vencimento da mensalidade:
//   15 dias antes          -> usa normalmente, com aviso;
//   no dia do vencimento   -> desabilitada se o pagamento não foi registrado (os dados ficam guardados);
//   45 dias depois         -> pronta para exclusão (o sistema NUNCA apaga sozinho: o master confirma).
// Desativação manual pelo master (tenants.status) é permanente até reativar e não entra na fila de exclusão.
// Empresa sem assinatura cadastrada continua ativa: ninguém é suspenso por omissão.

/** Dias antes do vencimento em que o aviso começa. */
export const DIAS_AVISO = 15;
/** Dias depois do vencimento em que a empresa entra na fila de exclusão. */
export const DIAS_EXCLUSAO = 45;

export type EstadoEmpresa = "ativa" | "aviso" | "desabilitada" | "excluir";

export interface Situacao {
  estado: EstadoEmpresa;
  motivo: "manual" | "pagamento" | null;
  /** Vencimento (AAAA-MM-DD) que gerou o aviso ou o bloqueio. */
  vencimento: string | null;
  diasAtraso: number;
  /** Só no aviso: em quantos dias vence (e a empresa é desabilitada). */
  diasParaDesabilitar: number | null;
  /** Vencida e ainda não pronta para exclusão: em quantos dias entra na fila. */
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

/** "date" puro, ou meia-noite UTC (como uma data digitada é gravada), já é o dia; outro instante é convertido para Brasília. */
function diaDoVencimento(v: string | null | undefined): string {
  const m = /^(\d{4}-\d{2}-\d{2})(?:$|[T ]00:00(?::00(?:\.0+)?)?(?:Z|\+00(?::?00)?)$)/.exec(String(v ?? ""));
  return m ? m[1] : diaBR(v);
}

export function situacaoDaEmpresa(d: DadosSituacao, agora: Date | number = new Date()): Situacao {
  if (d.ehRaiz) return normal;
  if (d.status === "Inactive" || d.status === "Deleted") return { ...normal, estado: "desabilitada", motivo: "manual" };
  const a = d.assinatura;
  if (!a) return normal;
  const suspensa = a.status === "suspended" || a.status === "canceled";
  // Teste vale pelo fim do teste. Quem saiu do teste sem pagar (em atraso/suspensa) não tem período pago: continua valendo o teste.
  const bruto = a.status === "trial" ? a.trial_ends_at
    : a.current_period_end ?? (suspensa || a.status === "past_due" ? a.trial_ends_at : null);
  const venc = diaDoVencimento(bruto);
  const dias = venc ? emDias(diaBR(agora)) - emDias(venc) : null; // negativo = ainda vai vencer
  if (!suspensa && (dias === null || dias < -DIAS_AVISO)) return normal;
  const base = { motivo: "pagamento" as const, vencimento: venc || null, diasAtraso: Math.max(0, dias ?? 0) };
  if (!suspensa && dias! < 0) return { ...base, estado: "aviso", diasParaDesabilitar: -dias!, diasParaExclusao: null };
  if (dias !== null && dias >= DIAS_EXCLUSAO) return { ...base, estado: "excluir", diasParaDesabilitar: null, diasParaExclusao: 0 };
  // Suspensa antes de vencer: bloqueada, sem prazo de exclusão correndo.
  const corre = dias !== null && dias >= 0;
  return { ...base, vencimento: corre ? venc : null, estado: "desabilitada", diasParaDesabilitar: null, diasParaExclusao: corre ? DIAS_EXCLUSAO - dias : null };
}

export const bloqueiaAcesso = (s: Situacao) => s.estado === "desabilitada" || s.estado === "excluir";
