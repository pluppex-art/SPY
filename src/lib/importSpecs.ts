// Definições do que cada tela importa de planilha (campos, duplicados, gravação). O motor é um só
// (ImportadorPlanilha); aqui só mudam os campos e a tabela. Tudo sempre dentro do tenant da sessão.
import { supabase } from "./supabase";
import { distribuir, parseDist, extrasToNotes, normalizeEmail, stripText, type BuiltRow, type ImportField, type ImportSpec } from "./importer";
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

/** Como loadKeys, mas devolve chave -> {id, status} do cadastro existente (a 1ª ocorrência vale). */
async function loadRefs(
  table: string, columns: string, tenantId: string,
  toKeys: (row: any) => string[], onProgress: (n: number) => void, softDelete = false,
): Promise<Map<string, { id: string; status: string }>> {
  const out = new Map<string, { id: string; status: string }>();
  if (!supabase) return out;
  for (let from = 0; ; from += PAGE) {
    let q: any = supabase.from(table).select(`id, status, ${columns}`).eq("tenant_id", tenantId);
    if (softDelete) q = q.is("deleted_at", null);
    const { data, error } = await q.order("created_at", { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(friendlyError(error));
    for (const r of data || []) for (const k of toKeys(r)) if (k && !out.has(k)) out.set(k, { id: String(r.id), status: String(r.status ?? "") });
    onProgress(from + (data?.length || 0));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

const emailKey = (e: unknown) => { const v = normalizeEmail(e); return v ? `e:${v}` : ""; };
const phoneKeyOf = (p: unknown) => { const k = phoneKey(p); return k.length >= 8 ? `t:${k}` : ""; };
/** Chaves de TODOS os telefones da linha (a célula pode ter mais de um número). */
const phonesKeys = (v: Record<string, any>, key: string) => [v[key], ...(v[`${key}__todos`] || [])].map(phoneKeyOf).filter(Boolean);
const docKey = (d: unknown) => { const v = String(d ?? "").replace(/\D/g, ""); return v.length >= 11 ? `d:${v}` : ""; };

/** Erro do banco em português, dizendo QUAL campo/valor deu problema quando dá para saber. */
function describeDbError(error: any): string {
  const raw = String(error?.message ?? "");
  const nulo = raw.match(/null value in column "([^"]+)"/i);
  if (nulo) return `o campo "${nulo[1]}" é obrigatório e veio vazio`;
  const longo = raw.match(/value too long for type character varying\((\d+)\)/i);
  if (longo) return `algum texto passou de ${longo[1]} caracteres`;
  const tipo = raw.match(/invalid input syntax for type (\w+): "([^"]*)"/i);
  if (tipo) return `valor "${String(tipo[2]).slice(0, 40)}" inválido para ${tipo[1]}`;
  if (/plan|limite/i.test(raw) && /lead/i.test(raw)) return "limite de leads do plano atingido";
  return friendlyError(error);
}

async function insertInto(table: string, rows: Record<string, any>[]): Promise<string | null> {
  if (!supabase) return "Sem conexão com o banco.";
  const { error } = await supabase.from(table).insert(rows);
  return error ? describeDbError(error) : null;
}

// ─── Leads ───────────────────────────────────────────────────────────────────

const F_NOME: ImportField = { key: "name", label: "Nome", required: true, aliases: ["nome completo", "nome", "name", "inscrito", "participante", "cliente", "contato"] };
const F_EMAIL: ImportField = { key: "email", label: "E-mail", kind: "email", aliases: ["e-mail", "email", "endereco de e mail"] };
const F_FONE: ImportField = { key: "phone", label: "Telefone / WhatsApp", kind: "phone", aliases: ["whatsapp", "telefone", "celular", "fone", "tel", "contato", "phone"] };

export interface LeadsCtx { tenantId: string; filialId?: string | null; sellerName: string; sellerUserId?: string | null; sellers?: { nome: string; userId?: string | null }[]; rodizioElegiveis?: number; funis: any[]; onDone?: () => void }

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
        { key: "distribuicao", label: "Quem recebe estes leads", type: "vendedores", vendedores: ctx.sellers ?? [], rodizioElegiveis: ctx.rodizioElegiveis, semEu: !ctx.sellerName,
          // Quem não é da empresa não pode ficar com os leads: já abre dividindo igualmente entre todos os vendedores dela.
          default: ctx.sellerName ? undefined : JSON.stringify({ modo: "igual", itens: (ctx.sellers ?? []).map((s) => ({ nome: s.nome, userId: s.userId ?? null, qtd: 0 })), restante: "rodizio" }) },
        { key: "funil", label: "Funil de destino", type: "select", choices: funis.map((x) => ({ value: x.id, label: x.nome || x.name || x.id })), default: padrao?.id },
        { key: "etapa", label: "Etapa inicial", type: "select", choices: (f ? funilStageNames(f) : []).map((n, i) => ({ value: String(i), label: n })), default: "0" },
        { key: "origem", label: "Origem padrão (quando a linha não tiver)", type: "text", placeholder: "Ex.: Treinão 14/11", default: "Importação de planilha" },
        { key: "jaExistem", label: "Quem já está cadastrado (mesmo telefone, e-mail ou documento)", type: "select", default: "pular", choices: [
          { value: "pular", label: "Não mexer (pular)" },
          { value: "mover", label: "Mover para o funil e a etapa acima (clientes já fechados ficam como estão)" },
          { value: "mover_todos", label: "Mover todos, inclusive os já fechados" },
        ] },
      ];
    },
    rowKeys: (v) => [emailKey(v.email), ...phonesKeys(v, "phone"), docKey(v.document_id)].filter(Boolean),
    loadExistingKeys: (onProgress) => loadKeys("leads", "email, phone, mobile_wa, document_id", ctx.tenantId,
      (r) => [emailKey(r.email), phoneKeyOf(r.phone), phoneKeyOf(r.mobile_wa), docKey(r.document_id)], onProgress, true),
    loadExistingRefs: (onProgress) => loadRefs("leads", "email, phone, mobile_wa, document_id", ctx.tenantId,
      (r) => [emailKey(r.email), phoneKeyOf(r.phone), phoneKeyOf(r.mobile_wa), docKey(r.document_id)], onProgress, true),
    // Move para o funil/etapa escolhidos os leads que já existiam. Vendas fechadas só mudam se o usuário pedir ("mover_todos").
    moveExisting: async (existing, o) => {
      const f = funis.find((x) => x.id === o.funil) ?? padrao;
      if (!supabase || !f) return { moved: 0, kept: 0, notes: [] };
      const idx = Number(o.etapa) || 0;
      const nomeEtapa = funilStageNames(f)[idx] ?? String(idx);
      const incluirFechados = o.jaExistem === "mover_todos";
      const alvo = existing.filter((e) => incluirFechados || e.status !== "Fechado");
      const kept = existing.length - alvo.length;
      let moved = 0;
      for (let i = 0; i < alvo.length; i += 100) {
        const ids = alvo.slice(i, i + 100).map((e) => e.id);
        const { data, error } = await supabase.from("leads")
          .update({ pipelineId: pipelineIdDoFunil(f), stageId: getStageId(f.id, idx), status: "Novo" })
          .in("id", ids).eq("tenant_id", ctx.tenantId).select("id");
        if (error) throw new Error(describeDbError(error));
        moved += data?.length ?? 0;
      }
      const notes: string[] = [];
      if (moved > 0) notes.push(`${moved.toLocaleString("pt-BR")} lead(s) que já existiam foram movidos para "${f.nome} › ${nomeEtapa}".`);
      if (kept > 0) notes.push(`${kept.toLocaleString("pt-BR")} que já eram clientes fechados ficaram como estavam.`);
      return { moved, kept, notes };
    },
    // Atribui o responsável de cada lead conforme a distribuição escolhida (depois de tirar os duplicados, para a conta fechar).
    resolve: async (rows, o) => {
      const cfg = parseDist(o.distribuicao ?? "");
      const notes: string[] = [];
      if (cfg.modo === "eu" && ctx.sellerName) { notes.push(`Responsável: ${ctx.sellerName} (todos os ${rows.length} leads).`); return { rows, rejected: [], notes }; }
      if (!ctx.sellerName && (cfg.modo === "eu" || cfg.itens.length === 0) && cfg.modo !== "rodizio") return { rows: [], rejected: rows.map((r) => ({ line: r.line, reason: "Escolha ao menos um vendedor desta empresa para receber os leads" })), notes };
      // Sem closer elegível no rodízio, o banco não escolheria ninguém e o lead ficaria sem responsável: nesse caso fica com quem importou.
      const semRodizio = ctx.rodizioElegiveis === 0;
      if (cfg.modo === "rodizio" && semRodizio && !ctx.sellerName) return { rows: [], rejected: rows.map((r) => ({ line: r.line, reason: "O rodízio automático desta empresa não tem closer ativo; escolha os vendedores que recebem os leads" })), notes };
      if (cfg.modo === "rodizio" && semRodizio && ctx.sellerName) { notes.push(`O rodízio automático não tem nenhum closer ativo; os ${rows.length} lead(s) ficaram com ${ctx.sellerName}.`); return { rows, rejected: [], notes }; }
      if (cfg.modo === "rodizio") { notes.push(`${rows.length} lead(s) enviados ao rodízio automático do sistema.`); return { rows: rows.map((r) => ({ ...r, values: { ...r.values, __seller: "" } })), rejected: [], notes }; }
      const d = distribuir(rows.length, cfg);
      const restanteEu = !!ctx.sellerName && (cfg.restante === "eu" || semRodizio);
      // Quem não é da empresa e sem rodízio possível: o que sobrar é dividido entre os mesmos vendedores (nunca fica sem dono).
      const sobraParaVendedores = !ctx.sellerName && semRodizio && cfg.itens.length > 0;
      let giro = 0;
      const out = rows.map((r, i) => {
        let k = d.atribuicao[i];
        if (k < 0 && sobraParaVendedores) { k = giro % cfg.itens.length; giro++; d.contagem[k]++; }
        if (k >= 0) return { ...r, values: { ...r.values, __seller: cfg.itens[k].nome, __sellerId: cfg.itens[k].userId ?? null } };
        return { ...r, values: { ...r.values, __seller: restanteEu ? ctx.sellerName : "", __sellerId: restanteEu ? ctx.sellerUserId ?? null : null } };
      });
      cfg.itens.forEach((it, i) => { if (d.contagem[i] > 0) notes.push(`${it.nome}: ${d.contagem[i]} lead(s).`); });
      if (d.restante > 0 && sobraParaVendedores) notes.push(`${d.restante} lead(s) a mais foram divididos entre os vendedores escolhidos.`);
      else if (d.restante > 0) notes.push(restanteEu ? `${d.restante} lead(s) ficaram com ${ctx.sellerName}.` : `${d.restante} lead(s) foram para o rodízio automático.`);
      return { rows: out, rejected: [], notes };
    },
    build: (v, extras, o) => {
      const f = funis.find((x) => x.id === o.funil) ?? padrao;
      const outros = Array.isArray(v.phone__todos) && v.phone__todos.length > 1 ? `Outros telefones: ${v.phone__todos.slice(1).join(", ")}` : "";
      const notes = [v.notes, outros, extrasToNotes(extras)].filter(Boolean).join("\n");
      return {
        name: v.name || v.email || v.phone || "Lead importado",
        company: v.company || null,
        email: v.email || "", // coluna obrigatória (padrão vazio): NULL explícito derrubava o lote inteiro
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
        // __seller definido pela distribuição: "" = deixa o rodízio automático do banco escolher; ausente = quem importou.
        seller: v.__seller !== undefined ? v.__seller : ctx.sellerName || "Sistema",
        ...(v.__sellerId ? { seller_id: v.__sellerId } : {}),
        tenant_id: ctx.tenantId,
        scoreIA: 50,
        date: new Date().toISOString().split("T")[0],
        // O formulário do lead e os filtros leem cidade/estado em customFields; grava nos dois lugares.
        customFields: { ...(v.city ? { cidade: String(v.city).trim() } : {}), ...(v.state ? { estado: String(v.state).trim().toUpperCase().slice(0, 2) } : {}) },
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

export function clientesSpec(ctx: { tenantId: string; onDone?: () => void }, kind: "clientes" | "empresas" | "financeiro" = "clientes"): ImportSpec {
  return {
    entity: kind,
    title: kind === "empresas" ? "Importar empresas de uma planilha" : kind === "financeiro" ? "Importar contatos financeiros de uma planilha" : "Importar clientes de uma planilha",
    options: kind === "financeiro" ? () => [{ key: "tipo", label: "Tipo dos contatos", type: "select", choices: [{ value: "CLIENTE", label: "Clientes" }, { value: "FORNECEDOR", label: "Fornecedores" }, { value: "FUNCIONARIO", label: "Funcionários" }], default: "CLIENTE" }] : undefined,
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
    rowKeys: (v) => [docKey(v.documento), emailKey(v.email), ...phonesKeys(v, "phone")].filter(Boolean),
    loadExistingKeys: (onProgress) => loadKeys("clientes", "documento, email, phone", ctx.tenantId, (r) => [docKey(r.documento), emailKey(r.email), phoneKeyOf(r.phone)], onProgress),
    build: (v, _x, o) => ({
      ...(kind === "financeiro" ? { tipos: [o.tipo || "CLIENTE"], tipo_pessoa: String(v.documento || "").length === 14 ? "PJ" : "PF" } : {}),
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
    rowKeys: (v) => [docKey(v.cpf), emailKey(v.email), ...phonesKeys(v, "telefone")].filter(Boolean),
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
    rowKeys: (v) => [emailKey(v.email), ...phonesKeys(v, "telefone")].filter(Boolean),
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

export function produtosSpec(ctx: { tenantId: string; filialId?: string | null; defaultType?: string | null; onDone?: () => void }): ImportSpec {
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
      type: v.type || ctx.defaultType || "Físico",
      stock: typeof v.stock === "number" ? v.stock : 0, // coluna obrigatória (padrão 0)
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

// ─── Contatos de empresas (CRM › Contatos): cada contato pertence a um cliente/empresa ───────────

export function contatosSpec(ctx: { tenantId: string; onDone?: () => void }): ImportSpec {
  return {
    entity: "contatos",
    title: "Importar contatos de uma planilha",
    hint: "Cada contato precisa da empresa a que pertence (coluna com o nome ou o CNPJ da empresa já cadastrada). Importe as empresas antes, se ainda não existirem.",
    keepExtras: true,
    fields: [
      { key: "nome", label: "Nome do contato", required: true, aliases: ["nome do contato", "nome completo", "nome", "contato"] },
      { key: "empresa", label: "Empresa (nome ou CNPJ)", required: true, aliases: ["empresa", "cliente", "razao social", "cnpj", "organizacao"] },
      { key: "cargo", label: "Cargo", aliases: ["cargo", "funcao", "posicao"] },
      F_EMAIL,
      { key: "telefone", label: "Telefone", kind: "phone", aliases: ["telefone", "fone", "tel"] },
      { key: "whatsapp", label: "WhatsApp", kind: "phone", aliases: ["whatsapp", "celular"] },
      { key: "departamento", label: "Departamento", aliases: ["departamento", "setor", "area"] },
      { key: "observacoes", label: "Observações", aliases: ["observacoes", "observacao", "obs"] },
    ],
    needOne: ["nome"],
    rowKeys: (v) => [emailKey(v.email), ...phonesKeys(v, "whatsapp"), ...phonesKeys(v, "telefone")].filter(Boolean),
    loadExistingKeys: (onProgress) => loadKeys("cliente_contatos", "email, telefone, whatsapp", ctx.tenantId, (r) => [emailKey(r.email), phoneKeyOf(r.telefone), phoneKeyOf(r.whatsapp)], onProgress),
    resolve: async (rows: BuiltRow[]) => {
      const byName = new Map<string, string>(), byDoc = new Map<string, string>();
      await loadKeys("clientes", "id, name, documento", ctx.tenantId, (r) => {
        if (r.name) byName.set(stripText(r.name), r.id);
        const d = String(r.documento ?? "").replace(/\D/g, "");
        if (d.length >= 11) byDoc.set(d, r.id);
        return [];
      }, () => undefined);
      const ok: BuiltRow[] = [], rejected: { line: number; reason: string }[] = [];
      for (const r of rows) {
        const emp = String(r.values.empresa ?? "");
        const id = byDoc.get(emp.replace(/\D/g, "")) ?? byName.get(stripText(emp));
        if (id) ok.push({ ...r, values: { ...r.values, cliente_id: id } });
        else rejected.push({ line: r.line, reason: "Empresa não encontrada no cadastro (confira o nome/CNPJ ou importe as empresas primeiro)" });
      }
      return { rows: ok, rejected };
    },
    build: (v, extras) => ({
      cliente_id: v.cliente_id,
      nome: v.nome,
      cargo: v.cargo || null,
      email: v.email || null,
      telefone: v.telefone || null,
      whatsapp: v.whatsapp || null,
      departamento: v.departamento || null,
      observacoes: [v.observacoes, extrasToNotes(extras, 1500)].filter(Boolean).join("\n") || null,
      principal: false,
      tenant_id: ctx.tenantId,
    }),
    insertBatch: (rows) => insertInto("cliente_contatos", rows),
    template: [
      ["Nome", "Empresa", "Cargo", "E-mail", "WhatsApp"],
      ["João Silva", "Acme Ltda", "Diretor", "joao@acme.com", "(11) 99999-8888"],
      ["Maria Santos", "12345678000199", "Compras", "maria@acme.com", ""],
    ],
    onDone: ctx.onDone,
  };
}

// ─── Fornecedores (Varejo) ───────────────────────────────────────────────────

export function fornecedoresSpec(ctx: { tenantId: string; onDone?: () => void }): ImportSpec {
  return {
    entity: "fornecedores",
    title: "Importar fornecedores de uma planilha",
    hint: "Quem já existe (mesmo CNPJ, e-mail ou telefone) é pulado.",
    fields: [
      { key: "razao_social", label: "Razão social / Nome", required: true, aliases: ["razao social", "nome do fornecedor", "fornecedor", "nome", "empresa"] },
      { key: "cnpj", label: "CNPJ", kind: "digits", aliases: ["cnpj", "cpf", "documento"] },
      { key: "contato", label: "Pessoa de contato", aliases: ["contato", "responsavel", "vendedor"] },
      { key: "telefone", label: "Telefone / WhatsApp", kind: "phone", aliases: ["whatsapp", "telefone", "celular", "fone"] },
      F_EMAIL,
      { key: "prazo_entrega", label: "Prazo de entrega", aliases: ["prazo de entrega", "prazo"] },
      { key: "categorias", label: "Categorias", aliases: ["categorias", "categoria", "linha", "segmento"] },
    ],
    needOne: ["razao_social"],
    rowKeys: (v) => [docKey(v.cnpj), emailKey(v.email), ...phonesKeys(v, "telefone")].filter(Boolean),
    loadExistingKeys: (onProgress) => loadKeys("varejo_fornecedores", "cnpj, email, telefone", ctx.tenantId, (r) => [docKey(r.cnpj), emailKey(r.email), phoneKeyOf(r.telefone)], onProgress),
    build: (v) => ({ razao_social: v.razao_social, cnpj: v.cnpj || null, contato: v.contato || null, telefone: v.telefone || null, email: v.email || null, prazo_entrega: v.prazo_entrega || null, categorias: v.categorias || null, tenant_id: ctx.tenantId }),
    insertBatch: (rows) => insertInto("varejo_fornecedores", rows),
    template: [
      ["Razão social", "CNPJ", "Contato", "WhatsApp", "E-mail", "Categorias"],
      ["Distribuidora Alfa Ltda", "12345678000199", "Paulo", "(11) 99999-8888", "vendas@alfa.com", "Bebidas"],
      ["Beta Atacado", "", "", "21988887777", "", "Higiene"],
    ],
    onDone: ctx.onDone,
  };
}

// ─── Proprietários (Imobiliário) ─────────────────────────────────────────────

export function proprietariosSpec(ctx: { tenantId: string; onDone?: () => void }): ImportSpec {
  return {
    entity: "proprietarios",
    title: "Importar proprietários de uma planilha",
    hint: "Quem já existe (mesmo e-mail ou telefone) é pulado.",
    fields: [
      { key: "nome", label: "Nome", required: true, aliases: ["nome completo", "nome", "proprietario"] },
      { key: "telefone", label: "Telefone / WhatsApp", kind: "phone", aliases: ["whatsapp", "telefone", "celular", "fone"] },
      F_EMAIL,
      { key: "tipo", label: "Tipo", aliases: ["tipo", "pessoa"] },
    ],
    needOne: ["nome"],
    rowKeys: (v) => [emailKey(v.email), ...phonesKeys(v, "telefone")].filter(Boolean),
    loadExistingKeys: (onProgress) => loadKeys("imobiliario_proprietarios", "email, telefone", ctx.tenantId, (r) => [emailKey(r.email), phoneKeyOf(r.telefone)], onProgress),
    build: (v) => ({ nome: v.nome, telefone: v.telefone || null, email: v.email || null, tipo: v.tipo || "Pessoa Física", status: "Ativo", tenant_id: ctx.tenantId }),
    insertBatch: (rows) => insertInto("imobiliario_proprietarios", rows),
    template: [
      ["Nome", "WhatsApp", "E-mail", "Tipo"],
      ["Roberto Lima", "(11) 99999-8888", "roberto@email.com", "Pessoa Física"],
      ["Imobiliária Beta", "21988887777", "", "Pessoa Jurídica"],
    ],
    onDone: ctx.onDone,
  };
}
