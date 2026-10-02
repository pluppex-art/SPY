// Início de implementação compartilhado — mesma lógica que o botão "Iniciar
// implementação" de Implementacoes.tsx, extraída pra também poder ser chamada
// automaticamente quando um negócio é marcado como Ganho no Pipeline (ver
// handleWinStageDrop em usePipeline.ts e handleConvertLead em
// useLeadDetails.ts), evitando duplicar essa regra em três lugares.
import type { SupabaseClient } from "@supabase/supabase-js";

/** Só dados reais do cliente/lead/contatos — nada de default inventado (ex.: o "segmento"
 * de clientes criados automaticamente nasce como "Tecnologia" por padrão, então não entra). */
export function prefillImplementationData(cliente: any, lead?: any, contatos: any[] = []): Record<string, any> {
  const d: Record<string, any> = {};
  const set = (k: string, v: any) => { if (v) d[k] = v; };
  const principal = contatos.find((c) => c.principal) || contatos[0];
  const decisor = contatos.find((c) => /decis/i.test(c.papel_decisao || ""));
  set("nome_fantasia", cliente?.name);
  set("cnpj", cliente?.documento || lead?.cnpj);
  set("endereco", [cliente?.logradouro, cliente?.numero, cliente?.bairro, cliente?.city, cliente?.state].filter(Boolean).join(", "));
  set("resp_nome", principal?.nome || lead?.name);
  set("resp_cargo", principal?.cargo);
  set("resp_email", principal?.email || cliente?.email || lead?.email);
  set("resp_whatsapp", principal?.whatsapp || principal?.telefone || cliente?.phone || lead?.phone);
  set("decisor_nome", decisor?.nome || lead?.customFields?.decisorNome);
  return d;
}

interface AutoStartDeps {
  supabase: SupabaseClient | null;
  addImplementation: (data: any) => Promise<any>;
  updateClienteBase: (id: string, patch: any) => Promise<any>;
}

/** Cria a implementação de um cliente que acabou de fechar (ou devolve a já
 * existente, sem duplicar) — mesmo efeito do botão "Iniciar implementação".
 * Confere direto no banco antes de criar (não confia em estado local, que
 * pode estar defasado — ex.: já iniciada em outra aba/sessão). */
export async function startImplementationForClient(
  cliente: any,
  lead: any | undefined,
  deps: AutoStartDeps
): Promise<{ id: string; alreadyExisted: boolean } | null> {
  if (!cliente?.id) return null;
  const { supabase, addImplementation, updateClienteBase } = deps;

  if (supabase) {
    const { data: existente } = await supabase
      .from("implementations").select("id").eq("cliente_id", cliente.id).maybeSingle();
    if (existente?.id) return { id: existente.id, alreadyExisted: true };
  }

  let contatos: any[] = [];
  if (supabase) {
    const { data: rows } = await supabase.from("cliente_contatos")
      .select("nome, cargo, email, telefone, whatsapp, principal, papel_decisao")
      .eq("cliente_id", cliente.id).limit(20);
    contatos = rows || [];
  }

  const created = await addImplementation({
    cliente_id: cliente.id,
    lead_id: lead?.id || null,
    status: "Em andamento",
    data: prefillImplementationData(cliente, lead, contatos),
  });
  // Reflete no restante do sistema (KPI/filtro "Em Implantação" da Base de Clientes) — só sai de "Ativo".
  if (!cliente.status || cliente.status === "Ativo") await updateClienteBase(cliente.id, { status: "Em Implantação" });

  return created?.id ? { id: created.id, alreadyExisted: false } : null;
}
