// Construção das etapas de um funil de CRM (crm_funis) — extraído de
// usePipeline.ts, que tinha essa lógica duplicada quase idêntica em
// useLeadDetails.ts (e agora também precisada pela página de Implementações,
// pra espelhar o mesmo funil de Implementação do Pipeline). Fonte única.

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
