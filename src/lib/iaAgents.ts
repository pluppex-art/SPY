import { modulosDoCargo } from "./cargosUsuario";

/** IAs que atendem pelo WhatsApp (cada IA tem o próprio número/instância). Usadas no filtro de IA da Mensageria. */
export type IaAgentId = "sdr" | "cs" | "chatbot";

export const IA_AGENTS: { id: IaAgentId; label: string; /** id gravado em cargos.modulos para liberar a IA ao perfil */ modulo: string; desc: string }[] = [
  { id: "sdr", label: "SDR IA", modulo: "ia_sdr", desc: "Ver as conversas do WhatsApp do SDR IA na Mensageria" },
  { id: "cs", label: "CS IA", modulo: "ia_cs", desc: "Ver as conversas do WhatsApp do CS IA na Mensageria" },
  { id: "chatbot", label: "Chatbot", modulo: "ia_chatbot", desc: "Ver as conversas do WhatsApp do Chatbot na Mensageria" },
];

export const iaLabel = (id: string | null | undefined) => IA_AGENTS.find((a) => a.id === id)?.label ?? null;

/**
 * Quem pode ver as conversas de cada IA: master e admin do tenant sempre; os demais pelo perfil (cargo).
 * Perfil sem módulos configurados = sem restrição (mesma regra do menu); com módulos, só vê a IA marcada.
 */
export function podeVerIa(user: any, cargos: any[], id: IaAgentId): boolean {
  if (user?.isMaster || user?.isTenantAdmin) return true;
  const agente = IA_AGENTS.find((a) => a.id === id);
  if (!agente) return false;
  const modulos: string[] | null = modulosDoCargo(user, cargos);
  if (!modulos) return true;
  return modulos.includes(agente.modulo);
}
