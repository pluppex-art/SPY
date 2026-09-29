/**
 * Relatórios em PDF, gerados sob demanda para a Aurora (n8n) — motor GENÉRICO por entidade.
 *
 * Por que é genérico em vez de um endpoint por tipo: Gustavo pediu "de qualquer tipo que eu
 * pedir, ela faz" — em vez de crescer um arquivo novo por relatório, cada entidade é só uma
 * entrada em REPORT_ENTITIES (tabela, colunas, coluna de soma, campos filtráveis). Adicionar um
 * tipo novo depois é adicionar uma entrada aqui, não reescrever nada.
 *
 * Duas etapas, dois níveis de confiança diferentes (igual à Fase original, só que agora cobre
 * mais de uma entidade):
 *   POST /api/reports/financial-summary/link   — só o n8n chama isto (header x-internal-key).
 *                                                  Gera um link assinado e com validade curta.
 *   GET  /api/reports/financial-summary/:token.pdf — público, mas o token já embute
 *                                                  tenant_id + entidade + filtros + expiração;
 *                                                  sem o segredo do servidor não dá pra forjar
 *                                                  nem alterar um token válido.
 *
 * tenant_id nunca vem do corpo da chamada de download — só do token verificado. `entidade` e os
 * nomes de coluna usados nos filtros vêm SEMPRE de REPORT_ENTITIES (allowlist fixa no código,
 * nunca de texto livre do chamador) — isso evita que um campo/coluna arbitrário vaze de um jeito
 * que o allowlist não previu.
 */
import type { Express, RequestHandler } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface Deps {
  supabaseService: any;
  hasSupabaseService: boolean;
}

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30min — sobra pra alguém clicar no link numa conversa de WhatsApp
const DETAIL_LIMIT = 500; // acima disso, só resumo agregado (mesmo critério do PDF de Comparação de Tabelas)

type ColumnDef = { key: string; label: string; currency?: boolean; date?: boolean; map?: Record<string, string> };
type EntityDef = {
  table: string;
  title: string;
  columns: ColumnDef[];
  sumColumn?: string;
  sumSplitColumn?: string; // agrupa o resumo por este campo (ex: type: Pagar/Receber) em vez de um total único
  filterableExtra?: { param: string; column: string }[]; // filtro extra específico da entidade (além de status/data)
  dateColumn?: string;
  select: string; // colunas reais a pedir ao Supabase (sempre explícito, nunca "*")
};

