import { supabase } from "../../../lib/supabase";

const norm = (v: string) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Devolve o id da categoria de DESPESA com esse nome, para os lançamentos gerados pela Folha e pelas
 * Comissões entrarem no Orçamento e na DRE. Só procura uma categoria que já existe no Plano de Contas:
 * nunca cria (criar sozinho gerava categorias repetidas). Sem categoria, o lançamento fica só com o texto.
 */
export async function categoriaDespesaId(tenantId: string, nome: string, _subtipo?: string | null): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("finance_categories").select("id, nome").eq("tenant_id", tenantId).eq("tipo", "Despesa").limit(2000);
  return (data || []).find((c: any) => norm(c.nome) === norm(nome))?.id ?? null;
}
