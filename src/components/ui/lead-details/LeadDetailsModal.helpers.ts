import { toast } from "sonner";
import { formatBRL, lerValorPositivo } from "../../../lib/dinheiro";

export function formatLeadValueBRL(value: unknown, formatCurrency?: (v: number) => string) {
  const cleaned = String(value ?? "0").replace(/[^\d,.]/g, "");
  // pt-BR: dots = thousands separator, comma = decimal → remove dots first, then swap comma
  const num = lerValorPositivo(cleaned);
  if (formatCurrency) return formatCurrency(num);
  return formatBRL(num);
}

export function safeParseTimeIdle(timeIdle: unknown) {
  return typeof timeIdle === "number" ? timeIdle : parseInt(String(timeIdle)) || 0;
}

export function safeParseProbability(probability: unknown) {
  return Math.round(Number(probability) || 0);
}

export function createAlterationLog(params: {
  author: string;
  desc: string;
  time?: string;
}) {
  return {
    id: Date.now().toString(),
    author: params.author,
    desc: params.desc,
    time: params.time ?? "Agora",
  };
}

export function handleMarkLead(params: {
  updateLead: (leadId: string, payload: any) => void;
  leadId: string;
  seller: string;
  setAlterationLogs: (updater: (prev: any[]) => any[]) => void;
  toastSuccess: string;
  toastWarning?: string;
  status: "Fechado" | "Perdido" | string;
  stageId?: string;
  desc: string;
  kind: "success" | "warning";
}) {
  params.updateLead(params.leadId, {
    ...(params.stageId ? { stageId: params.stageId } : {}),
    status: params.status,
  });

  if (params.kind === "success") toast.success(params.toastSuccess);
  if (params.kind === "warning") toast.warning(params.toastWarning ?? params.toastSuccess);

  params.setAlterationLogs((prev: any[]) => [
    {
      id: Date.now().toString(),
      author: params.seller || "Sistema",
      desc: params.desc,
      time: "Agora",
    },
    ...prev,
  ]);
}


/** Valor derivado dos produtos de interesse (tags da aba Produtos): soma dos preços dos
 * marcados, recalculada a cada render — tirar uma tag diminui, zerar todas zera, marcar outra
 * soma. Só vale enquanto o lead não tem proposta (depois o valor da proposta manda) e só
 * quando as tags já foram usadas nesse lead; caso contrário devolve null (usar lead.value). */
export function leadInterestEstimate(lead: any, proposals: any[], products: any[]): number | null {
  if (!lead) return null;
  if ((proposals || []).some((p: any) => p.lead_id === lead.id)) return null;
  const ids = lead.customFields?.produtosInteresseIds;
  if (!Array.isArray(ids)) return null;
  return ids.reduce((sum: number, id: string) => sum + (Number((products || []).find((p: any) => p.id === id)?.price) || 0), 0);
}
