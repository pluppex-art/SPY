/**
 * Agentes que o agente de implementação (n8n) cria na pasta de cada cliente. O SPY avisa a lista no mesmo webhook
 * (`agentes`), para o n8n criar só o que o cliente contratou — o chatbot é vendido à parte (módulo "chatbot").
 * Campo novo e opcional: o workflow do n8n que ainda não lê `agentes` continua criando os 4 de sempre.
 */
export const AGENTES_BASE = ["radar", "closer", "julia", "agente_secreto"] as const;

export function agentesDoCliente(modules: Record<string, any> | null | undefined): string[] {
  return [...AGENTES_BASE, ...(modules?.chatbot === true ? ["chatbot"] : [])];
}

/** Lê os módulos atuais do tenant (depois do plano aplicado) e devolve a lista de agentes. */
export async function agentesDoTenant(db: any, tenantId: string): Promise<string[]> {
  try {
    const { data } = await db.from("tenants").select("modules").eq("id", tenantId).maybeSingle();
    return agentesDoCliente(data?.modules);
  } catch {
    return [...AGENTES_BASE];
  }
}
