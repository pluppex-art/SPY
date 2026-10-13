// Ativos (imóveis, veículos) vivem em public.products, distinguidos por `type`,
// com os campos específicos em `type_attributes` (jsonb). Estes helpers expõem
// o catálogo no formato que as telas do módulo imobiliário já consumiam.
import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE = 1000;

/** Lê todas as linhas de products de um tipo (não excluídas), paginando. */
export async function fetchProductsByType(
  supabase: SupabaseClient<any, any, any> | null | undefined,
  type: string,
  tenantId?: string | null,
): Promise<any[]> {
  if (!supabase) return [];
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("products")
      .select("*")
      .eq("type", type)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data, error } = await q;
    if (error || !data) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

export interface ImovelCatalogo {
  id: string;
  titulo: string;
  tipo: string;
  operacao: string;
  status: string;
  valor: number;
  bairro: string;
  cidade: string;
  area: number;
  quartos: number;
  banheiros: number;
  vagas: number;
  corretor: string;
  visitas: number;
  descricao: string;
  created_at: string;
  updated_at: string;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** products(type='Imóvel') -> formato antigo de imobiliario_imoveis. */
export function mapProductToImovel(p: any): ImovelCatalogo {
  const a = (p?.type_attributes ?? {}) as Record<string, any>;
  return {
    id: p.id,
    titulo: p.name ?? "",
    tipo: a.tipoImovel ?? "",
    operacao: a.operacao ?? "",
    status: a.statusAtivo ?? "Disponível",
    valor: num(p.price),
    bairro: a.bairro ?? "",
    cidade: a.cidade ?? "",
    area: num(a.areaM2),
    quartos: num(a.quartos),
    banheiros: num(a.banheiros),
    vagas: num(a.vagas),
    corretor: a.corretor ?? p.provider ?? "",
    visitas: num(a.visitas),
    descricao: p.description ?? "",
    created_at: p.created_at,
    updated_at: p.updated_at ?? p.created_at,
  };
}

export async function fetchImoveisCatalogo(
  supabase: SupabaseClient<any, any, any> | null | undefined,
  tenantId?: string | null,
): Promise<ImovelCatalogo[]> {
  const rows = await fetchProductsByType(supabase, "Imóvel", tenantId);
  return rows.map(mapProductToImovel);
}
