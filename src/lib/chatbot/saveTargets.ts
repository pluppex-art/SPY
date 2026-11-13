/**
 * Destinos do nó "Salvar dados" do chatbot — a parte genérica: o nó pega variáveis coletadas na
 * conversa e grava num registro do SPY. Para ligar um destino novo basta (1) listar aqui o que dá
 * pra preencher e (2) escrever o gravador correspondente em server/chatbotSave.ts.
 */
import { allFields } from "../implementationForm.js";
import type { SaveTargetId } from "./types.js";

export interface SaveTargetDef {
  label: string;
  hint: string;
  /** Campos do destino que o editor oferece no mapeamento. */
  fields: { id: string; label: string }[];
}

export const SAVE_TARGETS: Record<SaveTargetId, SaveTargetDef> = {
  implementation: {
    label: "Implementação do cliente",
    hint: "Preenche o formulário de CRM > Implementações do cliente que está conversando (achado pelo número de WhatsApp). Só preenche campo vazio — nunca sobrescreve o que já está cadastrado.",
    fields: allFields("client").map((f) => ({ id: f.id, label: `${f.group ? f.group + " — " : ""}${f.label}` })),
  },
};
