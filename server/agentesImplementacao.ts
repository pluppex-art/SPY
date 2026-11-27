/**
 * Chama o agente de implementação (n8n) para uma empresa que JÁ existe, quando um módulo com agente é ligado
 * depois do cadastro. O agente lê os módulos no banco e cria só o que falta (chamar de novo não duplica).
 * Não manda telefone: assim ninguém recebe mensagem de boas-vindas.
 */
import { modulosDeAgenteLigados } from "../src/lib/modulosDeAgente.js";
import { agentesDoCliente } from "./agentesDoCliente.js";

type Db = any;
const WEBHOOK_DEFAULT = "https://n8n.spycrm.com.br/webhook/spy-agente-implementacao-tenant-criado";
const CHAVE = "agentes_chamada";
/** Intervalo mínimo entre chamadas da mesma empresa: duas execuções simultâneas poderiam copiar o mesmo agente duas vezes. */
export const INTERVALO_MS = 30_000;

export type ResultadoAgentes =
  | { status: "acionado"; modulos: string[] }
  | { status: "aguarde"; segundos: number }
  | { status: "ignorado"; motivo: string }
  | { status: "falhou"; motivo: string };

export interface AcionarDeps {
  db: Db;
  /** Empresa dona do sistema: os agentes dela são os originais, nunca copiados. */
  tenantRaiz: string;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
  agora?: () => number;
}

export async function acionarAgentesDoCliente(deps: AcionarDeps, tenantId: string): Promise<ResultadoAgentes> {
  const env = deps.env ?? process.env;
  const agora = deps.agora ?? Date.now;
  try {
    if (tenantId === deps.tenantRaiz) return { status: "ignorado", motivo: "empresa dona do sistema" };
    const { data: empresa, error } = await deps.db.from("tenants").select("id, name, modules").eq("id", tenantId).maybeSingle();
    if (error || !empresa) return { status: "falhou", motivo: "Empresa não encontrada." };
    const modulos = modulosDeAgenteLigados(empresa.modules);
    if (!modulos.length) return { status: "ignorado", motivo: "nenhum módulo com agente ligado" };
    const segredo = env.SPY_IMPLEMENTACAO_WEBHOOK_SECRET;
    if (!segredo) return { status: "falhou", motivo: "SPY_IMPLEMENTACAO_WEBHOOK_SECRET não configurada no servidor." };

    const { data: ultima } = await deps.db.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", CHAVE).maybeSingle();
    const passou = agora() - Date.parse(String(ultima?.value?.em || ""));
    if (passou >= 0 && passou < INTERVALO_MS) return { status: "aguarde", segundos: Math.ceil((INTERVALO_MS - passou) / 1000) };
    const marcar = (em: string | null) => deps.db.from("app_settings").upsert({ tenant_id: tenantId, key: CHAVE, value: { em } }, { onConflict: "tenant_id,key" });
    await marcar(new Date(agora()).toISOString());

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 6000);
    let motivo = "";
    try {
      const r = await (deps.fetchImpl ?? fetch)(env.SPY_IMPLEMENTACAO_WEBHOOK_URL || WEBHOOK_DEFAULT, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": segredo }, signal: ac.signal,
        body: JSON.stringify({ tenant_id: tenantId, company: String(empresa.name || "").trim(), email: "", phone: "", implementation_id: "", agentes: agentesDoCliente(empresa.modules) }),
      });
      if (!r.ok) motivo = `O agente de implementação respondeu HTTP ${r.status}.`;
    } catch (e: any) {
      motivo = e?.name === "AbortError" ? "O agente de implementação não respondeu em 6 segundos." : "Falha ao chamar o agente de implementação.";
    } finally { clearTimeout(timer); }
    if (motivo) { await marcar(null); return { status: "falhou", motivo }; } // libera para tentar de novo
    return { status: "acionado", modulos };
  } catch (e: any) {
    console.error("[agentes-implementacao]", e?.message);
    return { status: "falhou", motivo: "Erro ao acionar os agentes." };
  }
}
