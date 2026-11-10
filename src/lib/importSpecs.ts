// Definições do que cada tela importa de planilha (campos, duplicados, gravação). O motor é um só
// (ImportadorPlanilha); aqui só mudam os campos e a tabela. Tudo sempre dentro do tenant da sessão.
import { supabase } from "./supabase";
import { extrasToNotes, normalizeEmail, type ImportField, type ImportSpec } from "./importer";
import { funilStageNames, getStageId, phoneKey, pipelineIdDoFunil } from "./funnelIds";
import { friendlyError } from "./friendlyError";

const PAGE = 1000;

/** Lê (paginado) as colunas de uma tabela da empresa e devolve as chaves de duplicidade. */
async function loadKeys(
  table: string, columns: string, tenantId: string,
  toKeys: (row: any) => string[], onProgress: (n: number) => void, softDelete = false,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!supabase) return out;
  for (let from = 0; ; from += PAGE) {
    let q: any = supabase.from(table).select(columns).eq("tenant_id", tenantId);
    if (softDelete) q = q.is("deleted_at", null);
    const { data, error } = await q.order("created_at", { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(friendlyError(error));
    for (const r of data || []) toKeys(r).forEach((k) => k && out.add(k));
    onProgress(from + (data?.length || 0));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

const emailKey = (e: unknown) => { const v = normalizeEmail(e); return v ? `e:${v}` : ""; };
const phoneKeyOf = (p: unknown) => { const k = phoneKey(p); return k.length >= 8 ? `t:${k}` : ""; };
const docKey = (d: unknown) => { const v = String(d ?? "").replace(/\D/g, ""); return v.length >= 11 ? `d:${v}` : ""; };

async function insertInto(table: string, rows: Record<string, any>[]): Promise<string | null> {
  if (!supabase) return "Sem conexão com o banco.";
  const { error } = await supabase.from(table).insert(rows);
  return error ? friendlyError(error) : null;
}

// ─── Leads ───────────────────────────────────────────────────────────────────

const F_NOME: ImportField = { key: "name", label: "Nome", required: true, aliases: ["nome completo", "nome", "name", "inscrito", "participante", "cliente", "contato"] };
const F_EMAIL: ImportField = { key: "email", label: "E-mail", kind: "email", aliases: ["e-mail", "email", "endereco de e mail"] };
const F_FONE: ImportField = { key: "phone", label: "Telefone / WhatsApp", kind: "phone", aliases: ["whatsapp", "telefone", "celular", "fone", "tel", "contato", "phone"] };

export interface LeadsCtx { tenantId: string; filialId?: string | null; sellerName: string; funis: any[]; onDone?: () => void }

export function leadsSpec(ctx: LeadsCtx): ImportSpec {
  const funis = ctx.funis.filter((f) => f.ativo !== false && funilStageNames(f).length > 0);
  const padrao = funis.find((f) => f.tipo !== "sdr_ia") ?? funis[0];
  return {
    entity: "leads",
    title: "Importar leads de uma planilha",
    hint: "Lista de inscritos, clientes ou contatos (Excel, CSV ou Google Forms). Cada linha vira um lead no funil escolhido.",
    keepExtras: true,
    fields: [
      F_NOME, F_FONE, F_EMAIL,
      { key: "company", label: "Empresa", aliases: ["empresa", "company", "razao social", "organizacao"] },
      { key: "document_id", label: "CPF / CNPJ", kind: "digits", aliases: ["cpf", "cnpj", "documento", "cpf cnpj"] },
      { key: "city", label: "Cidade", aliases: ["cidade", "city", "municipio"] },
      { key: "state", label: "Estado (UF)", aliases: ["estado", "uf", "state"] },
      { key: "value", label: "Valor estimado (R$)", kind: "money", aliases: ["valor", "value", "ticket", "preco"] },
      { key: "source", label: "Origem (da linha)", aliases: ["origem", "source", "canal", "como conheceu"] },
      { key: "lead_interesse_cliente", label: "Interesse", aliases: ["interesse", "produto", "curso", "evento", "modalidade", "plano"] },
      { key: "notes", label: "Observações", aliases: ["observacao", "observacoes", "obs", "comentario", "mensagem"] },
    ],
    needOne: ["name", "email", "phone"],
    options: (v) => {
      const fid = v.funil || padrao?.id || "";
      const f = funis.find((x) => x.id === fid) ?? padrao;
      return [
        { key: "funil", label: "Funil de destino", type: "select", choices: funis.map((x) => ({ value: x.id, label: x.nome || x.name || x.id })), default: padrao?.id },
        { key: "etapa", label: "Etapa inicial", type: "select", choices: (f ? funilStageNames(f) : []).map((n, i) => ({ value: String(i), label: n })), default: "0" },
        { key: "origem", label: "Origem padrão (quando a linha não tiver)", type: "text", placeholder: "Ex.: Treinão 14/11", default: "Importação de planilha" },
      ];
    },
    rowKeys: (v) => [emailKey(v.email), phoneKeyOf(v.phone), docKey(v.document_id)].filter(Boolean),
    loadExistingKeys: (onProgress) => loadKeys("leads", "email, phone, mobile_wa, document_id", ctx.tenantId,
      (r) => [emailKey(r.email), phoneKeyOf(r.phone), phoneKeyOf(r.mobile_wa), docKey(r.document_id)], onProgress, true),
    build: (v, extras, o) => {
      const f = funis.find((x) => x.id === o.funil) ?? padrao;
      const notes = [v.notes, extrasToNotes(extras)].filter(Boolean).join("\n");
      return {
        name: v.name || v.email || v.phone || "Lead importado",
        company: v.company || null,
        email: v.email || null,
        phone: v.phone || null,
        document_id: v.document_id || null,
        city: v.city || null,
        state: v.state ? String(v.state).toUpperCase().slice(0, 2) : null,
        value: typeof v.value === "number" ? v.value : 0,
        source: v.source || o.origem || "Importação de planilha",
        lead_interesse_cliente: v.lead_interesse_cliente || null,
        notes: notes || null,
        status: "Novo",
        stageId: f ? getStageId(f.id, Number(o.etapa) || 0) : "1",
        pipelineId: f ? pipelineIdDoFunil(f) : "comercial",
        filial_id: ctx.filialId ?? null,
        seller: ctx.sellerName || "Sistema",
        tenant_id: ctx.tenantId,
        scoreIA: 50,
        date: new Date().toISOString().split("T")[0],
        customFields: {},
      };
    },
    insertBatch: (rows) => insertInto("leads", rows),
    template: [
      ["Nome", "WhatsApp", "E-mail", "Empresa", "Cidade", "UF", "Interesse"],
      ["João Silva", "(11) 99999-8888", "joao@email.com", "Acme", "São Paulo", "SP", "Treinão"],
      ["Maria Santos", "21988887777", "maria@email.com", "", "Rio de Janeiro", "RJ", "Treinão"],
    ],
    onDone: ctx.onDone,
  };
}

// ─── Clientes / Empresas (mesma tabela) ──────────────────────────────────────

export function clientesSpec(ctx: { tenantId: string; onDone?: () => void }, kind: "clientes" | "empresas" = "clientes"): ImportSpec {
  return {
    entity: kind,
    title: kind === "empresas" ? "Importar empresas de uma planilha" : "Importar clientes de uma planilha",
    hint: "Cada linha vira um cadastro. Quem já existe (mesmo CPF/CNPJ, e-mail ou telefone) é pulado.",
    fields: [
      { key: "name", label: kind === "empresas" ? "Razão social / Nome" : "Nome", required: true, aliases: ["razao social", "nome completo", "nome", "empresa", "cliente", "name", "nome fantasia"] },
      { key: "documento", label: "CPF / CNPJ", kind: "digits", aliases: ["cnpj", "cpf", "documento", "cpf cnpj"] },
      F_EMAIL, F_FONE,
      { key: "city", label: "Cidade", aliases: ["cidade", "city", "municipio"] },
      { key: "state", label: "Estado (UF)", aliases: ["estado", "uf"] },
      { key: "industry", label: "Setor", aliases: ["setor", "segmento", "ramo", "industria"] },
      { key: "cep", label: "CEP", kind: "digits", aliases: ["cep"] },
      { key: "logradouro", label: "Endereço", aliases: ["endereco", "logradouro", "rua"] },
      { key: "numero", label: "Número", aliases: ["numero", "num"] },
      { key: "bairro", label: "Bairro", aliases: ["bairro"] },
    ],
    needOne: ["name"],
    rowKeys: (v) => [docKey(v.documento), emailKey(v.email), phoneKeyOf(v.phone)].filter(Boolean),
    loadExistingKeys: (onProgress) => loadKeys("clientes", "documento, email, phone", ctx.tenantId, (r) => [docKey(r.documento), emailKey(r.email), phoneKeyOf(r.phone)], onProgress),
    build: (v) => ({
      name: v.name,
      documento: v.documento || null,
      email: v.email || null,
      phone: v.phone || null,
      city: v.city || null,
      state: v.state ? String(v.state).toUpperCase().slice(0, 2) : null,
      industry: v.industry || null,
      cep: v.cep || null,
      logradouro: v.logradouro || null,
      numero: v.numero || null,
      bairro: v.bairro || null,
      status: "Ativo",
      tenant_id: ctx.tenantId,
    }),
    insertBatch: (rows) => insertInto("clientes", rows),
    template: [
      ["Nome", "CNPJ/CPF", "E-mail", "Telefone", "Cidade", "UF", "Setor"],
      ["Acme Ltda", "12345678000199", "contato@acme.com", "(11) 3333-4444", "São Paulo", "SP", "Varejo"],
      ["Maria Santos", "12345678901", "maria@email.com", "21988887777", "Rio de Janeiro", "RJ", ""],
    ],
    onDone: ctx.onDone,
  };
}

// ─── Pacientes (Clínica) ─────────────────────────────────────────────────────

export function pacientesSpec(ctx: { tenantId: string; onDone?: () => void }): ImportSpec {
  return {
    entity: "pacientes",
    title: "Importar pacientes de uma planilha",
    hint: "Cada linha vira um paciente. Quem já existe (mesmo CPF, e-mail ou telefone) é pulado.",
    keepExtras: true,
    fields: [
      { key: "nome", label: "Nome", required: true, aliases: ["nome completo", "nome", "paciente"] },
      { key: "cpf", label: "CPF", kind: "digits", aliases: ["cpf", "documento"] },
      { key: "telefone", label: "Telefone / WhatsApp", kind: "phone", aliases: ["whatsapp", "telefone", "celular", "fone"] },
      F_EMAIL,
      { key: "data_nascimento", label: "Data de nascimento", kind: "date", aliases: ["data de nascimento", "nascimento", "data nasc", "aniversario"] },
      { key: "convenio", label: "Convênio", aliases: ["convenio", "plano de saude", "plano"] },
      { key: "alergias", label: "Alergias", aliases: ["alergias", "alergia"] },
      { key: "observacoes", label: "Observações", aliases: ["observacoes", "observacao", "obs"] },
    ],
    needOne: ["nome"],
    rowKeys: (v) => [docKey(v.cpf), emailKey(v.email), phoneKeyOf(v.telefone)].filter(Boolean),
    loadExistingKeys: (onProgress) => loadKeys("pacientes", "cpf, email, telefone", ctx.tenantId, (r) => [docKey(r.cpf), emailKey(r.email), phoneKeyOf(r.telefone)], onProgress),
    build: (v, extras) => ({
      nome: v.nome,
      cpf: v.cpf || null,
      telefone: v.telefone || null,
      email: v.email || null,
      data_nascimento: v.data_nascimento || null,
      convenio: v.convenio || null,
      alergias: v.alergias || null,
      observacoes: [v.observacoes, extrasToNotes(extras, 1500)].filter(Boolean).join("\n") || null,
      status: "Ativo",
      tenant_id: ctx.tenantId,
    }),
    insertBatch: (rows) => insertInto("pacientes", rows),
    template: [
      ["Nome", "CPF", "WhatsApp", "E-mail", "Data de nascimento", "Convênio"],
      ["Ana Souza", "12345678901", "(11) 99999-8888", "ana@email.com", "15/03/1990", "Particular"],
      ["Carlos Lima", "", "21988887777", "", "02/11/1984", "Unimed"],
    ],
    onDone: ctx.onDone,
  };
}

// ─── Alunos (Educação) ───────────────────────────────────────────────────────

export function alunosSpec(ctx: { tenantId: string; turmaId?: string | null; onDone?: () => void }): ImportSpec {
  return {
    entity: "alunos",
    title: "Importar alunos de uma planilha",
    hint: "Cada linha vira um aluno. Quem já existe (mesmo e-mail ou telefone) é pulado.",
    fields: [
      { key: "nome", label: "Nome", required: true, aliases: ["nome completo", "nome", "aluno"] },
      F_EMAIL,
      { key: "telefone", label: "Telefone / WhatsApp", kind: "phone", aliases: ["whatsapp", "telefone", "celular", "fone"] },
    ],
    needOne: ["nome"],
    rowKeys: (v) => [emailKey(v.email), phoneKeyOf(v.telefone)].filter(Boolean),
    loadExistingKeys: (onProgress) => loadKeys("students", "email, telefone", ctx.tenantId, (r) => [emailKey(r.email), phoneKeyOf(r.telefone)], onProgress),
    build: (v) => ({
      nome: v.nome,
      email: v.email || null,
      telefone: v.telefone || null,
      turma_id: ctx.turmaId || null,
      status: "Ativo",
      tenant_id: ctx.tenantId,
    }),
    insertBatch: (rows) => insertInto("students", rows),
    template: [
      ["Nome", "E-mail", "WhatsApp"],
      ["Bruno Alves", "bruno@email.com", "(11) 99999-8888"],
      ["Carla Dias", "carla@email.com", "21988887777"],
    ],
    onDone: ctx.onDone,
  };
}

// ─── Produtos / Catálogo (todos os nichos: loja, veículos, imóveis, serviços) ─

export function produtosSpec(ctx: { tenantId: string; filialId?: string | null; onDone?: () => void }): ImportSpec {
  return {
    entity: "produtos",
    title: "Importar produtos de uma planilha",
    hint: "Catálogo de produtos, serviços, veículos ou imóveis. Quem já existe (mesmo código/SKU) é pulado.",
    fields: [
      { key: "name", label: "Nome", required: true, aliases: ["nome do produto", "nome", "produto", "descricao", "titulo", "name", "servico"] },
      { key: "sku", label: "Código / SKU", aliases: ["sku", "codigo", "cod", "referencia", "codigo de barras", "ean"] },
      { key: "price", label: "Preço de venda", kind: "money", aliases: ["preco de venda", "preco", "valor", "valor de venda", "price"] },
      { key: "cost", label: "Custo", kind: "money", aliases: ["custo", "preco de custo", "cost"] },
      { key: "category", label: "Categoria", aliases: ["categoria", "grupo", "linha", "departamento"] },
      { key: "type", label: "Tipo", aliases: ["tipo"] },
      { key: "stock", label: "Estoque", kind: "int", aliases: ["estoque", "quantidade", "qtd", "saldo"] },
      { key: "description", label: "Descrição", aliases: ["descricao detalhada", "descricao", "detalhes"] },
    ],
    needOne: ["name"],
    rowKeys: (v) => (v.sku ? [`s:${String(v.sku).trim().toLowerCase()}`] : []),
    loadExistingKeys: (onProgress) => loadKeys("products", "sku", ctx.tenantId, (r) => (r.sku ? [`s:${String(r.sku).trim().toLowerCase()}`] : []), onProgress, true),
    build: (v) => ({
      name: v.name,
      sku: v.sku || null,
      price: typeof v.price === "number" ? v.price : 0,
      cost: typeof v.cost === "number" ? v.cost : null,
      category: v.category || null,
      type: v.type || "Físico",
      stock: typeof v.stock === "number" ? v.stock : null,
      description: v.description || null,
      active: true,
      filial_id: ctx.filialId ?? null,
      tenant_id: ctx.tenantId,
    }),
    insertBatch: (rows) => insertInto("products", rows),
    template: [
      ["Nome", "SKU", "Preço", "Custo", "Categoria", "Estoque"],
      ["Camiseta Dry Fit", "CAM-001", "89,90", "35,00", "Vestuário", "40"],
      ["Consultoria mensal", "SRV-010", "1500", "", "Serviços", ""],
    ],
    onDone: ctx.onDone,
  };
}
