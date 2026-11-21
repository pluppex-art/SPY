// Catálogo do fornecedor: os itens que ele vende, subidos por planilha. NÃO são produtos da empresa.
// Um item só vira produto (products) quando uma compra dele dá entrada no estoque.
import { supabase } from "./supabase";
import type { ImportSpec } from "./importer";

export interface CatalogoItem {
  id: string;
  fornecedorId: string;
  nome: string;
  codigo: string;
  ean: string;
  unidade: string;
  categoria: string;
  custo: number | null;
  custoAnterior: number | null;
  custoAtualizadoEm: string | null;
  productId: string | null;
}

export function rowToCatalogoItem(r: any): CatalogoItem {
  return {
    id: r.id,
    fornecedorId: r.fornecedor_id,
    nome: r.nome || "",
    codigo: r.codigo || "",
    ean: r.ean || "",
    unidade: r.unidade || "",
    categoria: r.categoria || "",
    custo: r.custo != null ? Number(r.custo) : null,
    custoAnterior: r.custo_anterior != null ? Number(r.custo_anterior) : null,
    custoAtualizadoEm: r.custo_atualizado_em || null,
    productId: r.product_id || null,
  };
}

export const normTexto = (t: any) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const PAGE = 1000;

/** Lê o catálogo inteiro de um fornecedor (paginado). */
export async function carregarCatalogo(tenantId: string, fornecedorId: string): Promise<CatalogoItem[]> {
  const out: CatalogoItem[] = [];
  if (!supabase) return out;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("fornecedor_catalogo_itens")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("fornecedor_id", fornecedorId)
      .order("nome", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    (data || []).forEach((r) => out.push(rowToCatalogoItem(r)));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/**
 * Importação do catálogo por planilha. Subir de novo ATUALIZA: o item que já existe
 * (mesmo EAN, depois mesmo código, depois mesmo nome) recebe o custo novo e guarda o anterior;
 * o que não existe é adicionado. Nada é apagado.
 */
export function fornecedorCatalogoSpec(ctx: { tenantId: string; fornecedorId: string; fornecedorNome: string; onDone?: () => void }): ImportSpec {
  // Índices do que já está no banco, carregados uma vez por importação e mantidos entre os lotes.
  let indices: Promise<{ ean: Map<string, CatalogoItem>; cod: Map<string, CatalogoItem>; nome: Map<string, CatalogoItem> }> | null = null;
  const carregarIndices = () => {
    if (!indices) {
      indices = carregarCatalogo(ctx.tenantId, ctx.fornecedorId).then((itens) => {
        const ean = new Map<string, CatalogoItem>(), cod = new Map<string, CatalogoItem>(), nome = new Map<string, CatalogoItem>();
        itens.forEach((i) => {
          if (i.ean) ean.set(i.ean, i);
          if (i.codigo) cod.set(normTexto(i.codigo), i);
          nome.set(normTexto(i.nome), i);
        });
        return { ean, cod, nome };
      });
    }
    return indices;
  };

  return {
    entity: "catalogo-fornecedor",
    title: `Subir catálogo de ${ctx.fornecedorNome}`,
    hint: "Cada linha vira um item do catálogo deste fornecedor (não entra no seu estoque). Item que já existe (mesmo EAN, código ou nome) tem o custo atualizado.",
    fields: [
      { key: "nome", label: "Nome do item", required: true, aliases: ["nome do produto", "nome", "produto", "descricao", "item", "mercadoria"] },
      { key: "codigo", label: "Código do fornecedor", aliases: ["codigo do fornecedor", "codigo", "cod", "referencia", "ref", "sku"] },
      { key: "ean", label: "EAN / Código de barras", kind: "digits", aliases: ["ean", "codigo de barras", "gtin", "barras"] },
      { key: "unidade", label: "Unidade", aliases: ["unidade", "un", "und", "embalagem"] },
      { key: "categoria", label: "Categoria", aliases: ["categoria", "grupo", "linha", "departamento"] },
      { key: "custo", label: "Custo (R$)", kind: "money", aliases: ["custo", "preco de custo", "preco", "valor", "preco unitario", "valor unitario"] },
    ],
    needOne: ["nome"],
    build: (v) => ({
      tenant_id: ctx.tenantId,
      fornecedor_id: ctx.fornecedorId,
      nome: String(v.nome).trim(),
      codigo: v.codigo ? String(v.codigo).trim() : null,
      ean: v.ean ? String(v.ean).trim() : null,
      unidade: v.unidade ? String(v.unidade).trim() : null,
      categoria: v.categoria ? String(v.categoria).trim() : null,
      custo: typeof v.custo === "number" ? v.custo : null,
    }),
    insertBatch: async (rows) => {
      if (!supabase) return "Sem conexão com o banco.";
      let idx;
      try { idx = await carregarIndices(); } catch (e: any) { return e?.message || "Erro ao ler o catálogo atual."; }
      const achar = (r: Record<string, any>) =>
        (r.ean && idx.ean.get(r.ean)) || (r.codigo && idx.cod.get(normTexto(r.codigo))) || idx.nome.get(normTexto(r.nome));

      const novos: Record<string, any>[] = [];
      const updates: { id: string; patch: Record<string, any> }[] = [];
      const agora = new Date().toISOString();
      for (const r of rows) {
        const ex = achar(r);
        if (!ex) {
          novos.push(r);
          // Marca como "já visto" para a mesma planilha não criar o item duas vezes.
          const fantasma: CatalogoItem = { ...rowToCatalogoItem({ ...r, id: "" }) };
          if (r.ean) idx.ean.set(r.ean, fantasma);
          if (r.codigo) idx.cod.set(normTexto(r.codigo), fantasma);
          idx.nome.set(normTexto(r.nome), fantasma);
          continue;
        }
        if (!ex.id) continue; // repetido dentro da própria planilha: vale a primeira linha
        const patch: Record<string, any> = {};
        if (r.nome && r.nome !== ex.nome) patch.nome = r.nome;
        if (r.codigo && r.codigo !== ex.codigo) patch.codigo = r.codigo;
        if (r.ean && r.ean !== ex.ean) patch.ean = r.ean;
        if (r.unidade && r.unidade !== ex.unidade) patch.unidade = r.unidade;
        if (r.categoria && r.categoria !== ex.categoria) patch.categoria = r.categoria;
        if (typeof r.custo === "number" && r.custo !== ex.custo) {
          patch.custo = r.custo;
          if (ex.custo != null) { patch.custo_anterior = ex.custo; patch.custo_atualizado_em = agora; }
        }
        if (Object.keys(patch).length > 0) updates.push({ id: ex.id, patch: { ...patch, updated_at: agora } });
      }

      if (novos.length > 0) {
        const { error } = await supabase.from("fornecedor_catalogo_itens").insert(novos);
        if (error) return error.message;
      }
      for (let i = 0; i < updates.length; i += 10) {
        const res = await Promise.all(updates.slice(i, i + 10).map((u) =>
          supabase!.from("fornecedor_catalogo_itens").update(u.patch).eq("id", u.id)));
        const falha = res.find((x) => x.error);
        if (falha?.error) return falha.error.message;
      }
      return null;
    },
    template: [
      ["Nome", "Código", "EAN", "Unidade", "Categoria", "Custo"],
      ["Cabo USB-C 1m", "CB-001", "7891234567890", "UN", "Cabos", "8,90"],
      ["Fone Bluetooth Pro", "FN-220", "", "CX", "Áudio", "42,00"],
    ],
    onDone: ctx.onDone,
  };
}
