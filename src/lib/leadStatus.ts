// Status "terminais de perda" de um lead — Perdido (perdeu pra concorrente/
// desistiu) e Desqualificado (nunca era um lead válido) são conceitos
// diferentes pro time de vendas, mas os dois são igualmente "não é mais
// pipeline aberto" e "não conta como Ganho" em qualquer métrica. Fonte
// única pra não repetir essa lista em cada arquivo que filtra lead aberto.
export const LOST_LEAD_STATUSES = ["Perdido", "Desqualificado"] as const;

export function isLeadLost(status?: string | null): boolean {
  return !!status && (LOST_LEAD_STATUSES as readonly string[]).includes(status);
}

export function isLeadOpen(status?: string | null): boolean {
  return status !== "Fechado" && !isLeadLost(status);
}

// Classifica o status do lead a partir do NOME da etapa de destino (drag no
// Kanban, ou mover pela etapa no Lead Details) — nunca pela posição da
// etapa no array (ver findWonStage em funilStages.ts pro mesmo princípio
// aplicado à etapa de "Ganho"). Etapa "Desqualificado" caindo no fallback
// genérico "Em Aberto" é o bug real que fazia um lead desqualificado contar
// como pipeline aberto (e, por tabela, nunca excluído do que deveria).
export function statusFromStageName(stageName: string): "Fechado" | "Perdido" | "Desqualificado" | "Em Aberto" {
  const n = (stageName || "").toLowerCase();
  if (n.includes("ganho") || n.includes("fechado")) return "Fechado";
  if (n.includes("desqualific")) return "Desqualificado";
  if (n.includes("perdid")) return "Perdido";
  return "Em Aberto";
}
