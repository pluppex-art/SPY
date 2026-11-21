// A coluna do Kanban manda: um negócio que está na etapa "Ganho" é ganho, mesmo que o campo status tenha ficado "Novo"
// (acontece quando o Agente Secreto ou uma integração move o card de etapa e não atualiza o status).
// Só corrige negócio AINDA EM ABERTO: quem já tem status final (Fechado, Perdido, Desqualificado) mantém o que está gravado.
// Sem imports além de funilStages/leadStatus (puros), para a tela e o servidor usarem a mesma regra.
import { etapaSistemaDe, getStageId } from "./funilStages.js";
import { isLeadOpen } from "./leadStatus.js";

export type StatusFinal = "Fechado" | "Perdido" | "Desqualificado";

/** id da etapa -> papel (ganho/perdido/desqualificado) pelo NOME da etapa, de todos os funis. */
export function mapaPapelPorEtapa(funis: Array<{ id: string; etapas?: unknown }> | null | undefined): Map<string, StatusFinal> {
  const mapa = new Map<string, StatusFinal>();
  for (const f of funis || []) {
    const nomes = Array.isArray(f.etapas) ? (f.etapas as unknown[]) : [];
    nomes.forEach((nome, idx) => {
      const papel = etapaSistemaDe(typeof nome === "string" ? nome : "");
      if (!papel) return;
      mapa.set(getStageId(f.id, idx), papel.id === "ganho" ? "Fechado" : papel.id === "perdido" ? "Perdido" : "Desqualificado");
    });
  }
  return mapa;
}

/** Status que vale para o negócio: o da etapa quando o status gravado ainda é de negócio aberto. */
export function statusPelaEtapa(status: string | null | undefined, stageId: string | null | undefined, mapa: Map<string, StatusFinal>): string | null | undefined {
  if (!stageId || !isLeadOpen(status)) return status;
  return mapa.get(stageId) ?? status;
}