const REPORT_ENTITIES: Record<string, EntityDef> = {
  financeiro: {
    table: "finance_entries",
    title: "Relatório Financeiro",
    select: "date_normalized,description,category,status,value,type,counterparty",
    columns: [
      { key: "date_normalized", label: "Data", date: true },
      { key: "description", label: "Descrição" },
      { key: "category", label: "Categoria" },
      { key: "type", label: "Tipo", map: { Pagar: "A Pagar", Receber: "A Receber" } },
      { key: "status", label: "Status", map: { Pago: "Pago", "A Vencer": "A Vencer", Atrasado: "Atrasado" } },
      { key: "value", label: "Valor", currency: true },
    ],
    sumColumn: "value",
    sumSplitColumn: "type",
    dateColumn: "date_normalized",
    filterableExtra: [{ param: "categoria", column: "category" }, { param: "tipo", column: "type" }],
  },
  leads: {
    table: "leads",
    title: "Relatório de Leads / Pipeline",
    select: "name,company,status,seller,source,value,created_at",
    columns: [
      { key: "name", label: "Nome" },
      { key: "company", label: "Empresa" },
      { key: "status", label: "Status" },
      { key: "seller", label: "Vendedor" },
      { key: "source", label: "Origem" },
      { key: "value", label: "Valor", currency: true },
      { key: "created_at", label: "Criado em", date: true },
    ],
    sumColumn: "value",
    dateColumn: "created_at",
    filterableExtra: [{ param: "vendedor", column: "seller" }, { param: "origem", column: "source" }],
  },
  tarefas: {
    table: "tasks",
    title: "Relatório de Tarefas",
    select: "title,status,priority,due_date,created_at",
    columns: [
      { key: "title", label: "Título" },
      { key: "status", label: "Status" },
      { key: "priority", label: "Prioridade" },
      { key: "due_date", label: "Prazo", date: true },
    ],
    dateColumn: "due_date",
    filterableExtra: [{ param: "prioridade", column: "priority" }],
  },
  contratos: {
    table: "contracts",
    title: "Relatório de Contratos",
    select: "title,status,value,mrr_value,start_date,end_date",
    columns: [
      { key: "title", label: "Título" },
      { key: "status", label: "Status" },
      { key: "value", label: "Valor", currency: true },
      { key: "mrr_value", label: "MRR", currency: true },
      { key: "start_date", label: "Início", date: true },
      { key: "end_date", label: "Fim", date: true },
    ],
    sumColumn: "value",
    dateColumn: "start_date",
  },
  propostas: {
    table: "proposals",
    title: "Relatório de Propostas",
    select: "titulo,cliente,vendedor,status,valor,validade,created_at",
    columns: [
      { key: "titulo", label: "Título" },
      { key: "cliente", label: "Cliente" },
      { key: "vendedor", label: "Vendedor" },
      { key: "status", label: "Status" },
      { key: "valor", label: "Valor", currency: true },
      { key: "validade", label: "Validade", date: true },
    ],
    sumColumn: "valor",
    dateColumn: "created_at",
    filterableExtra: [{ param: "vendedor", column: "vendedor" }],
  },
};

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}
function unb64url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}
function reportSecret(): string | null {
  return process.env.REPORT_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

interface ReportTokenPayload {
  t: string; // tenant_id
  e: string; // entidade (chave de REPORT_ENTITIES)
  st?: string; // status
  ex?: string; // filtro extra (coluna já resolvida via filterableExtra)
  exv?: string;
  di?: string; // data_inicio
  df?: string; // data_fim
  exp: number;
}

function signToken(payload: ReportTokenPayload, secret: string): string {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}
function verifyToken(token: string, secret: string): ReportTokenPayload | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64url(createHmac("sha256", secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: ReportTokenPayload;
  try {
    payload = JSON.parse(unb64url(body).toString("utf-8"));
  } catch {
    return null;
  }
  if (!payload?.t || !payload.e || !payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const brl = (v: unknown) => num(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function buildPdf(sb: any, payload: ReportTokenPayload): Promise<Buffer> {
  const entity = REPORT_ENTITIES[payload.e];
  if (!entity) throw new Error(`Tipo de relatório desconhecido: ${payload.e}`);

  const { data: tenantRow } = await sb.from("tenants").select("name").eq("id", payload.t).maybeSingle();
  const tenantNome = tenantRow?.name || "Empresa";

  let query = sb.from(entity.table).select(entity.select).eq("tenant_id", payload.t);
  if (payload.st) query = query.eq("status", payload.st);
  if (payload.ex && payload.exv) query = query.eq(payload.ex, payload.exv);
  if (entity.dateColumn) {
    if (payload.di) query = query.gte(entity.dateColumn, payload.di);
    if (payload.df) query = query.lte(entity.dateColumn, payload.df);
  }
  query = query.order(entity.dateColumn || entity.columns[0].key, { ascending: true });

  const { data: rows, error } = await query;
  if (error) throw new Error(`Falha ao consultar ${entity.table}: ${error.message}`);
  const entries = rows || [];

  const fmt = (col: ColumnDef, raw: unknown) => {
    if (raw === null || raw === undefined || raw === "") return "—";
    if (col.currency) return brl(raw);
    if (col.map) return col.map[String(raw)] || String(raw);
    return String(raw);
  };

  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(entity.title, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`${tenantNome} — emitido em ${new Date().toLocaleString("pt-BR")}`, 14, 25);
  const periodo = payload.di || payload.df ? `Período: ${payload.di || "início"} a ${payload.df || "hoje"}` : "Período: todos os registros";
  doc.text(periodo, 14, 30);
  doc.setTextColor(0);

  let startY = 36;
  if (entity.sumColumn) {
    if (entity.sumSplitColumn) {
      const groups = new Map<string, number>();
      for (const e of entries) {
        const k = String(e[entity.sumSplitColumn] ?? "—");
        groups.set(k, (groups.get(k) || 0) + num(e[entity.sumColumn]));
      }
      const cols = entity.columns.find((c) => c.key === entity.sumSplitColumn);
      const head = [...groups.keys()].map((k) => (cols?.map ? cols.map[k] || k : k));
      const totalA = [...groups.values()];
      const saldo = totalA.length === 2 ? totalA[1] - totalA[0] : null;
      autoTable(doc, {
        startY,
        head: [[...head, ...(saldo !== null ? ["Saldo"] : []), "Registros"]],
        body: [[...totalA.map(brl), ...(saldo !== null ? [brl(saldo)] : []), String(entries.length)]],
        theme: "grid",
        headStyles: { fillColor: [37, 99, 235] },
      });
    } else {
      const total = entries.reduce((s, e) => s + num(e[entity.sumColumn!]), 0);
      autoTable(doc, {
        startY,
        head: [["Total", "Registros"]],
        body: [[brl(total), String(entries.length)]],
        theme: "grid",
        headStyles: { fillColor: [37, 99, 235] },
      });
    }
    startY = (doc as any).lastAutoTable?.finalY + 8 || startY + 15;
  } else {
    autoTable(doc, { startY, head: [["Registros"]], body: [[String(entries.length)]], theme: "grid", headStyles: { fillColor: [37, 99, 235] } });
    startY = (doc as any).lastAutoTable?.finalY + 8 || startY + 15;
  }

  if (entries.length <= DETAIL_LIMIT) {
    autoTable(doc, {
      startY,
      head: [entity.columns.map((c) => c.label)],
      body: entries.map((e: any) => entity.columns.map((c) => fmt(c, e[c.key]))),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [55, 65, 81] },
    });
  } else {
    doc.setFontSize(9);
    doc.text(`${entries.length} registros no período — acima de ${DETAIL_LIMIT}, só o resumo acima é mostrado (peça um período menor para o detalhe completo).`, 14, startY);
  }

  return Buffer.from(doc.output("arraybuffer"));
}

export function registerFinancialReportRoutes(app: Express, deps: Deps) {
  const { supabaseService, hasSupabaseService } = deps;

  function requireInternalService(req: any, res: any, next: any) {
    const configured = process.env.N8N_INTERNAL_KEY || "";
    if (!configured) return res.status(503).json({ error: "N8N_INTERNAL_KEY não configurada no servidor." });
    const key = (req.headers["x-internal-key"] as string) || "";
    const a = Buffer.from(key);
    const b = Buffer.from(configured);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).json({ error: "Chave interna inválida ou ausente." });
    next();
  }

  app.post("/api/reports/financial-summary/link", requireInternalService, async (req, res) => {
    try {
      const secret = reportSecret();
      if (!secret) return res.status(503).json({ error: "REPORT_LINK_SECRET (ou SUPABASE_SERVICE_ROLE_KEY) não configurada." });
      const { tenant_id, entidade, status, campo_extra, valor_extra, data_inicio, data_fim } = req.body || {};
      if (!tenant_id || typeof tenant_id !== "string") return res.status(400).json({ error: "tenant_id é obrigatório." });
      const entityKey = typeof entidade === "string" && entidade.trim() ? entidade.trim() : "financeiro";
      const entity = REPORT_ENTITIES[entityKey];
      if (!entity) {
        return res.status(400).json({ error: `Tipo de relatório desconhecido: "${entityKey}". Tipos disponíveis: ${Object.keys(REPORT_ENTITIES).join(", ")}.` });
      }

      let extraCol: string | undefined;
      if (typeof campo_extra === "string" && campo_extra.trim() && typeof valor_extra === "string" && valor_extra.trim()) {
        const match = entity.filterableExtra?.find((f) => f.param === campo_extra.trim());
        if (match) extraCol = match.column;
      }

      const payload: ReportTokenPayload = {
        t: tenant_id,
        e: entityKey,
        st: typeof status === "string" && status.trim() ? status.trim().slice(0, 40) : undefined,
        ex: extraCol,
        exv: extraCol ? String(valor_extra).slice(0, 80) : undefined,
        di: typeof data_inicio === "string" ? data_inicio.slice(0, 10) : undefined,
        df: typeof data_fim === "string" ? data_fim.slice(0, 10) : undefined,
        exp: Date.now() + TOKEN_TTL_MS,
      };
      const token = signToken(payload, secret);
      const base = (process.env.PUBLIC_APP_URL || "http://localhost:3002").replace(/\/+$/, "");
      res.json({ ok: true, url: `${base}/api/reports/financial-summary/${token}.pdf`, expires_in_minutes: TOKEN_TTL_MS / 60000 });
    } catch (err: any) {
      console.error("[report link]", err?.message);
      res.status(500).json({ error: "Falha ao gerar o link do relatório." });
    }
  });

  app.get("/api/reports/financial-summary/:token.pdf", async (req, res) => {
    try {
      if (!hasSupabaseService) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." });
      const secret = reportSecret();
      if (!secret) return res.status(503).json({ error: "REPORT_LINK_SECRET não configurada." });
      const payload = verifyToken(req.params.token, secret);
      if (!payload) return res.status(410).json({ error: "Link inválido ou expirado. Peça para a Aurora gerar um novo." });

      const pdf = await buildPdf(supabaseService, payload);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="relatorio.pdf"`);
      res.send(pdf);
    } catch (err: any) {
      console.error("[report download]", err?.message);
      res.status(500).json({ error: "Falha ao gerar o PDF." });
    }
  });
}
