/** Leitura das tabelas do método e chamada das funções spy_* (que validam tudo no banco). */
import { supabase } from "../supabase";
import type { Estado, Motivo, Situacao } from "./regras";

export interface Nota { id: string; etapa_tipo: string; texto: string; autor_tipo: "ia" | "usuario"; autor_id: string | null; concorrente: string | null; valor_esperado: number | null; data_retorno: string | null; created_at: string }
export interface Registro { id: string; dimensao: string; de: string | null; para: string | null; autor_tipo: "ia" | "sistema" | "usuario"; motivo: string | null; operacao_id: string | null; desfaz_id: string | null; created_at: string }
export interface Pagamento { id: string; metodo: string | null; valor: number; status: string; origem: string; gateway: string | null; vencimento: string | null; confirmado_em: string | null; created_at: string }

const cliente = () => { if (!supabase) throw new Error("Sem conexão com o banco."); return supabase; };
const ok = <T>(r: { data: T; error: any }): T => { if (r.error) throw new Error(r.error.message); return r.data; };

export async function chamar(funcao: string, argumentos: Record<string, unknown>): Promise<any> {
  return ok(await cliente().rpc(funcao, argumentos));
}

export async function carregarCatalogo(tenantId: string): Promise<{ situacoes: Situacao[]; motivos: Motivo[] }> {
  const filtro = `tenant_id.is.null,tenant_id.eq.${tenantId}`;
  const [s, m] = await Promise.all([cliente().from("crm_situacoes").select("*").or(filtro), cliente().from("crm_motivos").select("*").or(filtro)]);
  return { situacoes: ok(s) as Situacao[], motivos: ok(m) as Motivo[] };
}

export async function carregarEstados(tenantId: string): Promise<Estado[]> {
  const tudo: Estado[] = [];
  for (let de = 0; ; de += 1000) {
    const pagina = ok(await cliente().from("lead_estado").select("*").eq("tenant_id", tenantId).order("lead_id").range(de, de + 999)) as Estado[];
    tudo.push(...pagina);
    if (pagina.length < 1000) return tudo;
  }
}

export async function carregarDoLead(tenantId: string, leadId: string): Promise<{ estado: Estado | null; notas: Nota[]; historico: Registro[]; pagamentos: Pagamento[] }> {
  const de = (tabela: string) => cliente().from(tabela).select("*").eq("tenant_id", tenantId).eq("lead_id", leadId);
  const [e, n, h, p] = await Promise.all([
    de("lead_estado").maybeSingle(),
    de("lead_notas").order("created_at", { ascending: false }).limit(100),
    de("lead_status_historico").order("created_at", { ascending: false }).limit(100),
    de("lead_pagamentos").order("created_at", { ascending: false }).limit(50),
  ]);
  return { estado: ok(e) as Estado | null, notas: ok(n) as Nota[], historico: ok(h) as Registro[], pagamentos: ok(p) as Pagamento[] };
}

/** Relacionamento e permissão ficam no contato (telefone). Vazio enquanto a entrega 6 não preencher. */
export async function carregarContato(tenantId: string, telefone: string): Promise<{ relacionamento: string; permissao_contato: string } | null> {
  const digitos = telefone.replace(/\D/g, "");
  if (!digitos) return null;
  return ok(await cliente().from("contato_status").select("relacionamento, permissao_contato").eq("tenant_id", tenantId).eq("phone_digits", digitos).maybeSingle()) as any;
}
