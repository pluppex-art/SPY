// Ponte entre Implementações (public.implementations) e a Ordem de Serviço.
//
// Quando o tenant tem um departamento "Implementação" na OS, cada implementação
// ganha uma OS vinculada (origem_tipo = 'implementation', origem_id = id da
// implementação) e a ETAPA da implementação passa a ser a etapa dessa OS no funil
// configurado — a página de Implementações e o quadro da OS mostram o mesmo dado.
import type { SupabaseClient } from "@supabase/supabase-js";
import { rowToDepartamento, rowToFunil, rowToOrdem } from "./osMappers";
import { statusDaEtapa, type OrdemServico, type OsDepartamento, type OsEtapa, type OsFunil } from "./osTypes";

export const ORIGEM_IMPLEMENTACAO = "implementation";

const normaliza = (s?: string | null) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** O departamento da OS que hospeda o fluxo de implementação (por nome: "Implementação", "Implantação"...). */
export const ehDepartamentoImplementacao = (nome: string) => /^implementa|^implanta/.test(normaliza(nome));

export const funilPadrao = (funis: OsFunil[]): OsFunil | undefined => funis.find(f => f.padrao) ?? funis[0];

export const etapaInicial = (etapas: OsEtapa[]): OsEtapa | undefined => etapas.find(e => e.tipo === "aberta") ?? etapas[0];

export const etapaConclusao = (etapas: OsEtapa[]): OsEtapa | undefined =>
  etapas.find(e => e.tipo === "concluida") ?? etapas[etapas.length - 1];

export const etapaPorNome = (etapas: OsEtapa[], nome?: string | null): OsEtapa | undefined => {
  const n = normaliza(nome);
  return n ? etapas.find(e => normaliza(e.nome) === n) : undefined;
};

/** Em que etapa uma implementação entra no funil da OS: a que tem o mesmo nome da etapa
 * em que ela estava (ex.: no funil do CRM), a última se já concluída, ou a primeira. */
export function etapaParaImplementacao(etapas: OsEtapa[], impl: { status?: string }, nomeEtapaAnterior?: string | null): OsEtapa | undefined {
  if (impl.status === "Concluída") return etapaConclusao(etapas);
  return etapaPorNome(etapas, nomeEtapaAnterior) ?? etapaInicial(etapas);
}

export interface FonteOsImplementacao {
  departamento: OsDepartamento;
  funis: OsFunil[];
  ordens: OrdemServico[];
}

/** Lê departamento + funis + OS de implementações do tenant. null = o tenant não usa a OS para isso. */
export async function carregarFonteImplementacao(supabase: SupabaseClient, tenantId: string): Promise<FonteOsImplementacao | null> {
  const { data: deps, error } = await supabase
    .from("os_departamentos").select("*").eq("tenant_id", tenantId).eq("ativo", true).order("ordem");
  if (error) return null;
  const dep = (deps ?? []).map(rowToDepartamento).find(d => ehDepartamentoImplementacao(d.nome));
  if (!dep) return null;

  const { data: funisRows, error: errFunis } = await supabase
    .from("os_funis").select("*").eq("departamento_id", dep.id).eq("ativo", true)
    .order("padrao", { ascending: false }).order("created_at");
  const funis = (funisRows ?? []).map(rowToFunil).filter(f => f.etapas.length > 0);
  if (errFunis || funis.length === 0) return null;

  const { data: ordens } = await supabase
    .from("ordens_servico").select("*").eq("tenant_id", tenantId).eq("origem_tipo", ORIGEM_IMPLEMENTACAO);
  return { departamento: dep, funis, ordens: (ordens ?? []).map(rowToOrdem) };
}

export function montarOrdemDeImplementacao(a: {
  tenantId: string;
  departamento: OsDepartamento;
  funil: OsFunil;
  etapa: OsEtapa;
  impl: any;
  clienteNome?: string | null;
  userId?: string | null;
}): Record<string, unknown> {
  const hoje = new Date().toISOString().slice(0, 10);
  return {
    tenant_id: a.tenantId,
    titulo: `Implementação — ${a.clienteNome || "cliente"}`,
    status: statusDaEtapa(a.funil.etapas, a.etapa),
    prioridade: "Normal",
    cliente_nome: a.clienteNome || null,
    responsavel: a.impl.responsavel || null,
    data_abertura: (a.impl.started_at || new Date().toISOString()).slice(0, 10),
    data_prevista: a.impl.go_live_date || null,
    data_conclusao: a.etapa.tipo === "concluida" ? (a.impl.completed_at || "").slice(0, 10) || hoje : null,
    departamento_id: a.departamento.id,
    funil_id: a.funil.id,
    etapa_id: a.etapa.id,
    origem_tipo: ORIGEM_IMPLEMENTACAO,
    origem_id: a.impl.id,
    created_by: a.userId ?? null,
  };
}

/** Insere uma a uma: o índice único (tenant, origem) barra duplicata de outra aba/sessão (23505) sem derrubar o resto. */
export async function inserirOrdens(supabase: SupabaseClient, rows: Record<string, unknown>[]): Promise<boolean> {
  let ok = true;
  for (const row of rows) {
    const { error } = await supabase.from("ordens_servico").insert(row);
    if (error && error.code !== "23505") {
      console.error("[OS] criar OS da implementação:", error.message);
      ok = false;
    }
  }
  return ok;
}

/** Garante a OS de UMA implementação (usada ao iniciar/ganhar). Não faz nada se o tenant não usa a OS para isso. */
export async function garantirOrdemDaImplementacao(
  supabase: SupabaseClient, tenantId: string, impl: any, clienteNome?: string | null, userId?: string | null,
): Promise<boolean> {
  const fonte = await carregarFonteImplementacao(supabase, tenantId);
  if (!fonte) return false;
  if (fonte.ordens.some(o => o.origemId === impl.id)) return true;
  const funil = funilPadrao(fonte.funis);
  const etapa = funil && etapaParaImplementacao(funil.etapas, impl);
  if (!funil || !etapa) return false;
  return inserirOrdens(supabase, [montarOrdemDeImplementacao({ tenantId, departamento: fonte.departamento, funil, etapa, impl, clienteNome, userId })]);
}
