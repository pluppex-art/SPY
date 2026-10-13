// Veículos vivem em public.products (type = 'Veículo'); os atributos específicos
// ficam em products.type_attributes. Estes helpers expõem os registros no
// formato da antiga tabela imobiliario_veiculos para as telas do módulo automotivo.
import type { SupabaseClient } from "@supabase/supabase-js";

export const TIPO_VEICULO = "Veículo";

export interface VeiculoCatalogo {
  id: string;
  marca: string;
  modelo: string;
  ano_fabricacao: number | null;
  ano_modelo: number | null;
  km: number;
  placa: string;
  cor: string;
  combustivel: string;
  cambio: string;
  valor: number;
  status: string;
  vendedor: string;
  visitas: number;
  descricao: string;
  is_consignado: boolean;
  consignante_nome: string | null;
  consignante_telefone: string | null;
  comissao_percentual: number | null;
  repasse_realizado: boolean;
  created_at: string | null;
  updated_at: string | null;
}

const num = (v: unknown): number => (typeof v === "number" ? v : parseFloat(String(v ?? "")) || 0);
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = num(v);
  return Number.isFinite(n) ? n : null;
};

/** Converte uma linha de products (type='Veículo') no formato antigo de imobiliario_veiculos. */
export function mapProductToVeiculo(p: any): VeiculoCatalogo {
  const a = (p?.type_attributes ?? p?.typeAttributes ?? {}) as Record<string, any>;
  return {
    id: p.id,
    marca: a.marca ?? "",
    modelo: a.modelo ?? "",
    ano_fabricacao: numOrNull(a.anoFabricacao),
    ano_modelo: numOrNull(a.anoModelo),
    km: num(a.km),
    placa: a.placa ?? p.sku ?? "",
    cor: a.cor ?? "",
    combustivel: a.combustivel ?? "",
    cambio: a.cambio ?? "",
    valor: num(p.price),
    status: a.statusAtivo ?? "Disponível",
    vendedor: a.vendedor ?? "",
    visitas: num(a.visitas),
    descricao: p.description ?? "",
    is_consignado: !!a.isConsignado,
    consignante_nome: a.consignanteNome ?? null,
    consignante_telefone: a.consignanteTelefone ?? null,
    comissao_percentual: numOrNull(a.comissaoPercentual),
    repasse_realizado: !!a.repasseRealizado,
    created_at: p.created_at ?? null,
    updated_at: p.updated_at ?? null,
  };
}

/** Rótulo "marca modelo" (fallback para o name do produto). */
export function veiculoLabel(p: any): string {
  const a = (p?.type_attributes ?? {}) as Record<string, any>;
  const l = `${a.marca ?? ""} ${a.modelo ?? ""}`.trim();
  return l || p?.name || "Veículo";
}

/** Rótulo a partir do embed `products(name,sku,type_attributes)` de uma linha de tabela relacionada. */
export function veiculoLabelFromEmbed(embed: any): string | null {
  if (!embed) return null;
  return veiculoLabel(embed);
}

export const VEICULO_EMBED = "products(name,sku,type_attributes)";

/** Lista todos os veículos (não deletados) do tenant, paginando em blocos de 1000. */
export async function fetchVeiculosCatalogo(
  supabase: SupabaseClient,
  tenantId?: string | null,
): Promise<{ data: VeiculoCatalogo[]; error: any }> {
  const pageSize = 1000;
  const rows: any[] = [];
  for (let from = 0; ; from += pageSize) {
    let q = supabase
      .from("products")
      .select("*")
      .eq("type", TIPO_VEICULO)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data, error } = await q;
    if (error) return { data: [], error };
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return { data: rows.map(mapProductToVeiculo), error: null };
}

/**
 * Mescla `patch` em products.type_attributes (read-modify-write) e mantém
 * active/currentStock coerentes com statusAtivo.
 */
export async function updateVeiculoAtributos(
  supabase: SupabaseClient,
  id: string,
  patch: Record<string, any>,
): Promise<{ data: VeiculoCatalogo | null; error: any }> {
  const { data: cur, error: readErr } = await supabase
    .from("products")
    .select("type_attributes")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { data: null, error: readErr };
  const merged: Record<string, any> = { ...((cur?.type_attributes as any) ?? {}), ...patch };
  const update: Record<string, any> = { type_attributes: merged };
  if ("statusAtivo" in patch) {
    const s = merged.statusAtivo || "Disponível";
    update.active = s !== "Vendido" && s !== "Locado";
    update.currentStock = s === "Disponível" ? 1 : 0;
  }
  const { data, error } = await supabase.from("products").update(update).eq("id", id).select().maybeSingle();
  return { data: data ? mapProductToVeiculo(data) : null, error };
}
