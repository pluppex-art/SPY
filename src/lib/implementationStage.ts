// Ponte entre a página de Implementações (/app/crm/implementacoes) e o funil
// de CRM que um tenant configurou pra receber negócios ganhos (ver
// handleWinStageDrop em usePipeline.ts) — faz as duas telas serem espelho uma
// da outra: a "etapa" de uma implementação passa a ser, sempre que possível,
// a etapa atual do LEAD vinculado dentro desse funil, em vez de um status
// solto digitado à parte. Sem esse funil configurado pro tenant (a maioria,
// hoje), ou sem lead vinculado a uma implementação específica, tudo cai de
// volta no status manual de sempre — nada quebra pra quem não configurou isso.
import { buildStagesForFunil, type FunilStage } from "./funilStages";

export const WIN_FUNIL_CONFIG_KEY = "axis_win_funil_config";

/** O funil que um tenant usa como "Implementação" — hoje, o primeiro valor
 * (funil de destino) configurado em axis_win_funil_config. Um tenant pode em
 * tese mapear funis de origem diferentes pra destinos diferentes; por ora só
 * o primeiro é tratado como "o" funil de Implementação dessa tela — cobre o
 * caso real (um funil de implementação por tenant) sem travar o mecanismo
 * genérico em app_settings, que continua suportando múltiplos. */
export function getImplementacaoFunil(appSettings: Record<string, any>, funis: any[]): any | null {
  const config = appSettings?.[WIN_FUNIL_CONFIG_KEY] as Record<string, string> | undefined;
  if (!config) return null;
  const targetFunilId = Object.values(config)[0];
  if (!targetFunilId) return null;
  return (funis as any[]).find((f: any) => f.id === targetFunilId && f.ativo !== false) ?? null;
}

export function getImplementacaoStages(appSettings: Record<string, any>, funis: any[]): FunilStage[] {
  const funil = getImplementacaoFunil(appSettings, funis);
  return funil ? buildStagesForFunil(funil) : [];
}

export interface ImplStageInfo {
  stage: FunilStage;
  stageIdx: number;
  isLast: boolean;
}

/** Etapa atual de UMA implementação dentro do funil de Implementação, lida do
 * lead vinculado (`impl.lead_id`). null quando não dá pra resolver (sem funil
 * configurado, sem lead vinculado, ou o lead não está mais nesse funil) — a
 * tela trata null como "usa o status manual de sempre". */
export function getImplementationStageInfo(impl: any, leads: any[], stages: FunilStage[]): ImplStageInfo | null {
  if (!impl?.lead_id || stages.length === 0) return null;
  const lead = (leads as any[]).find((l: any) => l.id === impl.lead_id);
  if (!lead) return null;
  const stageIdx = stages.findIndex((s) => s.id === lead.stageId);
  if (stageIdx === -1) return null;
  return { stage: stages[stageIdx], stageIdx, isLast: stageIdx === stages.length - 1 };
}

interface MoveDeps {
  updateLead: (id: string, patch: any) => Promise<any> | any;
  updateImplementation: (id: string, patch: any) => Promise<any> | any;
  updateClienteBase: (id: string, patch: any) => Promise<any> | any;
}

/** Move o lead vinculado pra uma nova etapa do funil de Implementação — espelha
 * exatamente o drag-and-drop do Kanban do Pipeline (mesma tabela/campo sendo
 * escrito, `leads.stageId`), então mexer aqui ou lá dá o mesmo resultado nas
 * duas telas. Chegar/sair da ÚLTIMA etapa também vira o status da implementação
 * ("Concluída"/"Em andamento" + completed_at), preservando o gatilho que já
 * existe hoje de criar o ambiente do cliente ao concluir. */
export async function moveImplementationStage(
  impl: any, cliente: any, nextStageId: string, stages: FunilStage[], deps: MoveDeps
): Promise<{ isLast: boolean }> {
  await deps.updateLead(impl.lead_id, { stageId: nextStageId });

  const isLast = stages.length > 0 && nextStageId === stages[stages.length - 1].id;
  const wasConcluded = impl.status === "Concluída";
  if (isLast && !wasConcluded) {
    await deps.updateImplementation(impl.id, { status: "Concluída", completed_at: new Date().toISOString() });
    if (cliente?.status === "Em Implantação") await deps.updateClienteBase(cliente.id, { status: "Ativo" });
  } else if (!isLast && wasConcluded) {
    await deps.updateImplementation(impl.id, { status: "Em andamento", completed_at: null });
    if (cliente?.status === "Ativo") await deps.updateClienteBase(cliente.id, { status: "Em Implantação" });
  }
  return { isLast };
}
