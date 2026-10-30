// Construção das etapas de um funil de CRM (crm_funis) — extraído de
// usePipeline.ts, que tinha essa lógica duplicada quase idêntica em
// useLeadDetails.ts (e agora também precisada pela página de Implementações,
// pra espelhar o mesmo funil de Implementação do Pipeline). Fonte única.

// Etapas OBRIGATÓRIAS de todo funil comercial/SDR, de qualquer empresa: Ganho, Perdido e Desqualificado.
// Desqualificado é onde o Agente Secreto joga as conversas que não são comerciais (venda de produto).
// O papel é reconhecido pelo NOME (então "Venda ganha"/"Venda perdida" do Kommo contam), e a mesma regra
// é imposta no banco (trigger crm_funis_etapas_obrigatorias) — manter os dois em sincronia.
export const ETAPAS_SISTEMA = [
  { id: "ganho", nome: "Ganho", cor: "emerald", re: /ganh[oa]/i },
  { id: "perdido", nome: "Perdido", cor: "rose", re: /perdid[oa]/i },
  { id: "desqualificado", nome: "Desqualificado", cor: "slate", re: /desqualific/i },
] as const;

// Vale para sdr_ia e para todo tipo "comercial*" — inclusive funis importados (Kommo) e arquivados
// ("comercial_arquivado_kommo"), para que arquivar um funil não o tire da regra. Funis de Serviço/OS ficam de fora.
export const funilExigeEtapasSistema = (tipo?: string | null): boolean =>
  !!tipo && (tipo === "sdr_ia" || tipo.startsWith("comercial"));

/** Papel de sistema da etapa (ganho/perdido/desqualificado) ou null se for uma etapa comum. */
export function etapaSistemaDe(nome?: string | null) {
  return ETAPAS_SISTEMA.find((e) => e.re.test(nome || "")) ?? null;
}

/** Devolve as etapas obrigatórias que o funil ainda não tem (no fim, para não deslocar o id das existentes). */
export function etapasSistemaFaltando(etapas: string[]) {
  return ETAPAS_SISTEMA.filter((e) => !etapas.some((n) => e.re.test(n)));
}

export function getStageId(funilId: string, idx: number): string {
  if (funilId === "funil-comercial-default") return String(idx + 1);
  if (funilId === "funil-sdr-ia-default") return `sdr-${idx + 1}`;
  return `${funilId}-${idx}`;
}

// Mesma paleta usada em ConfigCRMFunis/EtapaCard — a "cor" de cada etapa é
// dado escolhido pelo usuário, não decoração de app, então não entra no
// padrão de tokens semânticos do resto da UI.
export const ETAPA_DOT_COLORS: Record<string, string> = {
  slate: "#64748b", blue: "#3b82f6", orange: "#f97316",
  cyan: "#06b6d4", emerald: "#10b981", purple: "#a855f7",
  rose: "#f43f5e", amber: "#f59e0b", indigo: "#6366f1", pink: "#ec4899",
};

export interface FunilStage {
  id: string;
  name: string;
  color: string;
  iniciarMinimizado: boolean;
  funilId: string;
}

// Acha a etapa de "ganho" pelo NOME (mesma regra do drag-and-drop no Kanban,
// ver handleDrop em PipelineKanbanBoard.tsx), nunca pela posição no array —
// a última etapa de um funil pode ser qualquer coisa (ex.: "Perdido"), então
// assumir "última = ganho" movia leads marcados como Fechado pro board errado.
// Cai pra última etapa só se o funil genuinamente não tiver etapa nomeada
// "ganho"/"fechado" (mesmo fallback de antes, como última opção).
export function findWonStage<T extends { name: string }>(stages: T[]): T | undefined {
  return stages.find((s) => {
    const n = (s.name || "").toLowerCase();
    return n.includes("ganho") || n.includes("fechado");
  }) ?? stages[stages.length - 1];
}

export function buildStagesForFunil(funil: any): FunilStage[] {
  const configs: any[] = funil.etapasConfig ??
    (funil.etapas || []).map((nome: string, i: number) => ({
      nome,
      cor: ["cyan", "indigo", "purple", "amber", "emerald", "pink", "rose", "blue", "orange", "slate"][i % 10],
      iniciarMinimizado: false,
    }));
  return configs.map((s: any, idx: number) => ({
    id: getStageId(funil.id, idx),
    name: s.nome,
    color: ETAPA_DOT_COLORS[s.cor] ?? "#64748b",
    iniciarMinimizado: s.iniciarMinimizado ?? false,
    funilId: funil.id,
  }));
}
