// Exames da base (clínica) vivem em public.products com type = 'Exame'.
// Este arquivo converte entre a linha de products e o formato de "exame" que as telas e o servidor de comparação já usam.
// Campos que products não tem ficam em type_attributes: codigo_externo, tipo_exame, parceiro, valor_referencia, nomes_alternativos, unidade, observacoes.

export const TIPO_EXAME = "Exame";
export const COLUNAS_PRODUTO_EXAME =
  "id,name,sku,description,price,cost,category,material,active,type_attributes,created_at,updated_at";

export type Exame = {
  id: string; nome: string; codigo_interno: string | null; codigo_externo: string | null; nomes_alternativos: string[];
  categoria: string | null; tipo: string | null; material: string | null; unidade: string | null;
  custo: number | null; valor: number | null; parceiro: string | null; observacoes: string | null; ativo: boolean;
  /** created_at da linha de products (data de cadastro) */
  criado_em?: string | null;
  /** type_attributes original da linha de products (preserva chaves que a tela não edita) */
  ta: Record<string, any>;
};

const txt = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const positivo = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

/** Linha de products -> exame. Preço/custo 0 ou vazio viram null (= "sem preço"), como era em saude_exames_base. */
export function exameDeProduto(p: any): Exame {
  const ta = p?.type_attributes || {};
  return {
    id: p.id, nome: p.name, codigo_interno: txt(p.sku), codigo_externo: txt(ta.codigo_externo),
    nomes_alternativos: Array.isArray(ta.nomes_alternativos) ? ta.nomes_alternativos.filter((x: unknown) => typeof x === "string") : [],
    categoria: txt(p.category), tipo: txt(ta.tipo_exame), material: txt(p.material), unidade: txt(ta.unidade),
    custo: positivo(p.cost), valor: positivo(p.price), parceiro: txt(ta.parceiro), observacoes: txt(ta.observacoes),
    ativo: p.active !== false, criado_em: p.created_at ?? null, ta: ta,
  };
}

/** Exame (formulário/importação) -> colunas de products. `taAtual` preserva chaves que a tela não edita (ex.: valor_referencia). */
export function produtoDeExame(e: Partial<Omit<Exame, "ta">>, taAtual: Record<string, any> = {}) {
  const ta: Record<string, any> = { ...taAtual };
  const set = (k: string, v: unknown) => { if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) delete ta[k]; else ta[k] = v; };
  set("codigo_externo", e.codigo_externo); set("tipo_exame", e.tipo); set("parceiro", e.parceiro);
  set("nomes_alternativos", e.nomes_alternativos); set("unidade", e.unidade); set("observacoes", e.observacoes);
  return {
    name: e.nome, sku: e.codigo_interno ?? null, category: e.categoria ?? null, material: e.material ?? null,
    price: e.valor ?? 0, cost: e.custo ?? 0, active: e.ativo ?? true, type: TIPO_EXAME, type_attributes: ta,
  };
}

/** Lê todos os exames de um tenant (paginado). `filtro` recebe a query já com tenant + type = Exame + não apagado. */
export async function buscarExames(sb: any, tenantId: string, filtro?: (q: any) => any): Promise<Exame[]> {
  const out: Exame[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from("products").select(COLUNAS_PRODUTO_EXAME).eq("tenant_id", tenantId).eq("type", TIPO_EXAME).is("deleted_at", null).order("name");
    if (filtro) q = filtro(q);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data.map(exameDeProduto));
    if (data.length < 1000) break;
  }
  return out;
}
