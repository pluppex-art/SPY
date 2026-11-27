import { apiFetch } from "./apiClient";
import type { RespostaAgentes } from "./agendarAgentes";

/** Pede ao servidor para o agente de implementação criar os fluxos que faltam desta empresa (só master). */
export async function chamarAgentes(tenantId: string): Promise<RespostaAgentes> {
  const res = await apiFetch(`/api/admin/tenant/${tenantId}/agentes`, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Erro ${res.status}`);
  return body as RespostaAgentes;
}
