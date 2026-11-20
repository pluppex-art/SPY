import { supabase } from "../../../lib/supabase";

/**
 * Acha (ou cria) a categoria de DESPESA com esse nome e devolve o id — para os lançamentos gerados pela
 * Folha e pelas Comissões entrarem no Orçamento e na DRE, e não só no texto livre `category`.
 */
export async function categoriaDespesaId(tenantId: string, nome: string, subtipo: string | null): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("finance_categories").select("id").eq("tenant_id", tenantId).eq("tipo", "Despesa").ilike("nome", nome).limit(1);
  if (data?.[0]?.id) return data[0].id;
  const id = crypto.randomUUID();
  const { error } = await supabase.from("finance_categories").insert({ id, tenant_id: tenantId, nome, tipo: "Despesa", subtipo });
  return error ? null : id;
}
