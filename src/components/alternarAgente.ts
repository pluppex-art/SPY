import { toast } from "sonner";
import { confirmDialog } from "./ui/confirm-dialog";
import { apiFetch } from "../lib/apiClient";
import { AGENTE_SECRETO_STATUS_EVENT } from "./AgenteSecretoConexao";

export type AgenteSecretoId = "interno" | "vendas";
export const NOME_AGENTE: Record<AgenteSecretoId, string> = { interno: "Agente Secreto Interno", vendas: "Agente Secreto de Vendas" };

/** Liga ou desliga um agente só (o WhatsApp continua conectado e o outro não muda). Desligar pede confirmação. */
export async function alternarAgente(colaborador: { id: string; nome: string }, agente: AgenteSecretoId, ligar: boolean): Promise<void> {
  const titulo = NOME_AGENTE[agente];
  if (!ligar && !(await confirmDialog({
    title: `Desligar o ${titulo}?`,
    description: agente === "interno"
      ? `Ele deixa de acompanhar os grupos pelo WhatsApp de ${colaborador.nome}. O WhatsApp continua conectado e dá para ligar de novo quando quiser.`
      : `Ele deixa de ler as conversas de venda de ${colaborador.nome}: nada novo entra no funil por este número enquanto estiver desligado. O WhatsApp continua conectado e dá para ligar de novo quando quiser.`,
    confirmText: "Desligar",
  }))) return;
  try {
    const r = await apiFetch(`/api/agente-secreto/sessoes/${encodeURIComponent(colaborador.id)}/agente`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agente, ligado: ligar }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(j?.error || "Não foi possível concluir agora."); return; }
    toast.success(`${titulo} de ${colaborador.nome} ${ligar ? "ligado" : "desligado"}.`);
    window.dispatchEvent(new Event(AGENTE_SECRETO_STATUS_EVENT));
  } catch { toast.error("Não foi possível concluir agora."); }
}
