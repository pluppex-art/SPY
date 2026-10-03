// Início de implementação compartilhado — mesma lógica que o botão "Iniciar
// implementação" de Implementacoes.tsx, extraída pra também poder ser chamada
// automaticamente quando um negócio é marcado como Ganho no Pipeline (ver
// handleWinStageDrop em usePipeline.ts e handleConvertLead em
// useLeadDetails.ts), evitando duplicar essa regra em três lugares.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  carregarFonteImplementacao, garantirOrdemDaImplementacao, garantirOrdemDoNegocio,
} from "../pages/os/implementationOs";

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
  /** Catálogo de produtos: vira os itens da OS ("o que implementar"). */
  produtos?: any[];
}

/** Cria a implementação de um cliente que acabou de fechar (ou devolve a já
 * existente, sem duplicar) — mesmo efeito do botão "Iniciar implementação".
 * Confere direto no banco antes de criar (não confia em estado local, que
 * pode estar defasado — ex.: já iniciada em outra aba/sessão). */
export async function startImplementationForClient(
  cliente: any,
  lead: any | undefined,
  deps: AutoStartDeps
): Promise<{ id: string; alreadyExisted: boolean; ordem?: "criada" | "existente" | "nenhuma" } | null> {
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
  // Se o tenant usa a Ordem de Serviço para o fluxo de implementação (departamento "Implementação"),
  // a OS nasce junto: ligada ao cliente (dados preenchidos) e com o produto vendido como item. Falhar
  // aqui não impede a implementação: a página de Implementações cria as OS que faltarem ao abrir.
  let ordem: "criada" | "existente" | "nenhuma" = "nenhuma";
  if (supabase && created?.id && created.tenant_id) {
    ordem = await garantirOrdemDaImplementacao(supabase, created.tenant_id, created, cliente.name, null, {
      cliente, lead, produtos: deps.produtos,
    }).catch(() => "nenhuma" as const);
  }
  // Reflete no restante do sistema (KPI/filtro "Em Implantação" da Base de Clientes) — só sai de "Ativo".
  if (!cliente.status || cliente.status === "Ativo") await updateClienteBase(cliente.id, { status: "Em Implantação" });

  return created?.id ? { id: created.id, alreadyExisted: false, ordem } : null;
}

/**
 * Ao ganhar um negócio (Pipeline ou "Converter lead"): inicia a implementação do cliente e gera a OS do que
 * precisa ser feito, no departamento Implementação da Ordem de Serviço. Só age para quem usa esse fluxo
 * (departamento "Implementação" na OS, ou a promoção de funil configurada): os demais tenants ficam como estavam.
 * Cliente que já tinha implementação (comprou outro produto) ganha uma OS extra, desta venda.
 */
export async function aoGanharNegocio(
  cliente: any,
  lead: any | undefined,
  deps: AutoStartDeps & { tenantId?: string; legacy?: boolean },
): Promise<{ implementacaoCriada: boolean; ordem: "criada" | "existente" | "nenhuma" } | null> {
  const { supabase, tenantId } = deps;
  if (!supabase || !tenantId || !cliente?.id) return null;
  const fonte = await carregarFonteImplementacao(supabase, tenantId);
  if (!fonte && !deps.legacy) return null;

  const r = await startImplementationForClient(cliente, lead, deps);
  if (!r) return null;
  if (!r.alreadyExisted) return { implementacaoCriada: true, ordem: r.ordem ?? "nenhuma" };
  if (!fonte) return { implementacaoCriada: false, ordem: "nenhuma" };

  // Implementação já existia. Se ela ainda não tem OS (as OS só nascem com o departamento), cria a dela agora.
  const { data: impl } = await supabase.from("implementations").select("*").eq("id", r.id).maybeSingle();
  if (impl && !fonte.ordens.some((o) => o.origemId === r.id)) {
    const ordem = await garantirOrdemDaImplementacao(supabase, tenantId, impl, cliente.name, null, {
      cliente, lead, produtos: deps.produtos,
    }).catch(() => "nenhuma" as const);
    return { implementacaoCriada: false, ordem };
  }
  // O negócio que originou a implementação já está representado na OS dela: não gera outra.
  if (impl?.lead_id && impl.lead_id === lead?.id) return { implementacaoCriada: false, ordem: "existente" };
  // Outro negócio ganho do mesmo cliente (ex.: comprou outro produto): vira uma OS própria.
  const ordem = await garantirOrdemDoNegocio(supabase, tenantId, lead, cliente, deps.produtos ?? []).catch(() => "nenhuma" as const);
  return { implementacaoCriada: false, ordem };
}
