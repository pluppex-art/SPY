// Carrega .env/.env.local pro process.env — nada fazia isso antes (dotenv era dependência mas
// nunca era importado), então qualquer variável só-arquivo (ex: AURORA_WEBHOOK_URL) sempre esteve
// vazia em dev local. Em produção (Vercel) isso é um no-op inofensivo, já que as variáveis já
// chegam injetadas de verdade no processo.
import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, timingSafeEqual } from "crypto";
import axios from "axios";
import { createGoogleCalendarRouter } from "./server/googleCalendar.js";
import { getWhatsAppProvider, getActiveProviderName, isWahaConfigured } from "./server/whatsappProvider.js";
import { cacheGet, cacheSet, redisHealthCheck } from "./server/redisClient.js";
import { assertSafeHttpUrl, assertSafeSmtpTarget } from "./server/ssrfGuard.js";
import { readTenantSnapshot } from "./server/implementationSync.js";
import { registerTableComparisonRoutes } from "./server/tableComparison.js";
import { registerKommoRoutes } from "./server/kommoSync.js";
import { buildEmpresaDados, tenantReadiness } from "./src/lib/implementationTenant.js";
import { registerTableComparisonExportRoutes } from "./server/tableComparisonExport.js";
import { registerTableComparisonResearchRoutes } from "./server/tableComparisonResearch.js";
import { makeN8nAiJson } from "./server/tableComparisonN8n.js";
import { registerFinancialReportRoutes } from "./server/financialReportPdf.js";
import { registerMessageTriggerRoutes } from "./server/messageTriggers.js";
import { registerAgentFlowRoutes } from "./server/agentFlow.js";
import { connFromConfig as maxConnFromConfig, maxdataAuth, maxdataGet, MaxDataError } from "./server/maxdataClient.js";
import { extractDocs as maxExtractDocs, mapMaxEntryToNota, type MaxEntry, type MaxEntryItem } from "./src/lib/maxdataEntry.js";
import { findProductForItem, defaultQtdEstoque } from "./src/lib/notaEntrada.js";
import {
  INTEGRATION_DEFS, INTEGRATION_SETTING_KEYS, getIntegrationDef as implGetIntegrationDef, maskedView as implMaskedView,
  validateIntegrationValues as implValidateIntegrationValues, applyIntegrationUpdate as implApplyIntegrationUpdate,
} from "./src/lib/tenantIntegrations.js";
import {
  allFields as implAllFields, applyPatch as implApplyPatch, computeProgress as implComputeProgress,
  findField as implFindField, pendingFields as implPendingFields, sanitizePatch as implSanitizePatch,
  coerceFieldValue as implCoerceFieldValue, applyTenantSnapshot as implApplyTenantSnapshot, IMPLEMENTATION_SECTIONS,
} from "./src/lib/implementationForm.js";
import nodemailer from "nodemailer";

// ── Types ──────────────────────────────────────────────────────────────────

// ── In-Memory State ────────────────────────────────────────────────────────
//
// Contatos/mensagens de WhatsApp NÃO vivem mais em memória — persistem de
// verdade em chat_contacts/chat_messages (RLS por tenant), populadas pelo
// webhook real do WAHA (ver POST /api/whatsapp/webhook/:instanceId). O
// simulador em memória que existia aqui (contactsByTenant/messagesByTenant)
// foi removido — ver SECURITY_AUDIT.md item A9/A10 pro histórico do problema
// que isso resolveu (tabelas não existiam, estado se perdia a cada
// redeploy/reciclagem de instância serverless).
//
// Instâncias de WhatsApp também não vivem em memória — ver
// server/whatsappProvider.ts + rotas /api/whatsapp/instances abaixo, que
// persistem de verdade na tabela whatsapp_instances (RLS por tenant).

// Fallback in-memory de /api/settings/:category para quando não há tabela
// crm_<categoria> no banco (sources/custom-fields/task-categories/templates
// nunca tiveram tabela própria). Isolado por tenant abaixo — antes disso eram
// arrays únicos no processo, então tenant A criando um campo customizado
// aparecia instantaneamente pra tenant B (todo mundo lia/escrevia o mesmo
// array). Cada tenant recebe sua própria cópia, semeada a partir do exemplo
// padrão na primeira vez que é acessado.
const DEFAULT_SOURCES = [
  { id: "1", name: "Instagram" },
  { id: "2", name: "WhatsApp" },
  { id: "3", name: "Indicação" },
  { id: "4", name: "Site" },
  { id: "5", name: "Google Ads" }
];
const DEFAULT_CUSTOM_FIELDS = [
  { id: "1", label: "CPF/CNPJ", type: "text", required: true },
  { id: "2", label: "Setor", type: "select", options: ["Varejo", "Serviços", "Indústria"] }
];
const DEFAULT_TASK_CATEGORIES = [
  { id: "1", name: "Follow-up", color: "bg-blue-500" },
  { id: "2", name: "Reunião", color: "purple" },
  { id: "3", name: "Proposta", color: "emerald" }
];
const DEFAULT_TEMPLATES = [
  { id: "1", name: "Saudação Inicial", content: "Olá {{name}}, como posso ajudar?", category: "Vendas" }
];

const sourcesByTenant: Record<string, any[]> = {};
const customFieldsByTenant: Record<string, any[]> = {};
const taskCategoriesByTenant: Record<string, any[]> = {};
const templatesByTenant: Record<string, any[]> = {};

function tenantBucket<T>(store: Record<string, T[]>, tenantId: string, seed: T[]): T[] {
  if (!store[tenantId]) store[tenantId] = structuredClone(seed);
  return store[tenantId];
}

// ── Singletons ─────────────────────────────────────────────────────────────

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || "";

// createClient lança de forma síncrona se a URL vier malformada (espaço extra,
// protocolo faltando etc.) — sem o try/catch, isso derruba o módulo inteiro no
// carregamento e TODA rota da API vira FUNCTION_INVOCATION_FAILED no Vercel, não
// só as que usam Supabase. Preferimos degradar para null (rotas já checam
// `if (!supabase)`) a derrubar o servidor inteiro por uma env var ruim.
function safeCreateClient(url: string, key: string) {
  if (!url || !key) return null;
  try {
    return createClient(url, key);
  } catch (err: any) {
    console.error("[Supabase] Falha ao criar client:", err?.message);
    return null;
  }
}

const supabase = safeCreateClient(supabaseUrl, supabaseKey);

// Client privilegiado (bypassa RLS). Usado por:
// - /api/v1/leads: chamada por integrações externas (não por usuário logado),
//   sem JWT de sessão pra respeitar RLS normalmente — tenant_id vem só do
//   mapeamento de API key (apiKeyTenantMap), nunca do corpo da requisição.
// - /api/google-calendar/*: google_calendar_connections não dá NENHUM grant
//   direto a anon/authenticated (só SELECT de colunas não-sensíveis, sem
//   token) — só este client grava/lê tokens, e só depois que a rota já
//   validou tenant_id (current_tenant_id()/has_tenant_access(), nunca vindo
//   direto do corpo da requisição) e user_id (req.user.id, do JWT validado
//   por requireUser). Ver server/googleCalendar.ts.
// Em ambos os casos, o isolamento por tenant é mantido pela rota, não pelo
// client — só use supabaseService atrás de uma validação de tenant explícita.
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseService = safeCreateClient(supabaseUrl, supabaseServiceKey);

let ai: GoogleGenAI;
try {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "dummy_key_to_prevent_crash_at_load_time",
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
} catch (err: any) {
  console.error("[GoogleGenAI] Falha ao inicializar:", err?.message);
  ai = new GoogleGenAI({ apiKey: "dummy_key_to_prevent_crash_at_load_time" });
}

// Formato: "chave1:tenantIdA,chave2:tenantIdB" — cada API key é vinculada a
// exatamente um tenant. Uma chave nunca pode ler/gravar leads de outro tenant,
// mesmo que o chamador informe um tenantId diferente no corpo da requisição.
// Entradas malformadas (sem ":tenantId") são ignoradas — mas agora avisadas no
// log de startup em vez de falharem silenciosamente como um 503 sem explicação.
const rawApiKeyPairs = (process.env.SPY_API_KEYS || process.env.AXIS_API_KEYS || "")
  .split(",")
  .map((pair) => pair.trim())
  .filter(Boolean);
const apiKeyTenantMap = new Map<string, string>();
for (const pair of rawApiKeyPairs) {
  const [key, tenantId] = pair.split(":").map((s) => s.trim());
  if (key && tenantId) {
    apiKeyTenantMap.set(key, tenantId);
  } else {
    console.warn(`[API Keys] Entrada malformada ignorada (esperado "chave:tenantId"): "${pair.slice(0, 8)}..."`);
  }
}
console.log(`[API Keys] ${apiKeyTenantMap.size} chave(s) válida(s) carregada(s) para /api/v1/leads.`);

const FORM_CLIENT_ID = process.env.SPY_FORM_CLIENT_ID || process.env.AXIS_FORM_CLIENT_ID || "";

// ── AI Helpers: Gemini → Groq fallback ────────────────────────────────────

async function callGroq(prompt: string): Promise<string> {
  const key = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY não configurada.");
  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 1500,
    },
    {
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      timeout: 20000,
    }
  );
  return (res.data.choices?.[0]?.message?.content ?? "") as string;
}

async function callGemini(prompt: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: prompt,
  });
  let text = "";
  try {
    text = (typeof response.text === "function"
      ? (response as any).text()
      : response.text ?? "") as string;
  } catch {
    text = (response as any)?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }
  return text;
}

// Tenta Gemini; se falhar, usa Groq automaticamente
async function generateAI(prompt: string): Promise<string> {
  if (process.env.GEMINI_API_KEY) {
    try {
      const text = await callGemini(prompt);
      if (text.trim()) return text;
      throw new Error("Gemini retornou vazio.");
    } catch (err) {
      console.warn("[AI] Gemini falhou, usando Groq:", (err as any)?.message?.slice(0, 100));
    }
  }
  return callGroq(prompt);
}

// Extrai JSON de respostas que podem ter markdown ou texto extra
function extractJSON(raw: string): any {
  let text = raw.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Sem JSON válido na resposta: " + text.slice(0, 200));
  return JSON.parse(text.slice(start, end + 1));
}

// Valor interpolado em filtro .or() do PostgREST: vírgula, parênteses, aspas e curingas
// alteram a sintaxe do filtro (injeção de filtro). O nome vem de argumento de tool de IA,
// ou seja, controlável por prompt — remove tudo que não é texto comum.
function pgrstSafe(v: string): string {
  return v.replace(/[,()*%\\"'`:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

// ── Express App ────────────────────────────────────────────────────────────

const app = express();

// Express 4 não captura rejeição de handler async: repassa ao handler global de erro.
for (const m of ["get", "post", "put", "patch", "delete"] as const) {
  const orig = (app as any)[m].bind(app);
  (app as any)[m] = (path: any, ...handlers: any[]) => {
    if (m === "get" && handlers.length === 0) return orig(path); // app.get(setting)
    return orig(path, ...handlers.map((h) =>
      typeof h === "function" && h.length < 4
        ? (req: any, res: any, next: any) => Promise.resolve(h(req, res, next)).catch(next)
        : h));
  };
}
app.set("trust proxy", 1);

// Vercel pre-parses the body before passing to Express — skip json() if already parsed
app.use((req: any, res, next) => {
  if (req.body !== undefined) return next();
  express.json({ limit: "5mb" })(req, res, next);
});

// SPY_CORS_ORIGIN: lista separada por vírgula (ex.: "https://axis-crm.pluppex.com.br,http://localhost:5173").
// Antes era "*" por padrão — qualquer site podia ler resposta de rotas autenticadas
// (Authorization: Bearer) se conseguisse um token válido por outro caminho (XSS em
// outro lugar, extensão maliciosa). Sem SPY_CORS_ORIGIN configurada, não reflete
// nenhuma origem (mais seguro que abrir geral por omissão). Fallback pro nome antigo
// AXIS_CORS_ORIGIN — produção na Vercel ainda só tem a variável antiga configurada.
const allowedOrigins = (process.env.SPY_CORS_ORIGIN || process.env.AXIS_CORS_ORIGIN || "https://axis-crm.pluppex.com.br").split(",").map(o => o.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || allowedOrigins.includes("*"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, Authorization, x-active-tenant-id");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Rate limiting — nada disso existia antes. Cobre: a API pública por chave (contra
// força-bruta de x-api-key e abuso volumétrico), as rotas de IA (custo real por
// chamada a Gemini/Groq) e o simulador de WhatsApp. Login/cadastro/reset de senha
// não passam por aqui — dependem do rate limit nativo do próprio Supabase Auth.
// keyGenerator por x-api-key (não por IP): sem isso, duas integrações reais de
// tenants diferentes atrás do mesmo IP de saída (ex.: mesma hospedagem/proxy)
// dividiriam uma única cota de 60/min. Cai pro IP só quando não há chave no
// header (requisição que vai ser rejeitada como 401 de qualquer forma).
const apiKeyLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.headers["x-api-key"] as string | undefined) || req.ip || "unknown",
});
const aiLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
const whatsappLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
const googleCalendarLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
// Mais restritivo que os demais — endpoint sem autenticação nenhuma (formulário
// público do site de marketing), maior risco de abuso/spam automatizado.
const publicLeadLimiter = rateLimit({ windowMs: 60_000, limit: 5, standardHeaders: true, legacyHeaders: false });
// Endpoints públicos sem auth: enumeração de tenant e aceite de proposta.
const publicProposalLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
const tenantThemeLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
const publicImplementationLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
app.use("/api/public-proposal", publicProposalLimiter);
app.use("/api/public-implementation", publicImplementationLimiter);
const maxdataLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
app.use("/api/integrations/maxdata", maxdataLimiter);
app.use("/api/varejo/maxdata", maxdataLimiter);
const tableComparisonLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
registerTableComparisonRoutes(app, {
  requireUser, resolveRequestedTenantId, limiter: tableComparisonLimiter,
  // A IA (Aurora) roda no n8n (workflow "Comparação de Tabelas - Analisar Itens (IA)"): prompts, modelo,
  // limitador de tokens e consumo ficam lá. Sem TABLE_COMPARISON_AI_WEBHOOK_URL a rota da Aurora responde 503.
  aiJson: makeN8nAiJson(),
});
// Resultado estruturado + exportações (Excel/PDF) — só leitura; o limiter acima já cobre este prefixo.
registerTableComparisonExportRoutes(app, { requireUser, resolveRequestedTenantId });
// Pesquisa externa (web) da Aurora para itens não identificados — a busca roda no n8n; só gera sugestões p/ revisão.
registerTableComparisonResearchRoutes(app, { requireUser, resolveRequestedTenantId });
// Relatório financeiro em PDF sob demanda (Aurora/n8n) — ver server/financialReportPdf.ts.
registerFinancialReportRoutes(app, { supabaseService, hasSupabaseService: Boolean(supabaseServiceKey) });
// Gatilhos de mensagem em linguagem natural (interpretação + execução rodam no n8n/Júlia) — ver server/messageTriggers.ts.
registerMessageTriggerRoutes(app, { requireUser });
// "Ver fluxo" ao vivo — busca o workflow real na instância n8n (n8n Public API) sob demanda,
// com fallback automático pro snapshot estático no frontend. Ver server/agentFlow.ts.
registerAgentFlowRoutes(app, { requireUser });
app.use("/api/auth/tenant-theme", tenantThemeLimiter);
app.use("/api/v1/leads", apiKeyLimiter);
app.use("/api/v1/lead-activities", apiKeyLimiter);
app.use("/api/v1/finance-entries", apiKeyLimiter);
app.use("/api/leads", aiLimiter);
app.use("/api/ai", aiLimiter);
app.use("/api/whatsapp", whatsappLimiter);
app.use("/api/google-calendar", googleCalendarLimiter);
app.use("/api/public/lead-capture", publicLeadLimiter);

function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (apiKeyTenantMap.size === 0) {
    logApiKeyUsage(req, 503);
    return res.status(503).json({ error: "Nenhuma API Key configurada. Defina SPY_API_KEYS no formato chave:tenantId no .env." });
  }
  const key = req.headers["x-api-key"] as string | undefined;
  const tenantId = key ? apiKeyTenantMap.get(key) : undefined;
  if (!key || !tenantId) {
    // tenantId ainda não existe no req aqui — logApiKeyUsage grava tenant_id
    // null neste caso (tentativa com chave inválida/ausente, não atribuível
    // a nenhum tenant real).
    logApiKeyUsage(req, 401);
    return res.status(401).json({ error: "API Key inválida ou ausente." });
  }
  (req as any).tenantId = tenantId;
  next();
}

/**
 * Exige uma sessão real do Supabase Auth (JWT no header Authorization).
 * Anexa req.user (usuário autenticado) e req.supabase (client escopado com o
 * token do chamador, para que toda query subsequente respeite a RLS por
 * tenant automaticamente, sem precisar filtrar tenant_id manualmente na rota).
 */
async function requireUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    if (!supabase) return res.status(503).json({ error: "Banco de dados não configurado no servidor." });

    const authHeader = req.headers["authorization"] as string | undefined;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (!token) return res.status(401).json({ error: "Autenticação obrigatória." });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: "Sessão inválida ou expirada." });

    (req as any).user = data.user;
    (req as any).supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    next();
  } catch (err: any) {
    console.error("[requireUser]", err?.message);
    res.status(500).json({ error: "Erro ao validar autenticação." });
  }
}

// Status do Redis-SPY (ping + latência). Não expõe dado de tenant nenhum,
// só topologia/saúde de infra — mesmo nível de sensibilidade de um /healthz
// comum, por isso fica sem autenticação.
app.get("/api/health/redis", async (_req, res) => {
  const status = await redisHealthCheck();
  res.json(status);
});


/**
 * Resumo agregado do dashboard executivo (mesmas 4 métricas "hero" de
 * src/lib/revenueMetrics.ts + useDashboard.ts: receita recorrente,
 * conversão, leads ativos, churn), com cache-aside no Redis-SPY (TTL curto
 * — são agregados, não precisam ser em tempo real). Se o Redis estiver fora
 * do ar, cacheGet/cacheSet apenas não fazem nada (ver server/redisClient.ts)
 * e a rota calcula direto no Supabase — sem essa rota quebrar.
 *
 * Tenant: aceita `?tenantId=` opcional (o `activeTenantId` do
 * AuthContext.tsx no frontend — necessário pra contas master/parceiro, que
 * trocam de "empresa visualizada" sem que isso mude a própria linha do
 * usuário em `users`; sem isso, o resumo de um master sempre voltava os
 * dados do tenant "de casa" dele, nunca o tenant que ele selecionou na tela).
 * NUNCA aceito às cegas: sempre revalidado no servidor via has_tenant_access
 * (a mesma função usada pela RLS), então um tenantId que o usuário não tem
 * acesso retorna 403 — nunca dado de outro tenant. Sem o parâmetro, cai pro
 * tenant do próprio usuário (comportamento anterior, ainda correto pro caso
 * comum sem troca de tenant).
 *
 * Só as 4 métricas "hero" (número grande no topo) — performanceData
 * (tendência de 7 meses), salesRanking (fallback lead→produto→proposta) e
 * funnelData (depende da configuração dinâmica de funil por tenant) ficam
 * de fora de propósito: replicar a lógica deles no servidor tem risco real
 * de divergir sutilmente do cálculo no cliente; continuam calculados lá,
 * sem mudança nesta rodada.
 */
/**
 * Resolve qual tenant um endpoint de resumo/KPI cacheado deve usar: o do
 * próprio usuário por padrão, ou um `?tenantId=` explícito (necessário pra
 * contas master/parceiro trocando de "empresa visualizada", ver
 * AuthContext.tsx switchTenant()) — sempre revalidado no servidor via
 * has_tenant_access (mesma função usada pela RLS) antes de aceitar. Retorna
 * `null` e já responde 403 se a checagem falhar; o chamador deve checar
 * `if (!tenantId) return;` logo em seguida.
 */
async function resolveRequestedTenantId(req: any, res: any): Promise<string | null> {
  const { data: caller, error: callerError } = await req.supabase
    .from("users").select("tenant_id").eq("id", req.user.id).maybeSingle();
  if (callerError || !caller?.tenant_id) {
    res.status(403).json({ error: "Não foi possível identificar o tenant do usuário." });
    return null;
  }
  const requestedTenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : null;
  if (!requestedTenantId || requestedTenantId === caller.tenant_id) {
    return caller.tenant_id as string;
  }
  const { data: allowed, error: accessError } = await req.supabase
    .rpc("has_tenant_access", { target_tenant_id: requestedTenantId });
  if (accessError || !allowed) {
    res.status(403).json({ error: "Sem acesso a este tenant." });
    return null;
  }
  return requestedTenantId;
}

// PostgREST (Supabase) limita cada resposta a um teto de linhas configurado
// no projeto (db-max-rows), independente de qualquer `.limit()` maior pedido
// pelo cliente — silencioso, sem erro, só devolve menos linhas que o real.
// Confirmado ao vivo: "Leads Ativos" no dashboard mostrava 1000 pra um
// tenant com 4.373 leads. Todo endpoint que precisa de um TOTAL EXATO
// (soma/contagem sobre todas as linhas, não uma prévia) usa isso em vez de
// um único `.select()` sem `.range()`. As prévias cacheadas (GET
// /api/crm/leads-list e afins) são a exceção de propósito — já são
// aproximações com cap explícito, não precisam de exatidão.
const SERVER_PAGE_SIZE = 1000;
async function fetchAllRowsPaginated(
  sb: any,
  table: string,
  columns: string,
  applyFilters: (query: any) => any,
): Promise<any[]> {
  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await applyFilters(sb.from(table).select(columns)).range(from, from + SERVER_PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < SERVER_PAGE_SIZE) break;
    from += SERVER_PAGE_SIZE;
  }
  return all;
}

app.get("/api/dashboard/summary", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const cacheKey = `dashboard:tenant:${tenantId}:summary`;

    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const sb = req.supabase;

    // Leads: uma busca só (status, value, scoreIA) cobre conversão/ativos
    // (getConversionRate/getActiveLeadsCount em src/lib/revenueMetrics.ts)
    // + pipeline em aberto/leads quentes (StrategicalView.tsx). Paginada de
    // verdade — sem isso, o PostgREST trunca silenciosamente em 1000 linhas.
    const leadsAll = await fetchAllRowsPaginated(sb, "leads", 'status,value,"scoreIA"', (q) => q.eq("tenant_id", tenantId)) as { status: string; value: number | null; scoreIA: number | null }[];
    const leadsTotal = leadsAll.length;
    const leadsWon = leadsAll.filter((l) => l.status === "Fechado").length;
    const leadsOpenRows = leadsAll.filter((l) => l.status !== "Fechado" && l.status !== "Perdido");
    const conversionRate = leadsTotal > 0 ? Math.round((leadsWon / leadsTotal) * 1000) / 10 : 0;
    // "Ativo" = não perdido (Fechado conta como ativo — cliente convertido).
    // Igual a src/lib/revenueMetrics.ts:getActiveLeadsCount — diferente de
    // leadsOpenRows, que segue excluindo Fechado pro valor de pipeline em
    // aberto/leads quentes abaixo (esses continuam sendo "ainda não fechados").
    const activeLeadsCount = leadsAll.filter((l) => l.status !== "Perdido").length;
    const valorPipelineAberto = leadsOpenRows.reduce((s, l) => s + (Number(l.value) || 0), 0);
    const leadsQuentes = leadsOpenRows.filter((l) => (l.scoreIA ?? 0) > 80).length;

    // Contratos: mrr_value já é numeric de verdade (sem parsing de texto
    // tipo parseCurrencyBR) — soma direta dos não cancelados/perdidos,
    // mesma regra de getMRR(). Reaproveitado pra MRR ativo/em risco e taxa
    // de inadimplência (CustomerSuccessView.tsx/StrategicalView.tsx — a
    // mesma métrica "taxaInadimplencia"/"taxaRisco" nos dois arquivos).
    const contracts = await fetchAllRowsPaginated(sb, "contracts", "mrr_value,status", (q) => q.eq("tenant_id", tenantId)) as { mrr_value: number | null; status: string }[];
    const totalRevenue = contracts
      .filter((c) => c.status !== "Cancelado" && c.status !== "Perdido")
      .reduce((sum, c) => sum + (Number(c.mrr_value) || 0), 0);
    const contractsAtivos = contracts.filter((c) => c.status === "Ativo");
    const contractsEmRisco = contracts.filter((c) => c.status === "Inadimplente");
    const mrrEmRisco = contractsEmRisco.reduce((s, c) => s + (Number(c.mrr_value) || 0), 0);
    const taxaInadimplencia = contracts.length > 0 ? Math.round((contractsEmRisco.length / contracts.length) * 1000) / 10 : 0;

    // Churn: mesma regra condicional de useDashboard.ts — tenant com agenda
    // (appointments) usa churn por paciente (sem visita nos últimos 90 dias);
    // senão, cai pra contratos cancelados/total.
    const { count: appointmentsCount } = await sb.from("appointments")
      .select("*", { count: "exact", head: true }).eq("tenant_id", tenantId);

    let churnRate = 0;
    if ((appointmentsCount ?? 0) > 0) {
      const apptRows = await fetchAllRowsPaginated(sb, "appointments", "patient,date", (q) => q.eq("tenant_id", tenantId));
      const lastVisitByPatient = new Map<string, string>();
      for (const a of (apptRows || []) as { patient: string | null; date: string | null }[]) {
        if (!a.patient || !a.date) continue;
        const prev = lastVisitByPatient.get(a.patient);
        if (!prev || a.date > prev) lastVisitByPatient.set(a.patient, a.date);
      }
      const totalPatients = lastVisitByPatient.size;
      if (totalPatients > 0) {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const cutoff = ninetyDaysAgo.toISOString().slice(0, 10);
        let churned = 0;
        for (const lastVisit of lastVisitByPatient.values()) {
          if (lastVisit < cutoff) churned++;
        }
        churnRate = Math.round((churned / totalPatients) * 1000) / 10;
      }
    } else {
      const totalContracts = contracts.length;
      const cancelledContracts = contracts.filter((c) => c.status === "Cancelado").length;
      churnRate = totalContracts > 0 ? Math.round((cancelledContracts / totalContracts) * 1000) / 10 : 0;
    }

    const summary = {
      totalRevenue, conversionRate, activeLeadsCount, churnRate,
      valorPipelineAberto, leadsQuentes,
      mrrAtivo: totalRevenue, mrrEmRisco, taxaInadimplencia,
      contractsAtivosCount: contractsAtivos.length, contractsEmRiscoCount: contractsEmRisco.length, contractsTotalCount: contracts.length,
      cachedAt: new Date().toISOString(),
    };

    await cacheSet(cacheKey, summary, 60);
    res.setHeader("X-Cache", "MISS");
    return res.json(summary);
  } catch (err: any) {
    console.error("[dashboard/summary]", err?.message);
    return res.status(500).json({ error: "Erro ao calcular resumo do dashboard." });
  }
});

/**
 * Resumo cacheado da Visão Geral do Financeiro (src/pages/finance/FinanceiroVisaoGeral.tsx)
 * — os cards do topo + resumo de alertas. Mesma resolução/validação de
 * tenant de /api/dashboard/summary (aceita ?tenantId=, revalidado via
 * has_tenant_access). Usa `date_normalized` (coluna gerada — ver
 * supabase/migrations/20260920_finance_entries_date_normalized.sql) em vez
 * de reimplementar o parsing de data dupla-formato no servidor.
 *
 * Deixados de fora de propósito (ficam só no cliente): "Saldo em Contas"
 * (depende de src/pages/finance/lib/financeEngine.ts — saldo corrente por
 * conta bancária, incl. transferências, lógica não trivial o bastante pra
 * arriscar divergência), Previsto×Realizado, Comparativo com mês anterior
 * e gráfico de fluxo de caixa (mesmo motivo) — nenhum desses é recalculado
 * aqui, todos continuam vindo do financeEngine.ts no navegador.
 */
app.get("/api/finance/visao-geral-summary", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const cacheKey = `finance-visao-geral:tenant:${tenantId}:summary`;

    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const sb = req.supabase;
    const [entries, contracts] = await Promise.all([
      fetchAllRowsPaginated(sb, "finance_entries", "type,status,value,date_normalized,category", (q) => q.eq("tenant_id", tenantId)) as Promise<{ type: string; status: string; value: number; date_normalized: string | null; category: string | null }[]>,
      fetchAllRowsPaginated(sb, "contracts", "mrr_value,status", (q) => q.eq("tenant_id", tenantId)) as Promise<{ mrr_value: number | null; status: string }[]>,
    ]);

    const sum = (rows: typeof entries) => rows.reduce((s, f) => s + (Number(f.value) || 0), 0);

    const pad = (n: number) => String(n).padStart(2, "0");
    const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const now = new Date();
    const todayIso = isoDate(now);
    const curMonthPrefix = todayIso.slice(0, 7);
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthPrefix = isoDate(prevMonthDate).slice(0, 7);
    const next3Iso = isoDate(new Date(now.getTime() + 3 * 86400000));
    const next7Iso = isoDate(new Date(now.getTime() + 7 * 86400000));
    const next30Iso = isoDate(new Date(now.getTime() + 30 * 86400000));
    const inMonth = (d: string | null, prefix: string) => !!d && d.startsWith(prefix);
    const inRange = (d: string | null, from: string, to: string) => !!d && d >= from && d <= to;

    const receitaMes = sum(entries.filter(f => f.type === "Receber" && f.status === "Pago" && inMonth(f.date_normalized, curMonthPrefix)));
    const receitaMesAnt = sum(entries.filter(f => f.type === "Receber" && f.status === "Pago" && inMonth(f.date_normalized, prevMonthPrefix)));
    const despesaMes = sum(entries.filter(f => f.type === "Pagar" && f.status === "Pago" && inMonth(f.date_normalized, curMonthPrefix)));
    const despesaMesAnt = sum(entries.filter(f => f.type === "Pagar" && f.status === "Pago" && inMonth(f.date_normalized, prevMonthPrefix)));

    const abertoReceber = entries.filter(f => f.type === "Receber" && (f.status === "A Vencer" || f.status === "Atrasado"));
    const abertoPagar = entries.filter(f => f.type === "Pagar" && (f.status === "A Vencer" || f.status === "Atrasado"));
    const vencidoReceber = entries.filter(f => f.type === "Receber" && f.status === "Atrasado");
    const vencidoPagar = entries.filter(f => f.type === "Pagar" && f.status === "Atrasado");

    const previstoReceber30 = sum(entries.filter(f => f.type === "Receber" && f.status === "A Vencer" && inRange(f.date_normalized, todayIso, next30Iso)));
    const previstoPagar30 = sum(entries.filter(f => f.type === "Pagar" && f.status === "A Vencer" && inRange(f.date_normalized, todayIso, next30Iso)));

    const mrrAtual = contracts
      .filter(c => c.status !== "Cancelado" && c.status !== "Perdido")
      .reduce((s, c) => s + (Number(c.mrr_value) || 0), 0);

    const hojeEntradas = sum(entries.filter(f => f.type === "Receber" && f.status === "Pago" && f.date_normalized === todayIso));
    const hojeSaidas = sum(entries.filter(f => f.type === "Pagar" && f.status === "Pago" && f.date_normalized === todayIso));
    const aReceber7 = sum(entries.filter(f => f.type === "Receber" && f.status === "A Vencer" && inRange(f.date_normalized, todayIso, next7Iso)));
    const aPagar7 = sum(entries.filter(f => f.type === "Pagar" && f.status === "A Vencer" && inRange(f.date_normalized, todayIso, next7Iso)));
    const vencendoEm3 = entries.filter(f => f.status === "A Vencer" && inRange(f.date_normalized, todayIso, next3Iso));

    const summary = {
      kpis: {
        receitaMes, receitaMesAnt, despesaMes, despesaMesAnt,
        resultadoMes: receitaMes - despesaMes, resultadoMesAnt: receitaMesAnt - despesaMesAnt,
        mrrAtual,
        abertoReceber: { value: sum(abertoReceber), count: abertoReceber.length },
        abertoPagar: { value: sum(abertoPagar), count: abertoPagar.length },
        vencidoReceber: { value: sum(vencidoReceber), count: vencidoReceber.length },
        previstoReceber30, previstoPagar30, fluxoProjetado30: previstoReceber30 - previstoPagar30,
      },
      alertas: {
        hoje: { entradas: hojeEntradas, saidas: hojeSaidas },
        proximos7: { aReceber: aReceber7, aPagar: aPagar7 },
        vencidasPagar: { value: sum(vencidoPagar), count: vencidoPagar.length },
        vencidasReceber: { value: sum(vencidoReceber), count: vencidoReceber.length },
        vencendoEm3: { value: sum(vencendoEm3), count: vencendoEm3.length },
      },
      cachedAt: new Date().toISOString(),
    };

    await cacheSet(cacheKey, summary, 60);
    res.setHeader("X-Cache", "MISS");
    return res.json(summary);
  } catch (err: any) {
    console.error("[finance/visao-geral-summary]", err?.message);
    return res.status(500).json({ error: "Erro ao calcular resumo financeiro." });
  }
});

/**
 * Resumo cacheado do Dashboard/BI unificado (src/pages/dashboard/BusinessIntelligence.tsx)
 * — CRM/Vendas + Financeiro + Operacional numa chamada só, com filtro de
 * período (`?from=YYYY-MM-DD&to=YYYY-MM-DD`, default = últimos 12 meses).
 * Mesma resolução/validação de tenant das rotas acima (?tenantId=,
 * revalidado via has_tenant_access) e mesmo padrão de fetchAllRowsPaginated
 * (sem risco do cap de 1000 linhas do PostgREST — testado com tenant de
 * 4700+ leads).
 *
 * Métricas deliberadamente NÃO incluídas por falta de dado confiável na
 * base atual: "produtividade por responsável" pra tarefas (tabela `tasks`
 * tem volume real baixíssimo hoje — a métrica é calculada e devolvida, mas
 * vai aparecer quase vazia até o módulo de Tarefas ser mais usado; isso é
 * esperado, não um bug). "Conversão"/"ganho no período" usa `leads.created_at`
 * como proxy de quando o negócio fechou, porque não existe uma coluna
 * "wonAt"/"closedAt" separada — um lead criado num mês e fechado 3 meses
 * depois aparece no mês de CRIAÇÃO, não no mês em que de fato fechou.
 */
app.get("/api/dashboard/bi-summary", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;

    const pad = (n: number) => String(n).padStart(2, "0");
    const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const from = typeof req.query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : isoDate(defaultFrom);
    const to = typeof req.query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : isoDate(now);

    const cacheKey = `dashboard-bi:tenant:${tenantId}:${from}:${to}`;
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const sb = req.supabase;
    const inRange = (d: string | null | undefined, f: string, t: string) => !!d && d >= f && d <= t;
    const monthKey = (d: string) => d.slice(0, 7);
    const sumBy = (rows: { value: number | null }[]) => rows.reduce((s, r) => s + (Number(r.value) || 0), 0);

    const [leadsAll, contracts, entries, clientesAll, tasksAll, reunioesAll] = await Promise.all([
      fetchAllRowsPaginated(sb, "leads", '"id",status,value,source,seller,"stageId","pipelineId",created_at', (q) => q.eq("tenant_id", tenantId)) as Promise<
        { id: string; status: string; value: number | null; source: string | null; seller: string | null; stageId: string | null; pipelineId: string | null; created_at: string }[]
      >,
      fetchAllRowsPaginated(sb, "contracts", "mrr_value,status", (q) => q.eq("tenant_id", tenantId)) as Promise<{ mrr_value: number | null; status: string }[]>,
      fetchAllRowsPaginated(sb, "finance_entries", "type,status,value,date_normalized", (q) => q.eq("tenant_id", tenantId)) as Promise<
        { type: string; status: string; value: number; date_normalized: string | null }[]
      >,
      fetchAllRowsPaginated(sb, "clientes", "status,created_at", (q) => q.eq("tenant_id", tenantId)) as Promise<{ status: string | null; created_at: string }[]>,
      fetchAllRowsPaginated(sb, "tasks", "status,due_date,assigned_to,created_at", (q) => q.eq("tenant_id", tenantId)) as Promise<
        { status: string; due_date: string | null; assigned_to: string | null; created_at: string }[]
      >,
      fetchAllRowsPaginated(sb, "reunioes", '"status","scheduledAt","closerName"', (q) => q.eq("tenant_id", tenantId)) as Promise<
        { status: string; scheduledAt: string | null; closerName: string | null }[]
      >,
    ]);

    // ── CRM / Vendas ──────────────────────────────────────────────────────
    const leadsNoPeriodo = leadsAll.filter((l) => inRange(l.created_at?.slice(0, 10), from, to));
    const leadsGanhos = leadsNoPeriodo.filter((l) => l.status === "Fechado");
    const leadsPerdidos = leadsNoPeriodo.filter((l) => l.status === "Perdido");
    const valorGanho = sumBy(leadsGanhos);
    const valorTotalOportunidades = sumBy(leadsNoPeriodo);
    const taxaConversao = leadsNoPeriodo.length > 0 ? Math.round((leadsGanhos.length / leadsNoPeriodo.length) * 1000) / 10 : 0;
    const ticketMedio = leadsGanhos.length > 0 ? valorGanho / leadsGanhos.length : 0;

    const porEtapa = new Map<string, number>();
    for (const l of leadsAll) { // etapa = estado ATUAL do pipeline, não do período (snapshot de hoje)
      const key = l.stageId || "sem-etapa";
      porEtapa.set(key, (porEtapa.get(key) || 0) + 1);
    }

    const porOrigem = new Map<string, number>();
    for (const l of leadsNoPeriodo) {
      const key = l.source?.trim() || "Não informado";
      porOrigem.set(key, (porOrigem.get(key) || 0) + 1);
    }

    const porVendedor = new Map<string, { leads: number; ganhos: number; valorGanho: number }>();
    for (const l of leadsNoPeriodo) {
      const key = l.seller?.trim() || "Não atribuído";
      const cur = porVendedor.get(key) || { leads: 0, ganhos: 0, valorGanho: 0 };
      cur.leads += 1;
      if (l.status === "Fechado") { cur.ganhos += 1; cur.valorGanho += Number(l.value) || 0; }
      porVendedor.set(key, cur);
    }

    const evolucaoVendas = new Map<string, { valorGanho: number; negociosGanhos: number; leadsNovos: number }>();
    for (const l of leadsNoPeriodo) {
      const key = monthKey(l.created_at.slice(0, 10));
      const cur = evolucaoVendas.get(key) || { valorGanho: 0, negociosGanhos: 0, leadsNovos: 0 };
      cur.leadsNovos += 1;
      if (l.status === "Fechado") { cur.negociosGanhos += 1; cur.valorGanho += Number(l.value) || 0; }
      evolucaoVendas.set(key, cur);
    }

    // ── Financeiro ────────────────────────────────────────────────────────
    const receitaRecebidaRows = entries.filter((e) => e.type === "Receber" && e.status === "Pago" && inRange(e.date_normalized, from, to));
    const despesasPagasRows = entries.filter((e) => e.type === "Pagar" && e.status === "Pago" && inRange(e.date_normalized, from, to));
    const receitaAReceberRows = entries.filter((e) => e.type === "Receber" && (e.status === "A Vencer" || e.status === "Atrasado"));
    const despesasAPagarRows = entries.filter((e) => e.type === "Pagar" && (e.status === "A Vencer" || e.status === "Atrasado"));
    const inadimplenciaRows = entries.filter((e) => e.type === "Receber" && e.status === "Atrasado");

    const receitaRecebida = sumBy(receitaRecebidaRows);
    const despesasPagas = sumBy(despesasPagasRows);

    const evolucaoFinanceira = new Map<string, { receita: number; despesa: number }>();
    for (const e of entries) {
      if (!inRange(e.date_normalized, from, to) || e.status !== "Pago") continue;
      const key = monthKey(e.date_normalized!);
      const cur = evolucaoFinanceira.get(key) || { receita: 0, despesa: 0 };
      if (e.type === "Receber") cur.receita += Number(e.value) || 0;
      else cur.despesa += Number(e.value) || 0;
      evolucaoFinanceira.set(key, cur);
    }

    // Mesma definição de inadimplência já usada em /api/dashboard/summary
    // (contratos status "Inadimplente") — reaproveitada aqui em vez de
    // inventar uma segunda fórmula divergente pra "a mesma palavra".
    const contractsEmRisco = contracts.filter((c) => c.status === "Inadimplente");
    const taxaInadimplenciaContratos = contracts.length > 0 ? Math.round((contractsEmRisco.length / contracts.length) * 1000) / 10 : 0;

    // ── Operacional ───────────────────────────────────────────────────────
    const clientesNovos = clientesAll.filter((c) => inRange(c.created_at?.slice(0, 10), from, to)).length;
    const clientesAtivos = clientesAll.filter((c) => c.status === "Ativo").length;

    const reunioesNoPeriodo = reunioesAll.filter((r) => inRange(r.scheduledAt?.slice(0, 10), from, to));
    const reunioesConcluidas = reunioesNoPeriodo.filter((r) => r.status === "Concluída").length;
    const reunioesPendentes = reunioesNoPeriodo.filter((r) => r.status === "Agendada").length;

    const tasksNoPeriodo = tasksAll.filter((t) => inRange(t.created_at?.slice(0, 10), from, to));
    const tasksConcluidas = tasksNoPeriodo.filter((t) => t.status === "Concluída").length;
    const tasksPendentes = tasksNoPeriodo.filter((t) => t.status !== "Concluída").length;

    const produtividadeResponsavel = new Map<string, { total: number; concluidas: number }>();
    for (const t of tasksNoPeriodo) {
      const key = t.assigned_to || "Não atribuído";
      const cur = produtividadeResponsavel.get(key) || { total: 0, concluidas: 0 };
      cur.total += 1;
      if (t.status === "Concluída") cur.concluidas += 1;
      produtividadeResponsavel.set(key, cur);
    }
    for (const r of reunioesNoPeriodo) {
      const key = r.closerName?.trim() || "Não atribuído";
      const cur = produtividadeResponsavel.get(key) || { total: 0, concluidas: 0 };
      cur.total += 1;
      if (r.status === "Concluída") cur.concluidas += 1;
      produtividadeResponsavel.set(key, cur);
    }

    const summary = {
      periodo: { from, to },
      crm: {
        leadsCadastrados: leadsAll.length,
        leadsNovosNoPeriodo: leadsNoPeriodo.length,
        leadsPorEtapa: Object.fromEntries(porEtapa),
        negociosGanhos: leadsGanhos.length,
        negociosPerdidos: leadsPerdidos.length,
        taxaConversao,
        valorTotalOportunidades,
        valorGanho,
        ticketMedio,
        origemLeads: Object.fromEntries(porOrigem),
        distribuicaoPorVendedor: Object.fromEntries(porVendedor),
        evolucaoVendas: [...evolucaoVendas.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, v]) => ({ mes, ...v })),
      },
      financeiro: {
        receitaRecebida,
        despesasPagas,
        saldoPeriodo: receitaRecebida - despesasPagas,
        receitaAReceber: { value: sumBy(receitaAReceberRows), count: receitaAReceberRows.length },
        despesasAPagar: { value: sumBy(despesasAPagarRows), count: despesasAPagarRows.length },
        inadimplenciaReceber: { value: sumBy(inadimplenciaRows), count: inadimplenciaRows.length },
        taxaInadimplenciaContratos,
        evolucaoFinanceira: [...evolucaoFinanceira.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, v]) => ({ mes, ...v, resultado: v.receita - v.despesa })),
      },
      operacional: {
        clientesAtivos,
        clientesNovos,
        reunioes: { total: reunioesNoPeriodo.length, concluidas: reunioesConcluidas, pendentes: reunioesPendentes },
        tarefas: { total: tasksNoPeriodo.length, concluidas: tasksConcluidas, pendentes: tasksPendentes },
        produtividadePorResponsavel: Object.fromEntries(produtividadeResponsavel),
      },
      cachedAt: new Date().toISOString(),
    };

    await cacheSet(cacheKey, summary, 60);
    res.setHeader("X-Cache", "MISS");
    return res.json(summary);
  } catch (err: any) {
    console.error("[dashboard/bi-summary]", err?.message);
    return res.status(500).json({ error: "Erro ao calcular o resumo de BI." });
  }
});

const WEEKDAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * Resumo cacheado de Marketing (src/pages/marketing/MarketingCampanhas.tsx)
 * — KPIs + gráficos, nada de listagem de registro individual (a tela toda
 * é agregada: cards, 2 gráficos e uma tabela "por origem" já sumarizada).
 * Mesma resolução/validação de tenant das rotas anteriores.
 *
 * `leads.date` é texto — 4373/4396 em ISO válido, ~20 com o literal "Hoje"
 * (dado legado) que o cliente já ignora silenciosamente via try/catch no
 * new Date(); replicado aqui filtrando só datas que batem o formato ISO
 * antes de agrupar por dia da semana. Sem formato BR misturado (diferente
 * de finance_entries) — confirmado ao vivo antes de implementar.
 */
app.get("/api/marketing/campanhas-summary", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const cacheKey = `marketing-campanhas:tenant:${tenantId}:summary`;

    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const sb = req.supabase;
    const [leadsAll, entries] = await Promise.all([
      fetchAllRowsPaginated(sb, "leads", "status,date,source", (q) => q.eq("tenant_id", tenantId)) as Promise<{ status: string; date: string | null; source: string | null }[]>,
      fetchAllRowsPaginated(sb, "finance_entries", "type,status,value", (q) => q.eq("tenant_id", tenantId)) as Promise<{ type: string; status: string; value: number }[]>,
    ]);

    const totalLeads = leadsAll.length;
    const closedLeads = leadsAll.filter(l => l.status === "Fechado").length;
    const totalRevenue = entries.filter(f => f.type === "Receber" && f.status === "Pago").reduce((s, f) => s + (Number(f.value) || 0), 0);
    const totalSpent = entries.filter(f => f.type === "Pagar" && f.status === "Pago").reduce((s, f) => s + (Number(f.value) || 0), 0);
    const cpa = totalLeads > 0 ? totalSpent / totalLeads : 0;

    const trafficCounts = [0, 0, 0, 0, 0, 0, 0];
    for (const l of leadsAll) {
      if (!l.date || !/^\d{4}-\d{2}-\d{2}/.test(l.date)) continue;
      const d = new Date(l.date);
      if (isNaN(d.getTime())) continue;
      trafficCounts[d.getDay()]++;
    }
    const trafficData = WEEKDAYS_PT.map((name, i) => ({ name, leads: trafficCounts[i], spend: 0 }));

    const bySourceMap: Record<string, { leads: number; closed: number }> = {};
    for (const l of leadsAll) {
      const src = l.source || "Orgânico / Direto";
      if (!bySourceMap[src]) bySourceMap[src] = { leads: 0, closed: 0 };
      bySourceMap[src].leads++;
      if (l.status === "Fechado") bySourceMap[src].closed++;
    }
    const bySource = Object.entries(bySourceMap)
      .sort((a, b) => b[1].leads - a[1].leads)
      .map(([source, data]) => ({ source, leads: data.leads, closed: data.closed }));

    const summary = { totalLeads, closedLeads, totalRevenue, totalSpent, cpa, trafficData, bySource, cachedAt: new Date().toISOString() };

    await cacheSet(cacheKey, summary, 60);
    res.setHeader("X-Cache", "MISS");
    return res.json(summary);
  } catch (err: any) {
    console.error("[marketing/campanhas-summary]", err?.message);
    return res.status(500).json({ error: "Erro ao calcular resumo de campanhas." });
  }
});

const AGING_BUCKETS = [
  { id: "1-7", label: "1–7 dias", min: 1, max: 7 },
  { id: "8-30", label: "8–30 dias", min: 8, max: 30 },
  { id: "31-60", label: "31–60 dias", min: 31, max: 60 },
  { id: "61-90", label: "61–90 dias", min: 61, max: 90 },
  { id: "90+", label: "+90 dias", min: 91, max: Infinity },
];
function bucketFor(dias: number) {
  return AGING_BUCKETS.find((b) => dias >= b.min && dias <= b.max) ?? AGING_BUCKETS[AGING_BUCKETS.length - 1];
}

/**
 * Resumo cacheado de Inadimplência (src/pages/finance/FinanceiroInadimplencia.tsx)
 * — KPIs + aging buckets + agrupamento por cliente (não lançamento
 * individual, só link pra tela de Cobranças). Usa date_normalized (coluna
 * gerada) pra calcular dias de atraso — mesma semântica de
 * daysBetween()/parseEntryDate() em financeDates.ts, sem reimplementar
 * parsing de texto: dias = diferença em dias UTC entre hoje e a data de
 * vencimento, calculado a partir dos componentes y/m/d, igual ao cliente.
 */
app.get("/api/finance/inadimplencia-summary", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const cacheKey = `finance-inadimplencia:tenant:${tenantId}:summary`;

    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const sb = req.supabase;
    const vencidosRaw = await fetchAllRowsPaginated(sb, "finance_entries", "value,counterparty,date_normalized",
      (q) => q.eq("tenant_id", tenantId).eq("type", "Receber").eq("status", "Atrasado")) as { value: number; counterparty: string | null; date_normalized: string | null }[];

    const now = new Date();
    const nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const vencidos = vencidosRaw.map((f) => {
      let dias = 0;
      if (f.date_normalized) {
        const [y, m, d] = f.date_normalized.split("-").map(Number);
        dias = Math.max(0, Math.round((nowUTC - Date.UTC(y, m - 1, d)) / 86400000));
      }
      return { value: Number(f.value) || 0, cliente: f.counterparty || "Sem cliente identificado", dias };
    });

    const totalVencido = vencidos.reduce((s, f) => s + f.value, 0);
    const clientesUnicos = new Set(vencidos.map((f) => f.cliente)).size;
    const atrasoMedio = vencidos.length > 0 ? vencidos.reduce((s, f) => s + f.dias, 0) / vencidos.length : 0;

    const buckets = AGING_BUCKETS.map((b) => {
      const items = vencidos.filter((f) => bucketFor(f.dias).id === b.id);
      return { id: b.id, label: b.label, count: items.length, value: items.reduce((s, f) => s + f.value, 0) };
    });

    const byClient = new Map<string, { titulos: number; valor: number; maiorAtraso: number }>();
    for (const f of vencidos) {
      const cur = byClient.get(f.cliente) || { titulos: 0, valor: 0, maiorAtraso: 0 };
      cur.titulos += 1;
      cur.valor += f.value;
      cur.maiorAtraso = Math.max(cur.maiorAtraso, f.dias);
      byClient.set(f.cliente, cur);
    }
    const porCliente = Array.from(byClient.entries())
      .map(([cliente, v]) => ({ cliente, ...v }))
      .sort((a, b) => b.valor - a.valor);

    const summary = {
      vencidosCount: vencidos.length, totalVencido, clientesUnicos, atrasoMedio,
      buckets, porCliente, cachedAt: new Date().toISOString(),
    };

    await cacheSet(cacheKey, summary, 60);
    res.setHeader("X-Cache", "MISS");
    return res.json(summary);
  } catch (err: any) {
    console.error("[finance/inadimplencia-summary]", err?.message);
    return res.status(500).json({ error: "Erro ao calcular resumo de inadimplência." });
  }
});

// DRE — regime de competência, mesmo cálculo de calcularDRE() em
// src/pages/finance/lib/financeEngine.ts. O intervalo [startDate, endDate]
// vem pronto do cliente (periodoRange() em FinanceiroDRE.tsx) pra evitar
// qualquer divergência de fuso horário entre o cálculo de "período atual"
// no servidor e no navegador do usuário.
app.get("/api/finance/dre-summary", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;

    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : null;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : null;
    const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!startDate || !endDate || !isoDateRe.test(startDate) || !isoDateRe.test(endDate)) {
      return res.status(400).json({ error: "Parâmetros startDate/endDate (YYYY-MM-DD) são obrigatórios." });
    }
    const cacheKey = `finance-dre:tenant:${tenantId}:${startDate}:${endDate}`;

    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const sb = req.supabase;
    const [entries, categoryRows] = await Promise.all([
      fetchAllRowsPaginated(sb, "finance_entries", "type,status,value,category_id",
        (q) => q.eq("tenant_id", tenantId).gte("date_normalized", startDate).lte("date_normalized", endDate)) as Promise<{ type: string; status: string; value: number; category_id: string | null }[]>,
      fetchAllRowsPaginated(sb, "finance_categories", "id,subtipo", (q) => q.eq("tenant_id", tenantId)),
    ]);

    const categoriesMap = new Map((categoryRows || []).map((c: any) => [c.id, c]));

    const dreTipoDe = (e: (typeof entries)[number]) => {
      if (e.type === "Receber") return "RECEBIMENTO";
      const cat = e.category_id ? categoriesMap.get(e.category_id) : undefined;
      return (cat as any)?.subtipo ?? "DESPESA_VARIAVEL";
    };
    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const somaPorTipo = (tipo: string) =>
      round2(entries.filter((e) => e.type === "Pagar" && dreTipoDe(e) === tipo).reduce((s, e) => s + (Number(e.value) || 0), 0));

    const receitaBruta = round2(entries.filter((e) => e.type === "Receber").reduce((s, e) => s + (Number(e.value) || 0), 0));
    const impostos = somaPorTipo("IMPOSTOS");
    const lucroBruto = round2(receitaBruta - impostos);
    const despesasVariaveis = somaPorTipo("DESPESA_VARIAVEL");
    const lucroOperacional = round2(lucroBruto - despesasVariaveis);
    const despesasFixas = somaPorTipo("DESPESA_FIXA");
    const gastosComPessoal = somaPorTipo("PESSOAS");
    const lucroLiquido = round2(lucroOperacional - despesasFixas - gastosComPessoal);

    const summary = {
      receitaBruta, impostos, lucroBruto, despesasVariaveis, lucroOperacional,
      despesasFixas, gastosComPessoal, lucroLiquido,
      entriesCount: entries.length,
      entriesPendentesCount: entries.filter((e) => e.status !== "Pago").length,
      cachedAt: new Date().toISOString(),
    };

    await cacheSet(cacheKey, summary, 60);
    res.setHeader("X-Cache", "MISS");
    return res.json(summary);
  } catch (err: any) {
    console.error("[finance/dre-summary]", err?.message);
    return res.status(500).json({ error: "Erro ao calcular DRE." });
  }
});

const PERF_MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Performance Mensal — mesma fórmula de FinanceiroPerformanceMensal.tsx:
// regime de CAIXA (status "Pago"), últimos N meses (6/12/24) ancorados no
// mês corrente do servidor.
app.get("/api/finance/performance-mensal-summary", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;

    const janelaParam = Number(req.query.janela);
    const janela = [6, 12, 24].includes(janelaParam) ? janelaParam : 12;
    const cacheKey = `finance-performance-mensal:tenant:${tenantId}:janela:${janela}`;

    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const now = new Date();
    const months = Array.from({ length: janela }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (janela - 1 - i), 1);
      return { y: d.getFullYear(), m: d.getMonth(), label: `${PERF_MONTH_NAMES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` };
    });
    const startDate = `${months[0].y}-${String(months[0].m + 1).padStart(2, "0")}-01`;

    const sb = req.supabase;
    const rows = await fetchAllRowsPaginated(sb, "finance_entries", "type,value,date_normalized",
      (q) => q.eq("tenant_id", tenantId).eq("status", "Pago").gte("date_normalized", startDate));

    const byMonth = new Map<string, { receita: number; despesa: number }>();
    for (const r of (rows || []) as { type: string; value: number; date_normalized: string | null }[]) {
      if (!r.date_normalized) continue;
      const key = r.date_normalized.slice(0, 7);
      const cur = byMonth.get(key) || { receita: 0, despesa: 0 };
      if (r.type === "Receber") cur.receita += Number(r.value) || 0;
      else if (r.type === "Pagar") cur.despesa += Number(r.value) || 0;
      byMonth.set(key, cur);
    }

    const meses = months.map(({ y, m, label }) => {
      const v = byMonth.get(`${y}-${String(m + 1).padStart(2, "0")}`) || { receita: 0, despesa: 0 };
      return { label, receita: v.receita, despesa: v.despesa, resultado: v.receita - v.despesa };
    });

    const receitaTotal = meses.reduce((s, m) => s + m.receita, 0);
    const despesaTotal = meses.reduce((s, m) => s + m.despesa, 0);
    const melhorMes = meses.reduce((best, m) => (!best || m.resultado > best.resultado ? m : best), meses[0]);

    const summary = { meses, receitaTotal, despesaTotal, resultadoTotal: receitaTotal - despesaTotal, melhorMes, cachedAt: new Date().toISOString() };

    await cacheSet(cacheKey, summary, 60);
    res.setHeader("X-Cache", "MISS");
    return res.json(summary);
  } catch (err: any) {
    console.error("[finance/performance-mensal-summary]", err?.message);
    return res.status(500).json({ error: "Erro ao calcular performance mensal." });
  }
});

const PERF_DRE_TIPO_LABEL: Record<string, string> = { DESPESA_FIXA: "Despesas Fixas", DESPESA_VARIAVEL: "Despesas Variáveis", PESSOAS: "Pessoal", IMPOSTOS: "Impostos" };

// Performance Anual — mesma fórmula de FinanceiroPerformanceAnual.tsx:
// regime de CAIXA, ano vs. ano anterior. Saldo das contas (saldosContas)
// fica de fora, igual à Visão Geral — depende de financeBankAccounts +
// financeTransfers, domínio à parte, sempre client-side.
app.get("/api/finance/performance-anual-summary", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;

    const anoParam = Number(req.query.ano);
    const ano = Number.isInteger(anoParam) && anoParam > 2000 && anoParam < 2100 ? anoParam : new Date().getFullYear();
    const cacheKey = `finance-performance-anual:tenant:${tenantId}:ano:${ano}`;

    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const sb = req.supabase;
    type PerfEntry = { id: string; type: string; value: number; description: string | null; category: string | null; category_id: string | null; date_normalized: string | null };
    const [entryRows, categoryRows] = await Promise.all([
      fetchAllRowsPaginated(sb, "finance_entries", "id,type,value,description,category,category_id,date_normalized",
        (q) => q.eq("tenant_id", tenantId).eq("status", "Pago").gte("date_normalized", `${ano - 1}-01-01`).lte("date_normalized", `${ano}-12-31`)) as Promise<PerfEntry[]>,
      fetchAllRowsPaginated(sb, "finance_categories", "id,subtipo", (q) => q.eq("tenant_id", tenantId)),
    ]);

    const categoriesMap = new Map((categoryRows || []).map((c: any) => [c.id, c]));
    const dreTipoDe = (e: PerfEntry) => {
      if (e.type === "Receber") return "RECEBIMENTO";
      const cat = e.category_id ? categoriesMap.get(e.category_id) : undefined;
      return (cat as any)?.subtipo ?? "DESPESA_VARIAVEL";
    };

    const all = (entryRows || []) as PerfEntry[];
    const atual = all.filter((e) => e.date_normalized && e.date_normalized.slice(0, 4) === String(ano));
    const anterior = all.filter((e) => e.date_normalized && e.date_normalized.slice(0, 4) === String(ano - 1));

    const somaTipo = (arr: PerfEntry[], type: string) => arr.filter((e) => e.type === type).reduce((s, e) => s + (Number(e.value) || 0), 0);
    const receitaAtual = somaTipo(atual, "Receber"), receitaAnterior = somaTipo(anterior, "Receber");
    const despesaAtual = somaTipo(atual, "Pagar"), despesaAnterior = somaTipo(anterior, "Pagar");

    const maioresGastos = [...atual].filter((e) => e.type === "Pagar").sort((a, b) => b.value - a.value).slice(0, 5)
      .map((e) => ({ id: e.id, description: e.description, value: Number(e.value) || 0 }));
    const maioresReceitas = [...atual].filter((e) => e.type === "Receber").sort((a, b) => b.value - a.value).slice(0, 5)
      .map((e) => ({ id: e.id, description: e.description, value: Number(e.value) || 0 }));

    const porCategoriaReceita = new Map<string, number>();
    atual.filter((e) => e.type === "Receber").forEach((e) => {
      const k = e.category || "Sem categoria";
      porCategoriaReceita.set(k, (porCategoriaReceita.get(k) || 0) + (Number(e.value) || 0));
    });

    const porTipoDespesa = new Map<string, number>();
    atual.filter((e) => e.type === "Pagar").forEach((e) => {
      const t = dreTipoDe(e);
      porTipoDespesa.set(t, (porTipoDespesa.get(t) || 0) + (Number(e.value) || 0));
    });

    const linhasTipo = (["DESPESA_FIXA", "DESPESA_VARIAVEL", "PESSOAS", "IMPOSTOS"] as const).map((tipo) => {
      const val = porTipoDespesa.get(tipo) || 0;
      const valAnt = anterior.filter((e) => e.type === "Pagar" && dreTipoDe(e) === tipo).reduce((s, e) => s + (Number(e.value) || 0), 0);
      return { label: PERF_DRE_TIPO_LABEL[tipo], atual: val, anterior: valAnt };
    });

    const summary = {
      receitaAtual, receitaAnterior, despesaAtual, despesaAnterior,
      maioresGastos, maioresReceitas,
      donutReceita: Array.from(porCategoriaReceita.entries()).map(([name, value]) => ({ name, value })),
      donutDespesa: Array.from(porTipoDespesa.entries()).map(([tipo, value]) => ({ name: PERF_DRE_TIPO_LABEL[tipo] || tipo, value })),
      linhasTipo,
      cachedAt: new Date().toISOString(),
    };

    await cacheSet(cacheKey, summary, 60);
    res.setHeader("X-Cache", "MISS");
    return res.json(summary);
  } catch (err: any) {
    console.error("[finance/performance-anual-summary]", err?.message);
    return res.status(500).json({ error: "Erro ao calcular performance anual." });
  }
});

// Fluxo de Caixa — regime de caixa, dia a dia. [startDate, endDate] vem
// pronto do cliente (mesma janela de 30/60/90 dias calculada em
// FinanceiroFluxoCaixa.tsx) pra evitar divergência de fuso horário entre
// o "hoje" do servidor e o do navegador — mesmo motivo do DRE.
app.get("/api/finance/fluxo-caixa-summary", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;

    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : null;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : null;
    const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!startDate || !endDate || !isoDateRe.test(startDate) || !isoDateRe.test(endDate)) {
      return res.status(400).json({ error: "Parâmetros startDate/endDate (YYYY-MM-DD) são obrigatórios." });
    }
    const cacheKey = `finance-fluxo-caixa:tenant:${tenantId}:${startDate}:${endDate}`;

    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const sb = req.supabase;
    const rows = await fetchAllRowsPaginated(sb, "finance_entries", "type,value,date_normalized",
      (q) => q.eq("tenant_id", tenantId).eq("status", "Pago").gte("date_normalized", startDate).lte("date_normalized", endDate));

    const buckets = new Map<string, { entradas: number; saidas: number }>();
    for (const r of (rows || []) as { type: string; value: number; date_normalized: string | null }[]) {
      if (!r.date_normalized) continue;
      const cur = buckets.get(r.date_normalized) || { entradas: 0, saidas: 0 };
      if (r.type === "Receber") cur.entradas += Number(r.value) || 0;
      else if (r.type === "Pagar") cur.saidas += Number(r.value) || 0;
      buckets.set(r.date_normalized, cur);
    }

    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    let acumulado = 0;
    const fluxoDiario = Array.from(buckets.keys()).sort().map((key) => {
      const b = buckets.get(key)!;
      const [y, m, d] = key.split("-");
      const saldoDia = round2(b.entradas - b.saidas);
      acumulado = round2(acumulado + saldoDia);
      return { label: `${d}/${m}`, dataCompleta: `${d}/${m}/${y}`, entradas: b.entradas, saidas: b.saidas, saldoDia, acumulado };
    });

    const totalEntradas = fluxoDiario.reduce((s, d) => s + d.entradas, 0);
    const totalSaidas = fluxoDiario.reduce((s, d) => s + d.saidas, 0);

    const summary = { totalEntradas, totalSaidas, saldoLiquido: round2(totalEntradas - totalSaidas), fluxoDiario, cachedAt: new Date().toISOString() };

    await cacheSet(cacheKey, summary, 60);
    res.setHeader("X-Cache", "MISS");
    return res.json(summary);
  } catch (err: any) {
    console.error("[finance/fluxo-caixa-summary]", err?.message);
    return res.status(500).json({ error: "Erro ao calcular fluxo de caixa." });
  }
});

/**
 * Marketing Analytics (src/pages/marketing/MarketingAnalytics.tsx) — cacheia
 * só os KPIs e o donut por canal, que são bem definidos. O gráfico de
 * evolução mensal (performanceData) fica de fora de propósito: agrupa só
 * pelo NOME do mês (sem ano, via toLocaleDateString) na ordem de primeira
 * ocorrência no array de leads — não é uma agregação determinística pra
 * replicar fielmente no servidor (dependeria de bater a mesma ordem de
 * iteração E a mesma formatação de locale do Node), então continua 100%
 * client-side, igual já era antes do cache.
 */
app.get("/api/marketing/analytics-summary", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const cacheKey = `marketing-analytics:tenant:${tenantId}:summary`;

    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const sb = req.supabase;
    const [leadsAll, entries] = await Promise.all([
      fetchAllRowsPaginated(sb, "leads", "status,value,source", (q) => q.eq("tenant_id", tenantId)) as Promise<{ status: string; value: number; source: string | null }[]>,
      fetchAllRowsPaginated(sb, "finance_entries", "type,status,value,category", (q) => q.eq("tenant_id", tenantId)) as Promise<{ type: string; status: string; value: number; category: string | null }[]>,
    ]);

    const closedLeadsRows = leadsAll.filter((l) => l.status === "Fechado");
    const totalRevenue = closedLeadsRows.reduce((s, l) => s + (Number(l.value) || 0), 0);
    const totalSpent = entries
      .filter((f) => f.type === "Pagar" && f.status === "Pago" && (f.category?.toLowerCase().includes("marketing") || f.category?.toLowerCase().includes("anúncio")))
      .reduce((s, f) => s + (Number(f.value) || 0), 0);

    const totalLeads = leadsAll.length;
    const closedLeads = closedLeadsRows.length;
    const cac = totalLeads > 0 ? totalSpent / totalLeads : 0;
    const avgDeal = closedLeads > 0 ? totalRevenue / closedLeads : 0;
    const roi = totalSpent > 0 ? totalRevenue / totalSpent : 0;

    const srcMap = new Map<string, number>();
    for (const l of closedLeadsRows) {
      const src = l.source || "Orgânico";
      srcMap.set(src, (srcMap.get(src) || 0) + (Number(l.value) || 0));
    }
    const sourceData = Array.from(srcMap.entries())
      .filter(([, revenue]) => revenue > 0)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    const summary = { totalRevenue, totalSpent, totalLeads, closedLeads, cac, avgDeal, roi, sourceData, cachedAt: new Date().toISOString() };

    await cacheSet(cacheKey, summary, 60);
    res.setHeader("X-Cache", "MISS");
    return res.json(summary);
  } catch (err: any) {
    console.error("[marketing/analytics-summary]", err?.message);
    return res.status(500).json({ error: "Erro ao calcular resumo de analytics de marketing." });
  }
});

/**
 * Relatórios Executivos (src/pages/crm/RelatoriosExecutivos.tsx) — porta a
 * função isWithin() exatamente como está no cliente, campo a campo e quirk a
 * quirk (data ausente ou não-parseável SEMPRE conta no período, "30dias" não
 * tem limite superior — replicados de propósito, não são bugs a corrigir
 * aqui). leads/finance_entries/tasks são buscados só por tenant_id (sem
 * filtro de data na query) porque leads.date é texto em formato misto sem
 * coluna normalizada — o filtro de período roda em JS, igual ao cliente.
 */
app.get("/api/crm/relatorios-executivos-summary", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const periodoParam = typeof req.query.periodo === "string" ? req.query.periodo : "mes";
    const periodo = ["30dias", "mes", "trimestre", "ano", "todos"].includes(periodoParam) ? periodoParam : "mes";
    const cacheKey = `crm-relatorios-executivos:tenant:${tenantId}:periodo:${periodo}`;

    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const sb = req.supabase;
    const [leadsAll, financeAll, tasksAll, contractsAll] = await Promise.all([
      fetchAllRowsPaginated(sb, "leads", "status,value,seller,date", (q) => q.eq("tenant_id", tenantId)) as Promise<{ status: string; value: any; seller: string | null; date: string | null }[]>,
      fetchAllRowsPaginated(sb, "finance_entries", "type,status,value,date", (q) => q.eq("tenant_id", tenantId)) as Promise<{ type: string; status: string; value: number; date: string | null }[]>,
      fetchAllRowsPaginated(sb, "tasks", "status,due_date", (q) => q.eq("tenant_id", tenantId)) as Promise<{ status: string; due_date: string | null }[]>,
      fetchAllRowsPaginated(sb, "contracts", "status,mrr_value,value", (q) => q.eq("tenant_id", tenantId)) as Promise<{ status: string; mrr_value: number | null; value: number | null }[]>,
    ]);

    const now = new Date();
    const isWithin = (dateStr?: string | null): boolean => {
      if (!dateStr || periodo === "todos") return true;
      try {
        let d: Date;
        if (dateStr.includes("/")) {
          const parts = dateStr.split("/");
          d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        } else {
          d = new Date(dateStr);
        }
        if (isNaN(d.getTime())) return true;
        if (periodo === "30dias") return now.getTime() - d.getTime() <= 30 * 24 * 3600 * 1000;
        if (periodo === "mes") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        if (periodo === "trimestre") {
          const qNow = Math.floor(now.getMonth() / 3);
          const qD = Math.floor(d.getMonth() / 3);
          return d.getFullYear() === now.getFullYear() && qNow === qD;
        }
        if (periodo === "ano") return d.getFullYear() === now.getFullYear();
        return true;
      } catch {
        return true;
      }
    };

    const pLeads = leadsAll.filter((l) => isWithin(l.date));
    const pFinance = financeAll.filter((f) => isWithin(f.date));
    const pTasks = tasksAll.filter((t) => isWithin(t.due_date));

    const totalLeads = pLeads.length;
    const closedLeads = pLeads.filter((l) => l.status === "Fechado" || l.status === "Ganho").length;
    const leadConversion = totalLeads > 0 ? Math.round((closedLeads / totalLeads) * 100) : 0;

    const totalReceitas = pFinance.filter((f) => f.type === "Receber" && f.status === "Pago").reduce((s, f) => s + (Number(f.value) || 0), 0);
    const totalDespesas = pFinance.filter((f) => f.type === "Pagar" && f.status === "Pago").reduce((s, f) => s + (Number(f.value) || 0), 0);
    const resultadoLiquido = totalReceitas - totalDespesas;

    const tasksCompleted = pTasks.filter((t) => t.status === "Concluída").length;
    const taskCompletionRate = pTasks.length > 0 ? Math.round((tasksCompleted / pTasks.length) * 100) : 0;

    const parseValLike = (v: any): number => {
      if (typeof v === "number") return v;
      const n = parseFloat(String(v || "0").replace(/[^0-9.,]/g, "").replace(",", "."));
      return isNaN(n) ? 0 : n;
    };
    const sellerMap = new Map<string, { leads: number; closed: number; revenue: number }>();
    for (const l of pLeads) {
      const seller = l.seller || "Sem atribuição";
      const cur = sellerMap.get(seller) || { leads: 0, closed: 0, revenue: 0 };
      cur.leads += 1;
      if (l.status === "Fechado" || l.status === "Ganho") {
        cur.closed += 1;
        cur.revenue += parseValLike(l.value);
      }
      sellerMap.set(seller, cur);
    }
    const salesBySeller = Array.from(sellerMap.entries())
      .map(([name, d]) => ({ name, leads: d.leads, closed: d.closed, revenue: d.revenue, rate: d.leads > 0 ? Math.round((d.closed / d.leads) * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue);

    const isCancelled = (c: { status: string }) => c.status === "Cancelado";
    const isActive = (c: { status: string }) => !isCancelled(c) && c.status !== "Perdido";
    const contratosAtivosCount = contractsAll.filter((c) => c.status === "Ativo").length;
    const mrrContratado = contractsAll.filter(isActive).reduce((s, c) => s + parseValLike(c.mrr_value ?? c.value ?? 0), 0);

    const summary = {
      totalLeads, closedLeads, leadConversion, totalReceitas, totalDespesas, resultadoLiquido,
      tasksCompleted, tasksTotal: pTasks.length, taskCompletionRate,
      salesBySeller, contratosAtivosCount, mrrContratado,
      cachedAt: new Date().toISOString(),
    };

    await cacheSet(cacheKey, summary, 60);
    res.setHeader("X-Cache", "MISS");
    return res.json(summary);
  } catch (err: any) {
    console.error("[crm/relatorios-executivos-summary]", err?.message);
    return res.status(500).json({ error: "Erro ao calcular relatório executivo." });
  }
});

/**
 * Dashboard de Performance do CRM (src/pages/crm/Dashboard.tsx) — janela
 * rolante de 6 meses (correta, agrupa por mês+ano, não só o nome do mês) e
 * os KPIs do topo. `totalValue` replica a mesma extração de dígitos
 * (parseFloat + replace(/[^\d]/g)) do cliente, mesmo sendo uma conta que
 * ignora separador decimal — é o que a tela já mostra hoje, não é escopo
 * corrigir aqui. hotLeads (lista de registros) e leadScoreTriggers.length
 * ficam de fora — o primeiro precisa dos leads completos pra qualquer ação
 * de clique, o segundo é uma tabela de configuração já pequena.
 */
app.get("/api/crm/dashboard-performance-summary", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const cacheKey = `crm-dashboard-performance:tenant:${tenantId}:summary`;

    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const sb = req.supabase;
    const leadsAll = await fetchAllRowsPaginated(sb, "leads", 'status,value,"scoreIA",created_at', (q) => q.eq("tenant_id", tenantId)) as { status: string; value: any; scoreIA: number | null; created_at: string | null }[];

    const now = new Date();
    const performanceData = Array.from({ length: 6 }, (_, i) => {
      const target = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const month = target.toLocaleString("pt-BR", { month: "short" });
      const monthLeads = leadsAll.filter((l) => {
        const d = new Date(l.created_at || 0);
        return d.getMonth() === target.getMonth() && d.getFullYear() === target.getFullYear();
      });
      const avgScore = monthLeads.length > 0
        ? Math.round(monthLeads.reduce((s, l) => s + (l.scoreIA || 0), 0) / monthLeads.length)
        : 0;
      const won = monthLeads.filter((l) => l.status === "Fechado").length;
      const conversionRate = monthLeads.length > 0 ? Math.round((won / monthLeads.length) * 100) : 0;
      return { month, avgScore, conversionRate, leads: monthLeads.length };
    });

    const totalLeads = leadsAll.length;
    const avgScore = totalLeads > 0 ? leadsAll.reduce((a, l) => a + (l.scoreIA || 0), 0) / totalLeads : 0;
    const totalValue = leadsAll.reduce((a, l) => {
      const v = parseFloat(String(l.value || "").replace(/[^\d]/g, "")) || 0;
      return a + v;
    }, 0);
    const wonLeads = leadsAll.filter((l) => l.status === "Fechado").length;
    const winRate = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;

    const summary = { performanceData, totalLeads, avgScore, totalValue, winRate, cachedAt: new Date().toISOString() };

    await cacheSet(cacheKey, summary, 60);
    res.setHeader("X-Cache", "MISS");
    return res.json(summary);
  } catch (err: any) {
    console.error("[crm/dashboard-performance-summary]", err?.message);
    return res.status(500).json({ error: "Erro ao calcular dashboard de performance." });
  }
});

/**
 * BI Clínico (src/pages/clinica/Estatisticas.tsx) — cacheia só
 * totalPacientes/occupancy/specialtyData, que são agregações
 * order-independent (dão o mesmo resultado não importa a ordem das linhas).
 * patientGrowth fica de fora de propósito: é uma classificação "novo vs.
 * recorrente" stateful que depende da ordem cronológica completa do
 * histórico de agendamentos (primeira ocorrência de cada paciente, por
 * NOME, ever), sem cota de segurança contra empate de data — qualquer
 * divergência de ordenação entre o array já carregado no cliente e uma
 * nova query no servidor pode classificar um agendamento diferente, então
 * não é seguro replicar fielmente aqui.
 */
app.get("/api/clinica/estatisticas-summary", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const cacheKey = `clinica-estatisticas:tenant:${tenantId}:user:${req.user.id}:summary`;

    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const sb = req.supabase;
    const appointmentsAll = await fetchAllRowsPaginated(sb, "appointments", "patient,specialty,status", (q) => q.eq("tenant_id", tenantId)) as { patient: string; specialty: string | null; status: string }[];

    const totalPacientes = new Set(appointmentsAll.map((a) => a.patient)).size;
    const total = appointmentsAll.length;
    const occupancyPct = total > 0
      ? Math.round((appointmentsAll.filter((a) => a.status === "Confirmado" || a.status === "Em Atendimento" || a.status === "Finalizado").length / total) * 100)
      : 0;

    const specs = new Map<string, number>();
    for (const a of appointmentsAll) {
      const s = a.specialty || "Clínico Geral";
      specs.set(s, (specs.get(s) || 0) + 1);
    }
    const specialtyData = Array.from(specs.entries())
      .map(([name, count]) => ({ name, value: total > 0 ? Math.round((count / total) * 100) : 0 }))
      .sort((a, b) => b.value - a.value);

    const summary = { totalPacientes, total, occupancyPct, specialtyData, cachedAt: new Date().toISOString() };

    await cacheSet(cacheKey, summary, 60);
    res.setHeader("X-Cache", "MISS");
    return res.json(summary);
  } catch (err: any) {
    console.error("[clinica/estatisticas-summary]", err?.message);
    return res.status(500).json({ error: "Erro ao calcular estatísticas da clínica." });
  }
});

/**
 * Faturamento Clínico (src/pages/clinica/Faturamento.tsx) — replica os KPIs,
 * a evolução mensal (revenueData, agrupada por ano+mês via sortKey, então
 * order-independent) e o mix por categoria. revenueData usa `new Date(f.date)`
 * puro igual ao cliente (não parseEntryDate) — lançamento com data em
 * formato BR (DD/MM/AAAA) falha o parse e é silenciosamente excluído do
 * gráfico, igual já acontece hoje; replicado de propósito, não corrigido.
 */
app.get("/api/clinica/faturamento-summary", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const cacheKey = `clinica-faturamento:tenant:${tenantId}:user:${req.user.id}:summary`;

    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const sb = req.supabase;
    const [receivables, { count: appointmentsCount }] = await Promise.all([
      fetchAllRowsPaginated(sb, "finance_entries", "status,value,date,category", (q) => q.eq("tenant_id", tenantId).eq("type", "Receber")) as Promise<{ status: string; value: number; date: string | null; category: string | null }[]>,
      sb.from("appointments").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    ]);

    const totalBilled = receivables.reduce((s, f) => s + (Number(f.value) || 0), 0);
    const totalReceived = receivables.filter((f) => f.status === "Pago").reduce((s, f) => s + (Number(f.value) || 0), 0);
    const totalLate = receivables.filter((f) => f.status === "Atrasado").reduce((s, f) => s + (Number(f.value) || 0), 0);
    const glosaRate = totalBilled > 0 ? ((totalLate / totalBilled) * 100).toFixed(1) + "%" : "0%";
    const avgTicket = (appointmentsCount || 0) > 0 ? totalReceived / (appointmentsCount as number) : 0;

    const months = new Map<string, { month: string; faturado: number; recebido: number; glosas: number }>();
    for (const f of receivables) {
      const d = new Date(f.date || "");
      if (isNaN(d.getTime())) continue;
      const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const month = d.toLocaleDateString("pt-BR", { month: "short" });
      const cur = months.get(sortKey) || { month, faturado: 0, recebido: 0, glosas: 0 };
      cur.faturado += Number(f.value) || 0;
      if (f.status === "Pago") cur.recebido += Number(f.value) || 0;
      if (f.status === "Atrasado") cur.glosas += Number(f.value) || 0;
      months.set(sortKey, cur);
    }
    const revenueData = Array.from(months.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);

    const categories = new Map<string, number>();
    for (const f of receivables) {
      const c = f.category || "Consultas";
      categories.set(c, (categories.get(c) || 0) + (Number(f.value) || 0));
    }
    const catTotal = Array.from(categories.values()).reduce((a, b) => a + b, 0);
    const insuranceData = Array.from(categories.entries())
      .map(([name, val]) => ({ name, value: catTotal > 0 ? Math.round((val / catTotal) * 100) : 0 }))
      .sort((a, b) => b.value - a.value);

    const summary = { totalBilled, totalReceived, totalLate, glosaRate, avgTicket, revenueData, insuranceData, cachedAt: new Date().toISOString() };

    await cacheSet(cacheKey, summary, 60);
    res.setHeader("X-Cache", "MISS");
    return res.json(summary);
  } catch (err: any) {
    console.error("[clinica/faturamento-summary]", err?.message);
    return res.status(500).json({ error: "Erro ao calcular faturamento clínico." });
  }
});

const PAINEL_WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * Painel Geral da Clínica (src/pages/clinica/PainelGeral.tsx) — KPIs,
 * distribuição por dia da semana e ranking de médicos, todos
 * order-independent (dia da semana vem de getDay(), não de nome
 * localizado). activeToday (lista de agendamentos de hoje) fica de fora —
 * são registros completos pro painel de "jornada do paciente", lista
 * pequena, sem ganho real em cachear.
 */
app.get("/api/clinica/painel-geral-summary", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const cacheKey = `clinica-painel-geral:tenant:${tenantId}:user:${req.user.id}:summary`;

    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const sb = req.supabase;
    const appointmentsAll = await fetchAllRowsPaginated(sb, "appointments", "date,status,dr_name", (q) => q.eq("tenant_id", tenantId)) as { date: string | null; status: string; dr_name: string | null }[];

    const totalAppointments = appointmentsAll.length;
    const confirmed = appointmentsAll.filter((a) => a.status === "Confirmado" || a.status === "Em Atendimento").length;
    const finalized = appointmentsAll.filter((a) => a.status === "Finalizado").length;
    const late = appointmentsAll.filter((a) => a.status === "Atrasado").length;
    const occupancyPct = totalAppointments > 0 ? Math.min(100, Math.round((confirmed / totalAppointments) * 100)) : 0;

    const clinicData = PAINEL_WEEKDAYS.map((day, dayIdx) => {
      const dayApts = appointmentsAll.filter((a) => {
        if (!a.date) return false;
        const d = new Date(a.date);
        return !isNaN(d.getTime()) && d.getDay() === dayIdx;
      });
      return { name: day, consultas: dayApts.length, noShow: dayApts.filter((a) => a.status === "Atrasado").length };
    });

    const byDr = new Map<string, number>();
    for (const a of appointmentsAll) {
      const dr = a.dr_name || "Sem especialista";
      byDr.set(dr, (byDr.get(dr) || 0) + 1);
    }
    const doctorRanking = Array.from(byDr.entries())
      .map(([name, patients]) => ({ name, patients }))
      .sort((a, b) => b.patients - a.patients)
      .slice(0, 3);

    const summary = { totalAppointments, confirmed, finalized, late, occupancyPct, clinicData, doctorRanking, cachedAt: new Date().toISOString() };

    await cacheSet(cacheKey, summary, 60);
    res.setHeader("X-Cache", "MISS");
    return res.json(summary);
  } catch (err: any) {
    console.error("[clinica/painel-geral-summary]", err?.message);
    return res.status(500).json({ error: "Erro ao calcular painel geral da clínica." });
  }
});

/**
 * Mensalidades — resumo compartilhado por duas telas:
 * src/pages/education/Mensalidades.tsx (os 4 KPIs do topo, sobre TODAS as
 * mensalidades do tenant, não só a página atual da tabela paginada) e
 * src/pages/education/PainelGeral.tsx (totalRecebido all-time + contagem
 * por status pro gráfico de pizza) — mesma query, mesmo cache, evita duas
 * agregações redundantes sobre a mesma tabela. `data_pagamento` e
 * `vencimento` são colunas `date` reais (sem parsing de texto). O mês
 * corrente usa new Date().toISOString() em UTC — igual ao cliente, sem
 * risco de fuso, já que os dois convertem pro mesmo instante em UTC.
 */
app.get("/api/education/mensalidades-summary", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const cacheKey = `education-mensalidades:tenant:${tenantId}:user:${req.user.id}:summary`;

    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const sb = req.supabase;
    const mensalidadesAll = await fetchAllRowsPaginated(sb, "mensalidades", "status,valor,data_pagamento", (q) => q.eq("tenant_id", tenantId)) as { status: string; valor: number; data_pagamento: string | null }[];

    const currentMonth = new Date().toISOString().substring(0, 7);
    const totalPendente = mensalidadesAll.filter((m) => m.status === "Pendente").reduce((s, m) => s + (Number(m.valor) || 0), 0);
    const totalAtrasado = mensalidadesAll.filter((m) => m.status === "Atrasado").reduce((s, m) => s + (Number(m.valor) || 0), 0);
    const totalRecebido = mensalidadesAll.filter((m) => m.status === "Pago").reduce((s, m) => s + (Number(m.valor) || 0), 0);
    const totalRecebidoMes = mensalidadesAll
      .filter((m) => m.status === "Pago" && m.data_pagamento?.startsWith(currentMonth))
      .reduce((s, m) => s + (Number(m.valor) || 0), 0);
    const countAtrasado = mensalidadesAll.filter((m) => m.status === "Atrasado").length;
    const statusCounts = {
      pagos: mensalidadesAll.filter((m) => m.status === "Pago").length,
      pendentes: mensalidadesAll.filter((m) => m.status === "Pendente").length,
      atrasados: countAtrasado,
    };

    const summary = { totalPendente, totalAtrasado, totalRecebido, totalRecebidoMes, countAtrasado, statusCounts, cachedAt: new Date().toISOString() };

    await cacheSet(cacheKey, summary, 60);
    res.setHeader("X-Cache", "MISS");
    return res.json(summary);
  } catch (err: any) {
    console.error("[education/mensalidades-summary]", err?.message);
    return res.status(500).json({ error: "Erro ao calcular resumo de mensalidades." });
  }
});

/**
 * Preview cacheado de `leads` pro Pipeline/Kanban (src/contexts/DataContext.tsx).
 * NÃO é a fonte de verdade — é só uma prévia rápida (Redis, TTL curto) pra
 * pintar a tela antes da busca paginada real (fetchAllRowsForTenant, que
 * continua rodando em paralelo e sempre sobrescreve isso quando termina).
 *
 * Colunas explícitas (não `select("*")`) e SEM `customFields` de propósito:
 * medido direto no banco pro maior tenant hoje (4.373 leads), `select("*")`
 * gera ~7,6MB de JSON — acima do limite de resposta de função serverless da
 * Vercel (~4,5MB), o que faria a prévia FALHAR pra esse tenant exatamente
 * quando ele mais precisa dela. `customFields` sozinho é 70% desse peso.
 *
 * O `.limit()` abaixo é só documentação da intenção — o projeto Supabase
 * tem um teto de 1000 linhas por resposta (db-max-rows do PostgREST) que
 * ignora silenciosamente qualquer limit/range maior (confirmado testando
 * direto: pedindo 10.000 linhas, voltaram exatas 1000, sem erro nem aviso —
 * foi esse teto que fez o "Leads Ativos" do dashboard mostrar 1000 em vez
 * dos 4.373 reais). A prévia SEMPRE volta no máximo 1000 leads mais
 * recentes — aceitável aqui porque é só isso mesmo, uma prévia descartável;
 * a busca real (fetchAllRowsForTenant, paginada de verdade com múltiplas
 * requisições) é quem tem a palavra final e não sofre desse teto.
 * TTL curto (20s, vs. 60s nos resumos de métricas — esta tabela muda o
 * tempo todo). Nenhuma mutação passa por aqui — create/update/delete de
 * lead continuam indo direto pro Supabase com atualização otimista, então
 * a sessão do próprio usuário nunca depende deste cache pra ver a própria
 * edição.
 */
// Colunas camelCase precisam vir entre aspas duplas no select do PostgREST
// (mesma convenção já usada pra "scoreIA" nos resumos de dashboard acima).
const LEADS_PREVIEW_COLUMNS = [
  "id", "tenant_id", "name", "company", "status", "stage_id", `"stageId"`, "pipeline_id", `"pipelineId"`,
  "temperature", "priority", "source", "seller", "seller_id", "value", "email", "phone",
  `"scoreIA"`, "score_ia", "date", "created_at", "updated_at", "title", `"productIds"`,
  `"clientId"`, `"clientName"`, "filial_id", "document_id", "cnpj",
].join(",");

app.get("/api/crm/leads-list", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const cacheKey = `crm-leads-list:tenant:${tenantId}`;

    const cached = await cacheGet<any[]>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json({ data: cached });
    }

    const sb = req.supabase;
    const { data, error } = await sb.from("leads").select(LEADS_PREVIEW_COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(8000);
    if (error) {
      console.error("[crm/leads-list]", error.message);
      return res.status(500).json({ error: "Erro ao buscar leads." });
    }

    await cacheSet(cacheKey, data || [], 20);
    res.setHeader("X-Cache", "MISS");
    return res.json({ data: data || [] });
  } catch (err: any) {
    console.error("[crm/leads-list]", err?.message);
    return res.status(500).json({ error: "Erro ao buscar leads." });
  }
});

/**
 * Preview cacheado de `clientes` pra src/pages/crm/Clientes.tsx — mesma
 * lógica do preview de leads acima (Redis, TTL curto de 20s, nunca é a
 * fonte de verdade). Na prática volta no máximo 1000 linhas — teto do
 * projeto Supabase (db-max-rows), não do `.limit()` abaixo (ver comentário
 * detalhado no preview de leads). A tela continua com sua própria busca
 * completa sem esse teto, que sempre sobrescreve quando termina.
 */
app.get("/api/crm/clientes-list", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const cacheKey = `crm-clientes-list:tenant:${tenantId}`;

    const cached = await cacheGet<any[]>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json({ data: cached });
    }

    const sb = req.supabase;
    const { data, error } = await sb.from("clientes").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(2000);
    if (error) {
      console.error("[crm/clientes-list]", error.message);
      return res.status(500).json({ error: "Erro ao buscar clientes." });
    }

    await cacheSet(cacheKey, data || [], 20);
    res.setHeader("X-Cache", "MISS");
    return res.json({ data: data || [] });
  } catch (err: any) {
    console.error("[crm/clientes-list]", err?.message);
    return res.status(500).json({ error: "Erro ao buscar clientes." });
  }
});

/**
 * Preview cacheado de `products` pro catálogo (src/pages/operative/Produtos.tsx,
 * via DataContext.tsx). Este é o único dos três (leads/clientes/products)
 * que já tinha algum cache — um sessionStorage de 5min por aba
 * (cachedFetchAllRowsForTenant, ver DataContext.tsx), que cobre trocar de
 * tenant e voltar na MESMA aba. Este preview cobre a lacuna que aquele não
 * cobre: o primeiro carregamento de uma aba/dispositivo novo, compartilhado
 * entre usuários do mesmo tenant. TTL um pouco mais folgado (30s) porque
 * catálogo de produto muda com menos frequência que lead. Na prática volta
 * no máximo 1000 linhas — teto do projeto Supabase (db-max-rows), não do
 * `.limit()` abaixo (ver comentário detalhado no preview de leads).
 */
app.get("/api/operative/produtos-list", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const cacheKey = `operative-produtos-list:tenant:${tenantId}`;

    const cached = await cacheGet<any[]>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json({ data: cached });
    }

    const sb = req.supabase;
    const { data, error } = await sb.from("products").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(2000);
    if (error) {
      console.error("[operative/produtos-list]", error.message);
      return res.status(500).json({ error: "Erro ao buscar produtos." });
    }

    await cacheSet(cacheKey, data || [], 30);
    res.setHeader("X-Cache", "MISS");
    return res.json({ data: data || [] });
  } catch (err: any) {
    console.error("[operative/produtos-list]", err?.message);
    return res.status(500).json({ error: "Erro ao buscar produtos." });
  }
});

/**
 * Preview cacheado de `reunioes` pra Agenda/CRM (AgendaCRM.tsx,
 * src/pages/reunioes/index.tsx) — mesmo padrão de leads acima. Hoje é a
 * MAIOR tabela do maior tenant (4.644 linhas), e tem colunas de texto longo
 * (transcricao/relatorio_ia/relatorio/notas_closer/pauta — IA e anotações de
 * reunião) que uma visão de agenda/calendário não precisa pra desenhar os
 * blocos de evento; excluídas aqui pela mesma razão do customFields em
 * leads (mesmo medindo ~2,9MB pra tudo hoje, essas colunas de texto livre
 * são as que mais podem crescer sem aviso). Na prática volta no máximo 1000
 * linhas — teto do projeto Supabase (db-max-rows), não do `.limit()` abaixo
 * (ver comentário detalhado no preview de leads).
 */
const REUNIOES_PREVIEW_COLUMNS = [
  "id", "tenant_id", `"leadId"`, `"leadName"`, `"companyName"`, `"closerName"`,
  `"scheduledAt"`, `"durationMinutes"`, "status", `"meetLink"`, `"googleEventId"`,
  `"createdAt"`, `"clienteId"`,
].join(",");

app.get("/api/crm/reunioes-list", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const cacheKey = `crm-reunioes-list:tenant:${tenantId}`;

    const cached = await cacheGet<any[]>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json({ data: cached });
    }

    const sb = req.supabase;
    const { data, error } = await sb.from("reunioes").select(REUNIOES_PREVIEW_COLUMNS).eq("tenant_id", tenantId).order("createdAt", { ascending: false }).limit(8000);
    if (error) {
      console.error("[crm/reunioes-list]", error.message);
      return res.status(500).json({ error: "Erro ao buscar reuniões." });
    }

    await cacheSet(cacheKey, data || [], 20);
    res.setHeader("X-Cache", "MISS");
    return res.json({ data: data || [] });
  } catch (err: any) {
    console.error("[crm/reunioes-list]", err?.message);
    return res.status(500).json({ error: "Erro ao buscar reuniões." });
  }
});

/**
 * Preview cacheado de `finance_entries` — a mesma array crua alimenta várias
 * telas do Financeiro que ainda listam registro a registro (Cobranças,
 * Conciliação, Contas Bancárias, Extrato — as telas de relatório/KPI já têm
 * seus próprios resumos cacheados acima e usam este array só como fallback).
 * Um único preview aqui acelera a pintura inicial de todas elas de uma vez.
 * Exclui colunas de baixo uso em lista (notes, recurring_frequency,
 * recurring_group_id, is_recurring, competencia_date, division_group_id,
 * numero_documento) — nenhuma é volumosa hoje, mas reduz o overhead fixo de
 * nome de coluna repetido por linha e dá mais margem pra crescer. Na
 * prática volta no máximo 1000 linhas — teto do projeto Supabase
 * (db-max-rows), não do `.limit()` abaixo (ver comentário detalhado no
 * preview de leads).
 */
const FINANCE_ENTRIES_PREVIEW_COLUMNS = [
  "id", "tenant_id", "description", "category", "category_id", "status", "value", "type",
  "date", "date_normalized", "created_at", "filial_id", "payment_method", "counterparty",
  "installment_number", "installment_total", "installment_group_id", "centro_custo_id",
  "conta_bancaria_id", "tags", "contato_id",
].join(",");

app.get("/api/finance/entries-list", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const cacheKey = `finance-entries-list:tenant:${tenantId}`;

    const cached = await cacheGet<any[]>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json({ data: cached });
    }

    const sb = req.supabase;
    const { data, error } = await sb.from("finance_entries").select(FINANCE_ENTRIES_PREVIEW_COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(8000);
    if (error) {
      console.error("[finance/entries-list]", error.message);
      return res.status(500).json({ error: "Erro ao buscar lançamentos." });
    }

    await cacheSet(cacheKey, data || [], 20);
    res.setHeader("X-Cache", "MISS");
    return res.json({ data: data || [] });
  } catch (err: any) {
    console.error("[finance/entries-list]", err?.message);
    return res.status(500).json({ error: "Erro ao buscar lançamentos." });
  }
});

/**
 * Preview cacheado de `tasks` — alimenta WorkloadBento.tsx (visão tipo
 * board/carga de trabalho, precisa do array completo pra desenhar colunas
 * por responsável/status, mesma razão do Pipeline de leads). Tabela pequena
 * hoje (poucas dezenas de linhas nos dois tenants ativos), mas cresce com
 * uso — mesmo critério de leads/reuniões/finance_entries: tarefa recorrente
 * de negócio, não catálogo/config. `select("*")` sem exclusão de coluna —
 * sem bloat nenhum aqui (description é texto curto de tarefa).
 */
app.get("/api/operative/tasks-list", requireUser, async (req: any, res) => {
  try {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const cacheKey = `operative-tasks-list:tenant:${tenantId}`;

    const cached = await cacheGet<any[]>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json({ data: cached });
    }

    const sb = req.supabase;
    const { data, error } = await sb.from("tasks").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1000);
    if (error) {
      console.error("[operative/tasks-list]", error.message);
      return res.status(500).json({ error: "Erro ao buscar tarefas." });
    }

    await cacheSet(cacheKey, data || [], 20);
    res.setHeader("X-Cache", "MISS");
    return res.json({ data: data || [] });
  } catch (err: any) {
    console.error("[operative/tasks-list]", err?.message);
    return res.status(500).json({ error: "Erro ao buscar tarefas." });
  }
});

/**
 * Preview cacheado genérico pras tabelas restantes carregadas pelo
 * DataContext (notifications, proposal_items, lead_activities,
 * colaboradores, students, turmas, finance_bank_accounts,
 * finance_transfers, finance_attachments, finance_commission_entries,
 * marketing_automations/forms/content/campaigns, education_content,
 * aurora_agents, indicacoes, scheduled_exports, finance_period_locks) —
 * todas hoje com poucas dezenas de linhas ou vazias nos dois tenants
 * ativos, mas mesmo critério de completude do resto do cache: um único
 * endpoint com allowlist explícita em vez de 19 quase idênticos.
 * `contracts` e `proposals` ficam de fora de propósito — os setState reais
 * deles carregam flags (contractsLoaded/proposalsLoaded) que travam lógica
 * de reconciliação contra duplicação (bug já corrigido antes nesta sessão);
 * uma prévia parcial nunca deve tocar nelas.
 */
const GENERIC_PREVIEW_TABLES = new Set([
  "notifications", "proposal_items", "lead_activities", "colaboradores", "students", "turmas",
  "finance_bank_accounts", "finance_transfers", "finance_attachments", "finance_commission_entries",
  "marketing_automations", "marketing_forms", "marketing_content", "marketing_campaigns",
  "education_content", "aurora_agents", "indicacoes", "scheduled_exports", "finance_period_locks",
]);

app.get("/api/data/table-preview", requireUser, async (req: any, res) => {
  try {
    const table = typeof req.query.table === "string" ? req.query.table : "";
    if (!GENERIC_PREVIEW_TABLES.has(table)) {
      return res.status(400).json({ error: "Tabela não permitida para preview." });
    }
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const cacheKey = `data-preview:tenant:${tenantId}:${table === "students" || table === "turmas" || table === "education_content" ? `user:${req.user.id}:` : ""}${table}`;

    const cached = await cacheGet<any[]>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json({ data: cached });
    }

    const sb = req.supabase;
    const { data, error } = await sb.from(table).select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1000);
    if (error) {
      console.error(`[data/table-preview:${table}]`, error.message);
      return res.status(500).json({ error: "Erro ao buscar dados." });
    }

    await cacheSet(cacheKey, data || [], 30);
    res.setHeader("X-Cache", "MISS");
    return res.json({ data: data || [] });
  } catch (err: any) {
    console.error("[data/table-preview]", err?.message);
    return res.status(500).json({ error: "Erro ao buscar dados." });
  }
});

// ── API PÚBLICA ────────────────────────────────────────────────────────────

// Fire-and-forget: nunca aguarda nem propaga erro pro chamador real — uma
// falha aqui não pode derrubar/atrasar a chamada de quem depende da API
// (landing page, Zapier/Make, ERP de cliente). Só 8 primeiros chars da chave,
// nunca a chave inteira.
function logApiKeyUsage(req: express.Request, statusCode: number) {
  if (!supabaseService) return;
  const key = req.headers["x-api-key"] as string | undefined;
  supabaseService
    .from("api_key_usage_log")
    .insert({
      tenant_id: (req as any).tenantId ?? null,
      api_key_prefix: key ? key.slice(0, 8) : "unknown",
      method: req.method,
      path: req.path,
      status_code: statusCode,
      ip: req.ip ?? null,
    })
    .then(({ error }: { error: any }) => {
      if (error) console.warn("[API Keys] Falha ao gravar log de uso:", error.message);
    });
}

// Espelha customFields.reservation (quando presente) na agenda comercial
// (tabela reunioes) — reaproveita a tela de Agenda/Calendário existente pra
// mostrar reservas de sistemas externos (ex.: to na pista) como compromissos,
// já que não existe hoje uma tela de calendário genérica separada de vendas.
// Upsert por id = reservation.id, então reprocessar a mesma reserva (retry,
// migração re-rodada) atualiza em vez de duplicar. Best-effort: falha aqui
// nunca derruba a criação/atualização do lead.
async function syncReuniaoFromReservation(
  reservation: any, tenantId: string, leadId: string, leadName: string, leadEmail: string, company: string
) {
  if (!reservation?.id || !reservation?.date) return;
  const s = String(reservation.status || "").toLowerCase();
  const reuniaoStatus = s.includes("cancel") || s.includes("no-show") || s.includes("no show")
    || s.includes("não compare") || s.includes("nao compare") ? "Cancelada"
    : s.includes("check") ? "Concluída"
    : "Agendada";
  const time = reservation.time ? String(reservation.time).slice(0, 8) : "00:00:00";
  const scheduledAt = `${reservation.date}T${time}`;
  const durationMinutes = Math.max(30, Math.round((Number(reservation.duration) || 1) * 60));
  const pauta = `Reserva de Boliche${reservation.eventType ? " - " + reservation.eventType : ""}`;
  const relatorio = [
    reservation.peopleCount ? `${reservation.peopleCount} pessoa(s)` : null,
    reservation.laneCount ? `${reservation.laneCount} pista(s)` : null,
    reservation.totalValue != null ? `R$ ${reservation.totalValue}` : null,
  ].filter(Boolean).join(" · ");

  const { error } = await supabaseService!.from("reunioes").upsert({
    id: reservation.id,
    leadId, leadName, leadEmail, companyName: company || "",
    closerName: "", closerEmail: "",
    scheduledAt, durationMinutes,
    status: reuniaoStatus, pauta, relatorio,
    tenant_id: tenantId,
  }, { onConflict: "id" });
  if (error) console.error("[API v1] Falha ao sincronizar reunião/agenda:", error.message);
}

app.post("/api/v1/leads", requireApiKey, async (req, res) => {
  const {
    name, company = "", email = "", phone = "", cnpj = "",
    title = "", seller = "", source = "", status = "Novo",
    priority = "Média", value = 0, stageId = "sdr-1",
    pipelineId = "sdr", lead_interesse_cliente = "",
    customFields = {}, clientId = FORM_CLIENT_ID, clientName = "",
    productIds = [],
    tenantName = ""
  } = req.body;

  if (!name) { logApiKeyUsage(req, 400); return res.status(400).json({ error: "O campo 'name' é obrigatório." }); }
  if (!email && !phone) { logApiKeyUsage(req, 400); return res.status(400).json({ error: "Informe ao menos 'email' ou 'phone'." }); }
  if (!supabaseService) { logApiKeyUsage(req, 503); return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." }); }

  const tenantId = (req as any).tenantId;
  const now = new Date().toISOString().split("T")[0];
  const rawValue = typeof value === "string"
    ? parseFloat(value.replace(/[^\d.,]/g, "").replace(",", ".")) || 0
    : (value ?? 0);
  const normalizedPhone = phone ? String(phone).replace(/\D/g, "") : "";
  const normalizedEmail = email ? String(email).trim().toLowerCase() : "";

  // Dedup por tenant, por telefone/e-mail — evita criar um lead novo a cada chamada
  // pro mesmo contato (ex.: integrações que reportam um evento por cliente, como
  // reservas recorrentes de um sistema de agendamento). Duas queries com .eq()
  // (parametrizadas pelo supabase-js) em vez de um único .or() com string
  // concatenada — phone/email vêm de fora via x-api-key (sem sessão de usuário), e
  // um .or() interpolado permitiria injetar filtros extra na sintaxe do PostgREST
  // (valor contendo vírgula/parênteses).
  let existing: any = null;
  if (normalizedPhone) {
    const { data } = await supabaseService.from("leads").select("id, customFields")
      .eq("tenant_id", tenantId).eq("phone", normalizedPhone).limit(1).maybeSingle();
    existing = data;
  }
  if (!existing && normalizedEmail) {
    const { data } = await supabaseService.from("leads").select("id, customFields")
      .eq("tenant_id", tenantId).eq("email", normalizedEmail).limit(1).maybeSingle();
    existing = data;
  }

  // customFields.reservation (se vier) é acumulado num histórico, deduplicado por
  // id e limitado às últimas 30 entradas — assim tanto uma chamada avulsa quanto
  // uma migração em massa (uma chamada por reserva, em ordem cronológica) resultam
  // no mesmo lead único por contato com o histórico completo.
  const prevCustomFields = existing?.customFields || {};
  const prevHistory = Array.isArray(prevCustomFields.reservationsHistory) ? prevCustomFields.reservationsHistory : [];
  const incomingReservation = customFields?.reservation;
  const mergedHistory = incomingReservation
    ? [...prevHistory.filter((h: any) => h?.id !== incomingReservation.id), incomingReservation].slice(-30)
    : prevHistory;
  const mergedCustomFields = {
    ...prevCustomFields,
    ...customFields,
    reservationsHistory: mergedHistory,
    totalReservations: mergedHistory.length,
  };

  if (existing) {
    // Uma chamada sem reserva (ex.: cadastro avulso de cliente no CRM interno
    // do chamador) nunca deve regredir um lead que já tem histórico de
    // reserva — senão um cliente com reserva confirmada volta pra etapa
    // "Agendado" e perde o valor só porque foi re-cadastrado. Só move
    // etapa/produto/valor quando a chamada realmente traz uma reserva nova,
    // ou quando o lead ainda não tinha nenhuma reserva registrada.
    const canAdvanceStage = !!incomingReservation || prevHistory.length === 0;
    const updatePayload: Record<string, any> = {
      name, company, email: normalizedEmail, phone: normalizedPhone, cnpj,
      priority, source, customFields: mergedCustomFields, tenantName,
      updated_at: new Date().toISOString(),
    };
    if (canAdvanceStage) {
      updatePayload.value = rawValue;
      updatePayload.status = status;
      updatePayload.stageId = stageId;
      updatePayload.pipelineId = pipelineId;
      updatePayload.productIds = productIds;
    }
    const { data, error } = await supabaseService.from("leads").update(updatePayload).eq("id", existing.id).select().maybeSingle();
    if (error) {
      console.error("[API v1] Erro ao atualizar lead:", error.message);
      logApiKeyUsage(req, 500);
      return res.status(500).json({ error: "Falha ao atualizar lead no banco." });
    }
    if (incomingReservation) await syncReuniaoFromReservation(incomingReservation, tenantId, existing.id, name, normalizedEmail, company);
    // syncProposalFromReservation foi REMOVIDO daqui (2026-09-19): a receita
    // de reserva agora é mantida por um pipeline dedicado e determinístico
    // (POST /api/v1/finance-entries, chamado por sync-to-spy a cada update de
    // reserva — ver to-na-pista-boliche/supabase/functions/sync-to-spy). Criar
    // uma "proposta" por reserva aqui duplicava a receita (via a reconciliação
    // proposals→contracts→finance_entries do DataContext.tsx, rodando no
    // browser de quem tiver o Spy aberto) E causava uma rajada de milhares de
    // PATCH em `contracts` de uma vez só quando muitas reservas fechavam junto
    // (ex.: sync em massa) — o mesmo padrão de storm já visto antes nesse
    // arquivo, só que disparado por reserva em vez de por tenant cruzado.
    logApiKeyUsage(req, 200);
    return res.status(200).json({ success: true, lead: data, deduped: true });
  }

  // tenant_id vem só da API key (nunca do corpo da requisição) — ver requireApiKey.
  // "createdAt" NÃO existe na tabela (só "created_at", que já tem default
  // now()) — o insert falhava sempre com 42703 antes desta correção.
  const id = randomUUID();
  const newLead = {
    id, name, company, email: normalizedEmail, phone: normalizedPhone, cnpj, title, seller, source,
    status, priority, value: rawValue, stageId, pipelineId,
    lead_interesse_cliente, customFields: mergedCustomFields, clientId, clientName,
    productIds, tenant_id: tenantId, tenantName, scoreIA: 50, date: now,
  };

  const { data, error } = await supabaseService.from("leads").insert(newLead).select().maybeSingle();
  if (error) {
    console.error("[API v1] Erro ao criar lead:", error.message);
    logApiKeyUsage(req, 500);
    return res.status(500).json({ error: "Falha ao salvar lead no banco." });
  }
  if (incomingReservation) await syncReuniaoFromReservation(incomingReservation, tenantId, id, name, normalizedEmail, company);
  // syncProposalFromReservation removido aqui também — mesmo motivo do bloco
  // de update acima.
  logApiKeyUsage(req, 201);
  return res.status(201).json({ success: true, lead: data ?? newLead, deduped: false });
});

app.get("/api/v1/leads", requireApiKey, async (req, res) => {
  if (!supabaseService) { logApiKeyUsage(req, 503); return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." }); }

  const { seller, status, limit = "100", offset = "0" } = req.query as Record<string, string>;

  // tenant_id vem só da API key (nunca de query string) — ver requireApiKey.
  let query = supabaseService.from("leads").select("*").eq("tenant_id", (req as any).tenantId)
    .order("created_at", { ascending: false })
    .limit(parseInt(limit)).range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  if (seller) query = query.eq("seller", seller);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    console.error("[API v1] Erro ao buscar leads:", error.message);
    logApiKeyUsage(req, 500);
    return res.status(500).json({ error: "Falha ao buscar leads." });
  }
  logApiKeyUsage(req, 200);
  return res.json({ success: true, count: data?.length ?? 0, leads: data ?? [] });
});

// Registra uma atividade (nota, ligação, avaliação, sugestão etc.) no
// histórico de um lead já existente — usado por integrações "ao vivo" que
// não têm outro dado além de um evento pontual pra reportar (ex.: to-na-pista-
// boliche registrando uma interação de CRM interna). Nunca cria lead: se o
// contato (telefone/e-mail) não tiver lead correspondente nesse tenant, a
// atividade é descartada (best-effort, sem erro pro chamador) — não faz
// sentido um histórico de atividade "pendurado" sem lead dono.
app.post("/api/v1/lead-activities", requireApiKey, async (req, res) => {
  const {
    phone = "", email = "", type = "Nota", title = "", description = "",
    date = "", seller = "", externalId = "",
  } = req.body;

  if (!title) { logApiKeyUsage(req, 400); return res.status(400).json({ error: "O campo 'title' é obrigatório." }); }
  if (!phone && !email) { logApiKeyUsage(req, 400); return res.status(400).json({ error: "Informe ao menos 'phone' ou 'email'." }); }
  if (!supabaseService) { logApiKeyUsage(req, 503); return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." }); }

  const tenantId = (req as any).tenantId;
  const normalizedPhone = phone ? String(phone).replace(/\D/g, "") : "";
  const normalizedEmail = email ? String(email).trim().toLowerCase() : "";

  // Mesma lógica de resolução de contato do POST /api/v1/leads (telefone
  // primeiro, e-mail como fallback) — ver ali o porquê de duas queries .eq()
  // em vez de um .or() concatenado.
  let lead: any = null;
  if (normalizedPhone) {
    const { data } = await supabaseService.from("leads").select("id")
      .eq("tenant_id", tenantId).eq("phone", normalizedPhone).limit(1).maybeSingle();
    lead = data;
  }
  if (!lead && normalizedEmail) {
    const { data } = await supabaseService.from("leads").select("id")
      .eq("tenant_id", tenantId).eq("email", normalizedEmail).limit(1).maybeSingle();
    lead = data;
  }
  if (!lead) { logApiKeyUsage(req, 200); return res.status(200).json({ success: true, skipped: true, reason: "Nenhum lead encontrado pra esse contato." }); }

  // Idempotência: reenvio do mesmo evento externo (retry, reprocessamento)
  // nunca duplica a atividade — mesma estratégia de id determinístico usada
  // na migração em massa original (`tnp_interacao_<id>` etc.), só que
  // genérica pra qualquer origem externa daqui em diante.
  const id = externalId ? `tnp_live_${externalId}` : randomUUID();
  const { error } = await supabaseService.from("lead_activities").upsert({
    id, tenant_id: tenantId, lead_id: lead.id, type, title, description,
    date: date || new Date().toISOString().split("T")[0], seller,
  }, { onConflict: "id", ignoreDuplicates: true });

  if (error) {
    console.error("[API v1] Erro ao criar lead_activity:", error.message);
    logApiKeyUsage(req, 500);
    return res.status(500).json({ error: "Falha ao salvar atividade no banco." });
  }
  logApiKeyUsage(req, 201);
  return res.status(201).json({ success: true });
});

// Cria/atualiza um lançamento financeiro a partir de uma fonte externa (ex.:
// fechamento mensal do to-na-pista-boliche). Upsert de verdade (não ignora
// conflito) porque um mês já lançado pode ser revisado depois — o valor mais
// recente pro mesmo externalId deve substituir o anterior.
app.post("/api/v1/finance-entries", requireApiKey, async (req, res) => {
  const {
    externalId = "", description = "", value = 0, date = "",
    category = "", type = "Receber", status = "Pago",
  } = req.body;

  if (!externalId) { logApiKeyUsage(req, 400); return res.status(400).json({ error: "O campo 'externalId' é obrigatório." }); }
  if (!description) { logApiKeyUsage(req, 400); return res.status(400).json({ error: "O campo 'description' é obrigatório." }); }
  if (!supabaseService) { logApiKeyUsage(req, 503); return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." }); }

  const tenantId = (req as any).tenantId;
  const rawValue = typeof value === "string"
    ? parseFloat(value.replace(/[^\d.,]/g, "").replace(",", ".")) || 0
    : (value ?? 0);
  const id = `tnp_fat_${externalId}`;

  const { error } = await supabaseService.from("finance_entries").upsert({
    id, tenant_id: tenantId, description, value: rawValue,
    date: date || new Date().toISOString().split("T")[0],
    category, type, status,
  }, { onConflict: "id" });

  if (error) {
    console.error("[API v1] Erro ao criar finance_entry:", error.message);
    logApiKeyUsage(req, 500);
    return res.status(500).json({ error: "Falha ao salvar lançamento no banco." });
  }
  logApiKeyUsage(req, 201);
  return res.status(201).json({ success: true });
});

// ── Captação pública do site de marketing (InteractiveForm.tsx, /f/:niche) ──
//
// Antes disso, o formulário só fazia `console.log('Lead Capturado', ...)` e
// mostrava "Nossa equipe já recebeu seus dados" — mentira: ninguém recebia
// nada. Isso é o site de marketing do próprio S.P.Y. (não um formulário
// embutido no site de um tenant cliente), então o lead vai para o tenant
// configurado em SPY_FORM_TENANT_ID — variável que já existia documentada em
// .env.example (ao lado de SPY_FORM_CLIENT_ID) mas nunca tinha sido lida em
// lugar nenhum do código até agora.
app.post("/api/public/lead-capture", async (req, res) => {
  const { niche, name, phone, email, summary } = req.body ?? {};
  if (!name?.toString().trim()) return res.status(400).json({ error: "Nome é obrigatório." });

  const tenantId = process.env.SPY_FORM_TENANT_ID || process.env.AXIS_FORM_TENANT_ID;
  if (!tenantId) return res.status(503).json({ error: "Captação de leads do site não está configurada neste ambiente." });
  if (!supabaseService) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." });

  const id = randomUUID();
  const now = new Date().toISOString().split("T")[0];
  const newLead = {
    id,
    name: name.toString().trim().slice(0, 200),
    email: email?.toString().trim().slice(0, 200) || "",
    phone: phone?.toString().trim().slice(0, 30) || "",
    source: `Formulário do site (${niche || "não identificado"})`,
    status: "Novo",
    priority: "Média",
    value: 0,
    notes: summary?.toString().slice(0, 4000) || "",
    tenant_id: tenantId,
    scoreIA: 50,
    date: now,
  };

  try {
    const { error } = await supabaseService.from("leads").insert(newLead);
    if (error) throw new Error(error.message);
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[public/lead-capture]", err?.message);
    return res.status(500).json({ error: "Erro ao registrar sua inscrição. Tente novamente em instantes." });
  }
});

// ── Tenant Theme Discovery (Público para tela de login) ──────────────────────
app.get("/api/auth/tenant-theme", async (req, res) => {
  const { email, host, tenant } = req.query as Record<string, string>;
  const client = supabaseService || supabase;
  if (!client) {
    return res.status(503).json({ error: "Supabase client indisponível." });
  }

  try {
    // E-mail é ignorado de propósito: qualquer resposta diferente revelaria se a conta existe.
    void email;

    // 2. Se informou host ou tenant específico
    const searchTarget = tenant || host || "";
    if (searchTarget.trim()) {
      const cleanTarget = searchTarget.trim().toLowerCase();
      const hostClean = cleanTarget.replace(/^https?:\/\//, "").split(":")[0];
      const hostParts = hostClean
        .split(".")
        .filter((p) => p.length > 2 && !["com", "br", "app", "io", "net", "crm", "axis-crm", "localhost"].includes(p));

      const { data: activeTenants } = await client
        .from("tenants")
        .select("id, name, primary_color")
        .eq("status", "Active");

      if (activeTenants && activeTenants.length > 0) {
        for (const t of activeTenants) {
          const tName = t.name.toLowerCase();
          // Igualdade exata (não substring) para não permitir enumerar tenants por prefixo.
          if (hostParts.some((hp) => tName === hp) || tName === cleanTarget) {
            return res.json({
              primaryColor: t.primary_color || null,
              tenantName: t.name,
              tenantId: t.id,
              matchedBy: "host_or_tenant",
            });
          }
        }
      }
    }

    // 3. Fallback: nenhum tenant identificado
    return res.json({
      primaryColor: null,
      tenantName: "",
      tenantId: "",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Implementação: link público em que o CLIENTE preenche a parte dele ───────
// Segurança = token aleatório (implementations.share_token, 24 bytes hex) +
// service role, mesmo padrão de /api/public-proposal. O token NUNCA vale como
// acesso a outro registro; só campos com audience "client" saem e entram por
// aqui (status de integração, checklist de go-live e notas internas não).
const implClientData = (data: Record<string, any>) => {
  const ids = new Set(implAllFields("client").map(f => f.id));
  return Object.fromEntries(Object.entries(data || {}).filter(([k]) => ids.has(k)));
};

async function loadImplementationByToken(token: string) {
  if (!supabaseService) return { error: 503 as const };
  if (!token || token.length < 32 || token.length > 128) return { error: 400 as const };
  const { data: impl } = await supabaseService
    .from("implementations")
    .select("id, tenant_id, cliente_id, status, data, go_live_date, started_at")
    .eq("share_token", token)
    .maybeSingle();
  if (!impl) return { error: 404 as const };
  return { impl };
}

app.get("/api/public-implementation/:token", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const r = await loadImplementationByToken(req.params.token);
  if ("error" in r) {
    return res.status(r.error).json({ error: r.error === 503 ? "Servidor indisponível." : r.error === 400 ? "Link inválido." : "Link não encontrado ou expirado." });
  }
  const { impl } = r;
  const [{ data: cliente }, { data: tenant }] = await Promise.all([
    supabaseService!.from("clientes").select("name").eq("id", impl.cliente_id).maybeSingle(),
    supabaseService!.from("tenants").select("name, primary_color").eq("id", impl.tenant_id).maybeSingle(),
  ]);
  return res.json({
    clienteNome: cliente?.name || "Cliente",
    tenant: { name: tenant?.name || "", primary_color: tenant?.primary_color || null },
    status: impl.status,
    goLiveDate: impl.go_live_date,
    startedAt: impl.started_at,
    data: implClientData(impl.data),
    editable: impl.status !== "Concluída",
  });
});

app.patch("/api/public-implementation/:token", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const r = await loadImplementationByToken(req.params.token);
  if ("error" in r) {
    return res.status(r.error).json({ error: r.error === 503 ? "Servidor indisponível." : r.error === 400 ? "Link inválido." : "Link não encontrado ou expirado." });
  }
  const { impl } = r;
  if (impl.status === "Concluída") return res.status(409).json({ error: "Esta implementação já foi concluída e não recebe mais alterações." });

  const fields = req.body?.fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields) || Object.keys(fields).length > 100) {
    return res.status(400).json({ error: "Envie { fields: { campo: valor } } com até 100 campos." });
  }
  const { clean, rejected } = implSanitizePatch(fields, "client");
  if (Object.keys(clean).length === 0) return res.json({ ok: true, rejected, data: implClientData(impl.data) });

  const merged = implApplyPatch(impl.data || {}, clean);
  const update: Record<string, any> = { data: merged };
  // O cliente respondeu — deixa de estar "aguardando" ele.
  if (impl.status === "Aguardando cliente") update.status = "Em andamento";
  const { error } = await supabaseService!.from("implementations").update(update).eq("id", impl.id);
  if (error) return res.status(500).json({ error: "Não foi possível salvar." });
  return res.json({ ok: true, rejected, data: implClientData(merged) });
});

// ── Implementação: puxar dados do ambiente SPY que o cliente já tem ─────────
// Só MASTER (equipe da plataforma) — lê outro tenant com service role. A
// implementação precisa ser acessível pelo próprio solicitante (RLS) antes de
// qualquer leitura cruzada. Nunca copia senha nem chave/token (ver
// server/implementationSync.ts); só preenche campo vazio e sobe status.
app.post("/api/implementations/:id/sync-tenant", requireUser, requireMaster, async (req: any, res) => {
  if (!supabaseService) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." });
  const tenantId = String(req.body?.tenantId || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) return res.status(400).json({ error: "tenantId inválido." });

  const { data: impl } = await req.supabase.from("implementations").select("id, tenant_id, data").eq("id", req.params.id).maybeSingle();
  if (!impl) return res.status(404).json({ error: "Implementação não encontrada." });
  if (impl.tenant_id === tenantId) return res.status(400).json({ error: "Escolha o ambiente do CLIENTE, não o da sua própria empresa." });

  try {
    const snapshot = await readTenantSnapshot(supabaseService, tenantId);
    if (!snapshot) return res.status(404).json({ error: "Ambiente do cliente não encontrado." });
    const { data, filled, statusRaised } = implApplyTenantSnapshot(impl.data || {}, snapshot);
    const syncedAt = new Date().toISOString();
    const { error } = await req.supabase.from("implementations").update({ data, linked_tenant_id: tenantId, last_synced_at: syncedAt }).eq("id", impl.id);
    if (error) return res.status(500).json({ error: "Não foi possível salvar a sincronização." });
    return res.json({ ok: true, tenantName: snapshot.tenantName, data, syncedAt, filled, statusRaised, usuarios: snapshot.users.length });
  } catch (err: any) {
    console.error("[sync-tenant]", err?.message);
    return res.status(500).json({ error: "Falha ao ler o ambiente do cliente." });
  }
});

// ── Implementação: configurar as integrações do cliente DE FORA ─────────────
// Só MASTER. O tenant-alvo vem SEMPRE da implementação (linked_tenant_id,
// lido sob RLS do solicitante) — nunca do corpo da requisição, então não dá
// pra apontar a escrita pra um ambiente arbitrário. Segredos (chaves/tokens)
// só entram: a leitura devolve "definido/não definido", nunca o valor, e
// regravar com segredo vazio mantém o que já existe. Valores nunca vão pro
// log — só quais campos mudaram.
async function loadLinkedImplementation(req: any, res: any) {
  if (!supabaseService) { res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." }); return null; }
  const { data: impl } = await req.supabase.from("implementations").select("id, tenant_id, linked_tenant_id").eq("id", req.params.id).maybeSingle();
  if (!impl) { res.status(404).json({ error: "Implementação não encontrada." }); return null; }
  if (!impl.linked_tenant_id) { res.status(409).json({ error: "Vincule a implementação ao ambiente do cliente antes de configurar as integrações." }); return null; }
  if (impl.linked_tenant_id === impl.tenant_id) { res.status(400).json({ error: "O ambiente vinculado é o da sua própria empresa." }); return null; }
  return impl;
}

app.get("/api/implementations/:id/tenant-integrations", requireUser, requireMaster, async (req: any, res) => {
  const impl = await loadLinkedImplementation(req, res);
  if (!impl) return;
  const [{ data: tenant }, { data: rows }] = await Promise.all([
    supabaseService!.from("tenants").select("name").eq("id", impl.linked_tenant_id).maybeSingle(),
    supabaseService!.from("app_settings").select("key, value").eq("tenant_id", impl.linked_tenant_id).in("key", INTEGRATION_SETTING_KEYS),
  ]);
  const settings: Record<string, any> = {};
  for (const r of rows || []) settings[r.key] = r.value;
  return res.json({ tenantName: tenant?.name || "", integrations: INTEGRATION_DEFS.map((d) => implMaskedView(d, settings[d.settingsKey])) });
});

app.put("/api/implementations/:id/tenant-integrations/:integration", requireUser, requireMaster, async (req: any, res) => {
  const def = implGetIntegrationDef(req.params.integration);
  if (!def) return res.status(404).json({ error: "Integração desconhecida." });
  const impl = await loadLinkedImplementation(req, res);
  if (!impl) return;

  const { clean, errors } = implValidateIntegrationValues(def, req.body?.values || {});
  if (errors.length > 0) return res.status(400).json({ error: errors.join(" ") });
  const wantConnected = typeof req.body?.connected === "boolean" ? req.body.connected : undefined;

  const { data: row } = await supabaseService!.from("app_settings").select("value").eq("tenant_id", impl.linked_tenant_id).eq("key", def.settingsKey).maybeSingle();
  const { settingValue, missingRequired, connected } = implApplyIntegrationUpdate(def, row?.value, clean, wantConnected);
  if (wantConnected === true && !connected) return res.status(400).json({ error: `Faltam campos obrigatórios pra marcar como conectada: ${missingRequired.join(", ")}.` });

  const { error } = await supabaseService!.from("app_settings").upsert(
    { tenant_id: impl.linked_tenant_id, key: def.settingsKey, value: settingValue },
    { onConflict: "tenant_id,key" }
  );
  if (error) return res.status(500).json({ error: "Não foi possível gravar a integração." });
  console.info("[impl-integration]", JSON.stringify({ actor: req.user?.id, implementation: impl.id, tenant: impl.linked_tenant_id, integration: def.id, fields: Object.keys(clean), connected }));
  return res.json({ ok: true, missingRequired, integration: implMaskedView(def, settingValue) });
});

// ── Max Data (MaxAPI Go): testar conexão e importar "Entrada Nota Fiscal" ────
// A chave (application_key) é lida AQUI, no servidor, da config do tenant —
// o navegador nunca a manda nem a recebe de volta nestas rotas. O destino é
// validado contra SSRF antes de qualquer chamada. Só LEITURA no Max nesta
// etapa (nada de criar venda, emitir NF-e nem marcar conferida).
async function loadMaxdataConn(req: any, res: any, tenantId: string, which: "notas" | "estoque") {
  const key = which === "estoque" ? "integracoes_maxdata_estoque" : "integracoes_maxdata";
  const { data } = await req.supabase.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", key).maybeSingle();
  const parsed = maxConnFromConfig(data?.value || {});
  if ("error" in parsed) { res.status(409).json({ error: parsed.error }); return null; }
  try { await assertSafeHttpUrl(parsed.conn.baseUrl); } catch (e: any) { res.status(400).json({ error: `URL da API não permitida: ${e?.message || "inválida"}` }); return null; }
  return parsed.conn;
}

const maxErrorStatus = (e: any) => (e instanceof MaxDataError ? (e.status && e.status >= 400 && e.status < 500 ? 422 : 502) : 500);

app.post("/api/integrations/maxdata/test", requireUser, async (req: any, res) => {
  const tenantId = await resolveRequestedTenantId(req, res);
  if (!tenantId) return;
  const which = req.body?.which === "estoque" ? "estoque" : "notas";
  const conn = await loadMaxdataConn(req, res, tenantId, which);
  if (!conn) return;
  try {
    const { expiresAt } = await maxdataAuth(conn);
    let empresa: any = null;
    try {
      const body: any = await maxdataGet(conn, `/company/${conn.empId}`);
      const c = Array.isArray(body) ? body[0] : body;
      if (c) empresa = { fantasia: c.fantasia || null, razaoSocial: c.razaoSocial || null, cnpj: c.cnpj || null };
    } catch { /* login OK mas a rota de empresa negou/mudou — não invalida o teste de credenciais */ }
    return res.json({ ok: true, empresa, tokenExpiraEm: new Date(expiresAt + 60_000).toISOString() });
  } catch (e: any) {
    return res.status(maxErrorStatus(e)).json({ ok: false, error: e?.message || "Falha ao conectar à Max Data." });
  }
});

const kommoLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
registerKommoRoutes(app, { requireUser, resolveRequestedTenantId, limiter: kommoLimiter, supabaseService });

app.get("/api/varejo/maxdata/entries", requireUser, async (req: any, res) => {
  const tenantId = await resolveRequestedTenantId(req, res);
  if (!tenantId) return;
  const conn = await loadMaxdataConn(req, res, tenantId, "estoque");
  if (!conn) return;
  try {
    const { docs } = maxExtractDocs<MaxEntry>(await maxdataGet(conn, "/entry"));
    const ids = docs.map((d) => String(d.id));
    const { data: jaImportadas } = ids.length
      ? await req.supabase.from("notas_entrada").select("externo_id, id").eq("tenant_id", tenantId).eq("externo_sistema", "maxdata").neq("status", "Cancelada").in("externo_id", ids)
      : { data: [] as any[] };
    const importadas = new Map<string, string>((jaImportadas || []).map((n: any) => [n.externo_id, n.id]));
    const sortKey = (d: MaxEntry) => String(d.lancamento || d.emissao || "");
    const entries = [...docs].sort((a, b) => sortKey(b).localeCompare(sortKey(a))).slice(0, 200).map((d) => ({
      id: d.id, numeroNf: d.numeroNf ?? null, emissao: d.emissao ?? null, lancamento: d.lancamento ?? null,
      fornecedorNome: d.fornecedorNome ?? null, totalnf: d.totalnf ?? 0, status: d.status ?? null,
      conferida: !!d.data_conferencia, notaId: importadas.get(String(d.id)) ?? null,
    }));
    return res.json({ entries, total: docs.length });
  } catch (e: any) {
    return res.status(maxErrorStatus(e)).json({ error: e?.message || "Falha ao ler as entradas da Max Data." });
  }
});

app.post("/api/varejo/maxdata/entries/import", requireUser, async (req: any, res) => {
  const tenantId = await resolveRequestedTenantId(req, res);
  if (!tenantId) return;
  const ids: number[] = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : [];
  if (ids.length === 0 || ids.length > 20) return res.status(400).json({ error: "Envie de 1 a 20 entradas." });
  const conn = await loadMaxdataConn(req, res, tenantId, "estoque");
  if (!conn) return;

  // Catálogo do tenant, em páginas (o PostgREST corta em 1000 linhas).
  const products: any[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await req.supabase.from("products").select("id, name, sku, active, type_attributes")
      .eq("tenant_id", tenantId).is("deleted_at", null).range(from, from + 999);
    if (error) return res.status(500).json({ error: "Não foi possível ler o catálogo de produtos." });
    products.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const results: any[] = [];
  for (const id of ids) {
    try {
      const { data: ja } = await req.supabase.from("notas_entrada").select("id").eq("tenant_id", tenantId)
        .eq("externo_sistema", "maxdata").eq("externo_id", String(id)).neq("status", "Cancelada").maybeSingle();
      if (ja) { results.push({ id, ok: true, jaImportada: true, notaId: ja.id }); continue; }

      const headBody: any = await maxdataGet(conn, `/entry/${id}`);
      const entry: MaxEntry | undefined = Array.isArray(headBody) ? headBody[0] : headBody;
      if (!entry) { results.push({ id, ok: false, error: "Entrada não encontrada na Max Data." }); continue; }

      const items: MaxEntryItem[] = [];
      const first = maxExtractDocs<MaxEntryItem>(await maxdataGet(conn, `/entry/${id}/items`));
      items.push(...first.docs);
      for (let page = 2; page <= Math.min(first.pages, 20); page++) items.push(...maxExtractDocs<MaxEntryItem>(await maxdataGet(conn, `/entry/${id}/items?page=${page}`)).docs);

      const { nota, itens, ignorados } = mapMaxEntryToNota({ ...entry, id }, items);
      if (itens.length === 0) { results.push({ id, ok: false, error: "A entrada não tem itens com quantidade." }); continue; }

      const { data: criada, error } = await req.supabase.from("notas_entrada")
        .insert({ ...nota, tenant_id: tenantId, status: "Rascunho", created_by: req.user.id }).select("id").maybeSingle();
      if (error || !criada) { results.push({ id, ok: false, error: error?.code === "23505" ? "Já importada." : "Não foi possível salvar a nota." }); continue; }

      let vinculados = 0;
      const rows = itens.map((i) => {
        const match = findProductForItem(i, products);
        if (match) vinculados++;
        return { ...i, tenant_id: tenantId, nota_id: criada.id, product_id: match?.product.id ?? null, qtd_estoque: defaultQtdEstoque(i.quantidade) };
      });
      const { error: itensErr } = await req.supabase.from("nota_entrada_itens").insert(rows);
      if (itensErr) {
        await req.supabase.from("notas_entrada").delete().eq("id", criada.id);
        results.push({ id, ok: false, error: "Não foi possível salvar os itens." });
        continue;
      }
      results.push({ id, ok: true, notaId: criada.id, itens: itens.length, vinculados, ignorados });
    } catch (e: any) {
      results.push({ id, ok: false, error: e?.message || "Falha ao importar." });
    }
  }
  return res.json({ results });
});

// ── Public Proposal Authenticated Fetch with Full Multi-Tenant Branding ─────
app.get("/api/public-proposal/:token", async (req, res) => {
  const { token } = req.params;
  const client = supabaseService || supabase;
  if (!client) {
    return res.status(503).json({ error: "Supabase client indisponível." });
  }

  try {
    if (!token || token.length < 16) {
      return res.status(400).json({ error: "Token de proposta inválido." });
    }

    // 1. Busca a proposta pelo view_token
    const { data: proposal, error: propErr } = await client
      .from("proposals")
      .select("*")
      .eq("view_token", token)
      .maybeSingle();

    if (propErr || !proposal) {
      return res.status(404).json({ error: "Proposta não encontrada ou link expirado." });
    }

    // 2. Incrementa contador de visualização e timestamp de auditoria
    // TODO: view_count ler-e-somar não é atômico; exige RPC/migration para incremento atômico.
    await client
      .from("proposals")
      .update({
        view_count: (proposal.view_count || 0) + 1,
        last_viewed_at: new Date().toISOString(),
        first_viewed_at: proposal.first_viewed_at || new Date().toISOString(),
      })
      .eq("id", proposal.id);

    // 3. Busca itens da proposta
    const { data: items } = await client
      .from("proposal_items")
      .select("product_name, quantidade, preco_unitario")
      .eq("proposal_id", proposal.id)
      .order("created_at", { ascending: true });

    // 4. Busca dados do tenant responsável pela proposta
    let tenantData: any = null;
    if (proposal.tenant_id) {
      const { data: tenant } = await client
        .from("tenants")
        .select("id, name, primary_color, niche")
        .eq("id", proposal.tenant_id)
        .maybeSingle();
      tenantData = tenant;
    }

    // 5. Busca configurações corporativas (empresa_dados) do tenant
    let empresaDados: any = null;
    if (proposal.tenant_id) {
      const { data: setting } = await client
        .from("app_settings")
        .select("value")
        .eq("key", "empresa_dados")
        .eq("tenant_id", proposal.tenant_id)
        .maybeSingle();
      if (setting?.value) {
        empresaDados = setting.value;
      }
    }

    const tenantPrimaryColor = tenantData?.primary_color || "#2563EB";
    const tenantName =
      empresaDados?.nomeFantasia ||
      empresaDados?.razaoSocial ||
      tenantData?.name ||
      "Empresa Proponente";

    return res.json({
      id: proposal.id,
      titulo: proposal.titulo,
      cliente: proposal.cliente,
      valor: proposal.valor,
      status: proposal.status,
      validade: proposal.validade,
      tipo: proposal.tipo,
      conteudoTexto: proposal.conteudo_texto,
      criadaEm: proposal.created_at,
      vendedor: proposal.vendedor,
      tenantId: proposal.tenant_id,
      tenantName,
      tenantPrimaryColor,
      tenantNiche: tenantData?.niche || "",
      empresaDados: empresaDados || {
        razaoSocial: tenantName,
        nomeFantasia: tenantName,
        cnpj: "",
        emailContato: "",
        telefoneContato: "",
        endereco: "",
      },
      itens: (items || []).map((i: any) => ({
        productName: i.product_name,
        quantidade: i.quantidade,
        precoUnitario: i.preco_unitario,
      })),
    });
  } catch (err: any) {
    console.error("[public-proposal] Erro ao carregar proposta:", err?.message);
    return res.status(500).json({ error: "Erro interno ao processar proposta comercial." });
  }
});

app.post("/api/public-proposal/:token/accept", async (req, res) => {
  const { token } = req.params;
  const { clientName, clientDoc } = req.body || {};
  const client = supabaseService || supabase;
  if (!client) {
    return res.status(503).json({ error: "Supabase client indisponível." });
  }

  try {
    if (!token || token.length < 16) {
      return res.status(400).json({ error: "Token de proposta inválido." });
    }

    const { data: proposal, error: propErr } = await client
      .from("proposals")
      .select("id, status, tenant_id, titulo, cliente, validade")
      .eq("view_token", token)
      .maybeSingle();

    if (propErr || !proposal) {
      return res.status(404).json({ error: "Proposta não encontrada." });
    }

    if (!["Enviada", "Aberta"].includes(proposal.status)) {
      return res.status(409).json({ error: `Proposta não pode ser aceita (status atual: ${proposal.status}).` });
    }
    if (proposal.validade) {
      const limite = new Date(proposal.validade);
      if (!isNaN(limite.getTime())) {
        limite.setUTCHours(23, 59, 59, 999); // vale até o fim do dia de validade
        if (limite.getTime() < Date.now()) {
          return res.status(410).json({ error: "Proposta vencida." });
        }
      }
    }

    // Guarda de status no UPDATE evita aceite duplo/concorrente; sem coluna de "quem aceitou" (sem migration).
    const { data: updated, error: updateErr } = await client
      .from("proposals")
      .update({
        status: "Aceita",
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposal.id)
      .in("status", ["Enviada", "Aberta"])
      .select()
      .maybeSingle();

    if (!updateErr && !updated) {
      return res.status(409).json({ error: "Proposta já foi processada." });
    }
    if (updateErr) {
      console.error("[public-proposal] Erro ao registrar aceite:", updateErr);
      return res.status(500).json({ error: "Erro ao registrar aceite no banco de dados." });
    }

    return res.json({ success: true, status: "Aceita", proposal: updated });
  } catch (err: any) {
    console.error("[public-proposal] Erro ao processar aceite:", err?.message);
    return res.status(500).json({ error: "Erro interno ao processar aceite." });
  }
});

// ── AI Routes ──────────────────────────────────────────────────────────────

app.post("/api/leads/suggest-tags", requireUser, async (req, res) => {
  const { name, company, notes } = req.body;
  if (!process.env.GEMINI_API_KEY) return res.json({ tags: ["Interesse", "Novo Lead", "PME"] });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Suggest 3-5 relevant tags for a lead with the following info:
      Name: ${name}
      Company: ${company}
      Description: ${notes}
      Return the tags as a JSON array of strings.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    });
    res.json({ tags: JSON.parse(response.text ?? "[]") });
  } catch (error) {
    console.error("AI Tag Suggestion Error:", error);
    res.status(500).json({ error: "Failed to suggest tags" });
  }
});

// Análise de desempenho de aluno (nicho Educação) — o botão "Solicitar
// Análise" no modal de notas simulava um spinner "Analisando..." e devolvia
// sempre a mesma frase de template (progress% + "desempenho consistente"),
// sem nenhuma IA de verdade por trás. Agora chama Gemini de fato.
app.post("/api/ai/student-performance-insight", requireUser, async (req, res) => {
  const { name, progress, grades } = req.body || {};
  if (!process.env.GEMINI_API_KEY) {
    return res.json({ insight: "IA indisponível no momento — configure a chave de IA para habilitar esta análise." });
  }
  try {
    const gradesText = Array.isArray(grades) && grades.length > 0
      ? grades.map((g: any) => `${g.subject}: ${g.value}`).join(", ")
      : "sem notas lançadas ainda";
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Você é um coordenador pedagógico. Analise o desempenho deste aluno e escreva 2-3 frases objetivas
em português, destacando pontos fortes, riscos de evasão/desengajamento e uma recomendação prática.
Nome: ${name || "Aluno"}
Progresso no curso: ${progress ?? "desconhecido"}%
Notas lançadas: ${gradesText}
Não invente notas ou fatos que não foram informados acima.`,
    });
    res.json({ insight: (response.text || "Não foi possível gerar uma análise no momento.").trim() });
  } catch (error: any) {
    console.error("Student Performance Insight Error:", error?.message);
    res.status(500).json({ error: "Falha ao gerar análise de desempenho." });
  }
});

// OCR de fatura de energia (nicho Energia Solar) — chave Gemini nunca sai do
// servidor; o frontend manda só a imagem em base64, nunca a API key.
const ALLOWED_FATURA_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

app.post("/api/ai/solar-analyze-fatura", requireUser, async (req, res) => {
  const { imageBase64, mimeType } = req.body || {};
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "IA Offline — GEMINI_API_KEY não configurada." });
  if (!imageBase64 || typeof imageBase64 !== "string") return res.status(400).json({ error: "Imagem da fatura é obrigatória." });
  if (!ALLOWED_FATURA_MIME_TYPES.has(mimeType)) return res.status(400).json({ error: "Formato de imagem não suportado. Use JPEG, PNG ou WebP." });
  // ~4MB decodificados (base64 é ~33% maior que o binário original)
  if (imageBase64.length > 5_600_000) return res.status(400).json({ error: "Imagem muito grande. Envie uma foto de até 4MB." });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            {
              text: `Esta imagem é uma fatura de energia elétrica brasileira. Extraia exatamente estes campos.
Se um campo não estiver legível ou não existir na fatura, retorne null para ele — nunca invente um valor.
- distribuidora: nome da distribuidora de energia (ex: "CPFL", "Enel", "Light")
- consumoMedioKwh: consumo do mês em kWh (número, sem unidade)
- valorFatura: valor total da fatura em reais (número, sem "R$")
- mesReferencia: mês/ano de referência da fatura (ex: "Março/2026")`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            distribuidora: { type: Type.STRING, nullable: true },
            consumoMedioKwh: { type: Type.NUMBER, nullable: true },
            valorFatura: { type: Type.NUMBER, nullable: true },
            mesReferencia: { type: Type.STRING, nullable: true },
          },
        },
      },
    });

    const extraido = JSON.parse(response.text ?? "{}");
    const consumoMedioKwh = typeof extraido.consumoMedioKwh === "number" ? extraido.consumoMedioKwh : null;
    const valorFatura = typeof extraido.valorFatura === "number" ? extraido.valorFatura : null;

    // Dimensionamento por HSP (Horas de Sol Pico) médio nacional ~4.5h e perdas
    // do sistema ~20% — fórmula padrão de dimensionamento fotovoltaico, não uma
    // cotação exata (varia por região/telhado/orientação — é uma estimativa).
    const HSP_MEDIO_BRASIL = 4.5;
    const EFICIENCIA_SISTEMA = 0.8;
    const potenciaEstimadaKwp = consumoMedioKwh
      ? Math.round((consumoMedioKwh / (HSP_MEDIO_BRASIL * 30 * EFICIENCIA_SISTEMA)) * 100) / 100
      : null;
    // Economia estimada conservadora: sistemas solares tipicamente não zeram a
    // conta (custo de disponibilidade mínimo da distribuidora permanece).
    const economiaMensalEstimada = valorFatura ? Math.round(valorFatura * 0.85 * 100) / 100 : null;

    res.json({
      distribuidora: extraido.distribuidora ?? null,
      consumoMedioKwh,
      valorFatura,
      mesReferencia: extraido.mesReferencia ?? null,
      potenciaEstimadaKwp,
      economiaMensalEstimada,
      economiaAnualEstimada: economiaMensalEstimada ? Math.round(economiaMensalEstimada * 12 * 100) / 100 : null,
    });
  } catch (error: any) {
    console.error("Solar Fatura OCR Error:", error?.message);
    res.status(500).json({ error: "Falha ao analisar a fatura. Tente novamente com uma foto mais nítida." });
  }
});

app.post("/api/cnpj/validate", requireUser, async (req, res) => {
  const { cnpj } = req.body;
  if (!cnpj) return res.status(400).json({ error: "O CNPJ é obrigatório" });

  const cleanCnpj = cnpj.replace(/\D/g, "");
  if (cleanCnpj.length !== 14) return res.json({ valid: false, message: "O CNPJ precisa conter exatamente 14 dígitos." });

  const validateCNPJPattern = (val: string): boolean => {
    if (/^(\d)\1+$/.test(val)) return false;
    let size = val.length - 2;
    let numbers = val.substring(0, size);
    const digits = val.substring(size);
    let sum = 0;
    let pos = size - 7;
    for (let i = size; i >= 1; i--) {
      sum += Number(numbers.charAt(size - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== Number(digits.charAt(0))) return false;
    size += 1;
    numbers = val.substring(0, size);
    sum = 0;
    pos = size - 7;
    for (let i = size; i >= 1; i--) {
      sum += Number(numbers.charAt(size - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    return result === Number(digits.charAt(1));
  };

  if (!validateCNPJPattern(cleanCnpj)) return res.json({ valid: false, message: "CNPJ possui dígito verificador matemático inválido!" });

  try {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
    if (response.ok) {
      const data = await response.json();
      const isCnpjActive = data.descricao_situacao_cadastral === "ATIVA" || data.situacao_cadastral === 2 || data.situacao_cadastral === "2";
      return res.json({
        valid: true, active: isCnpjActive,
        statusText: data.descricao_situacao_cadastral || "ATIVA",
        companyName: data.razao_social || data.nome_fantasia || "Empresa sob análise",
        message: isCnpjActive
          ? `Empresa ativa: ${data.razao_social || data.nome_fantasia}`
          : `Alerta: Situação cadastral ${data.descricao_situacao_cadastral || "INATIVA"} na Receita Federal.`
      });
    }
    const receitaResponse = await fetch(`https://receitaws.com.br/v1/cnpj/${cleanCnpj}`);
    if (receitaResponse.ok) {
      const rData = await receitaResponse.json();
      if (rData.status === "ERROR") return res.json({ valid: false, message: rData.message || "CNPJ não localizado na Receita Federal." });
      const isCnpjActive = rData.situacao === "ATIVA";
      return res.json({
        valid: true, active: isCnpjActive,
        statusText: rData.situacao || "ATIVA",
        companyName: rData.nome || "Empresa sob análise",
        message: isCnpjActive ? `Empresa ativa: ${rData.nome}` : `Alerta: Situação cadastral ${rData.situacao || "INATIVA"} na Receita Federal.`
      });
    }
    return res.json({ valid: true, active: true, companyName: "Empresa Cadastrada (Validação Offline)", message: "CNPJ com padrão matemático correto (Bancos de dados federais offline)." });
  } catch {
    return res.json({ valid: true, active: true, companyName: "Empresa Cadastrada (Validação Offline)", message: "CNPJ computacionalmente válido (Bancos de dados federais instáveis)." });
  }
});

app.post("/api/leads/calculate-score", requireUser, async (req, res) => {
  const { lead, activities } = req.body;
  if (!lead) return res.status(400).json({ error: "Lead data is required for score calculation" });

  if (process.env.GEMINI_API_KEY) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: `Analyze this CRM lead and its recent activities, and compute:
        1. An AI score (0 to 100) indicating closeness to buying or closing.
        2. A lead temperature ('frio', 'morno', or 'quente').
        3. A brief, informative summary of why the score was given.

        Lead Details:
        - Name: ${lead.name}
        - Title: ${lead.title}
        - Company: ${lead.company}
        - Current Status: ${lead.status}
        - Estimated Value: ${lead.value}
        - Priority: ${lead.priority}

        Recent Activities:
        ${JSON.stringify(activities || [])}

        Return the result strictly as a JSON object with properties: "scoreIA" (integer), "temperature" (string: 'frio' | 'morno' | 'quente'), "iaSummary" (string).`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scoreIA: { type: Type.INTEGER },
              temperature: { type: Type.STRING },
              iaSummary: { type: Type.STRING }
            },
            required: ["scoreIA", "temperature", "iaSummary"]
          }
        }
      });
      const result = JSON.parse(response.text || "{}");
      return res.json({
        scoreIA: result.scoreIA ?? 50,
        temperature: result.temperature ?? "morno",
        iaSummary: result.iaSummary ?? "Não foi possível gerar a justificativa da IA."
      });
    } catch (error) {
      console.error("AI Lead Scoring failed, falling back to deterministic:", error);
    }
  }

  let score = 50;
  if (lead.status === "Novo") score += 5;
  else if (lead.status === "Prospecção") score += 10;
  else if (lead.status === "Qualificado") score += 20;
  else if (lead.status === "Em Negociação") score += 30;
  else if (lead.status === "Fechado") score += 50;
  else if (lead.status === "Perdido") score -= 30;
  if (lead.priority === "Alta") score += 15;
  else if (lead.priority === "Média") score += 5;
  else if (lead.priority === "Baixa") score -= 10;
  if (activities && Array.isArray(activities)) {
    const leadActivities = activities.filter((a: any) => a.leadId === lead.id);
    score += leadActivities.length * 8;
    if (leadActivities.some((a: any) => a.type === "Reunião")) score += 15;
  }
  score = Math.max(0, Math.min(100, score));

  let temp: "frio" | "morno" | "quente" = "morno";
  if (score < 45) temp = "frio";
  else if (score > 75) temp = "quente";

  const actCount = activities ? activities.filter((a: any) => a.leadId === lead.id).length : 0;
  return res.json({
    scoreIA: score,
    temperature: temp,
    iaSummary: `Cálculo automático (Offline): Lead com prioridade ${lead.priority} na etapa ${lead.status}. Possui ${actCount} atividades registradas no histórico recente.`
  });
});

app.post("/api/ai/performance-audit", requireUser, async (req, res) => {
  const { mrr, cac, ltv, leadsCount, dealsCount } = req.body;
  const mrrNum = Number(mrr) || 0;
  const cacNum = Number(cac) || 0;
  const ltvNum = Number(ltv) || 0;
  const ratio = cacNum > 0 ? (ltvNum / cacNum).toFixed(1) : "3.8";

  const fallbackRecommendations = [
    {
      title: "Otimização de LTV/CAC e Retenção",
      desc: `Relação LTV/CAC calculada em ${ratio}x. Priorize estratégias de onboarding guiado e upsell nos primeiros 60 dias para elevar a retenção em 20%.`,
      impact: "+35% ROI",
      color: "text-blue-400"
    },
    {
      title: "Eficiência do Funil Comercial",
      desc: `Base ativa de ${leadsCount || 0} oportunidades com ${dealsCount || 0} conversões registradas. Reduza o tempo de primeiro contato para menos de 15 minutos para maximizar o fechamento.`,
      impact: "+42% Conversão",
      color: "text-emerald-400"
    },
    {
      title: "Expansão da Receita Recorrente (MRR)",
      desc: `MRR atual de R$ ${mrrNum.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}. Ofereça incentivos e planos anuais com desconto para estabilizar o fluxo de caixa.`,
      impact: "+28% Previsibilidade",
      color: "text-purple-400"
    }
  ];

  if (!process.env.GEMINI_API_KEY) {
    return res.json(fallbackRecommendations);
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Você é o Master IA do S.P.Y. CRM. Analise estes indicadores:
      MRR: ${mrr}, CAC: ${cac}, LTV: ${ltv}, Leads: ${leadsCount}, Fechamentos: ${dealsCount}.
      Gere 3 recomendações estratégicas baseadas em dados para otimizar o ROI.
      Retorne estritamente um JSON array de objetos: [{"title": string, "desc": string, "impact": string, "color": "text-blue-400" | "text-emerald-400" | "text-purple-400"}].`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING }, desc: { type: Type.STRING },
              impact: { type: Type.STRING }, color: { type: Type.STRING }
            },
            required: ["title", "desc", "impact", "color"]
          }
        }
      }
    });
    const parsed = JSON.parse(response.text ?? "[]");
    if (Array.isArray(parsed) && parsed.length > 0) {
      return res.json(parsed);
    }
    res.json(fallbackRecommendations);
  } catch (err: any) {
    console.warn("[performance-audit] Gemini fallback:", err?.message);
    res.json(fallbackRecommendations);
  }
});

app.post("/api/ai/content-script", requireUser, async (req, res) => {
  const { title, desc, platform } = req.body;
  if (!title) return res.status(400).json({ error: "Informe o título da pauta." });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "Chave de IA não configurada." });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Você é um redator de conteúdo para redes sociais. Crie um roteiro curto (15-30 segundos de leitura) para um post de "${platform || "Instagram"}" com o tema "${title}". Contexto adicional: ${desc || "nenhum"}.
      Retorne estritamente um JSON: {"script": string, "hashtags": string[]} (hashtags sem o caractere #, só a palavra).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            script: { type: Type.STRING },
            hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["script", "hashtags"],
        },
      },
    });
    res.json(JSON.parse(response.text ?? "{}"));
  } catch {
    res.status(500).json({ error: "Falha ao gerar script." });
  }
});

app.post("/api/ai/pipeline-audit", requireUser, async (req, res) => {
  const { stageName, leads } = req.body;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "IA Offline" });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Analise a etapa "${stageName}" do funil com estes leads:
      ${JSON.stringify(leads.map((l: any) => ({ name: l.name, score: l.scoreIA, temp: l.temperature })))}
      Forneça um insight rápido e uma ação imediata para o vendedor.
      Retorne JSON: {"insight": string, "action": string}.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { insight: { type: Type.STRING }, action: { type: Type.STRING } },
          required: ["insight", "action"]
        }
      }
    });
    res.json(JSON.parse(response.text ?? "{}"));
  } catch {
    res.status(500).json({ error: "Falha ao auditar funil." });
  }
});

app.post("/api/ai/marketing-advisor", requireUser, async (req, res) => {
  const { leads, spent } = req.body;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "IA Offline" });
  try {
    const sourceData = leads.reduce((acc: any, l: any) => {
      const src = l.source || "Orgânico";
      acc[src] = (acc[src] || 0) + 1;
      return acc;
    }, {});
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Análise de Marketing:
      Gasto Total: R$ ${spent}
      Conversão por Origem: ${JSON.stringify(sourceData)}
      Sugira onde realocar verba para diminuir o CAC.
      Retorne JSON: {"suggestion": string, "rationale": string}.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { suggestion: { type: Type.STRING }, rationale: { type: Type.STRING } },
          required: ["suggestion", "rationale"]
        }
      }
    });
    res.json(JSON.parse(response.text ?? "{}"));
  } catch {
    res.status(500).json({ error: "Falha na análise de marketing." });
  }
});

app.post("/api/ai/settings-audit", requireUser, async (req, res) => {
  const { type, config } = req.body;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "IA Offline" });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Você é o Auditor Master do S.P.Y. CRM. Analise esta configuração de ${type}:
      ${JSON.stringify(config)}
      Identifique possíveis gargalos, regras redundantes ou melhorias na lógica.
      Retorne estritamente um JSON: {"audit": string, "suggestions": string[]}.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            audit: { type: Type.STRING },
            suggestions: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["audit", "suggestions"]
        }
      }
    });
    res.json(JSON.parse(response.text ?? "{}"));
  } catch {
    res.status(500).json({ error: "Falha ao auditar configurações." });
  }
});

app.get("/api/settings/:category", requireUser, async (req: any, res) => {
  const { category } = req.params;
  if (supabase) {
    // req.supabase (escopado com o JWT do chamador) em vez do client de
    // módulo com a anon key, para respeitar RLS caso a categoria algum dia
    // vire uma tabela real de verdade.
    const tableName = `crm_${category.replace("-", "_")}`;
    const { data, error } = await req.supabase.from(tableName).select("*");
    if (!error && data) return res.json(data);
  }
  // Nenhuma das categorias abaixo tem tabela própria no banco — fallback
  // em memória, isolado por tenant (ver tenantBucket): sem isso, tenant A
  // criando uma origem/campo customizado aparecia pra todo mundo na
  // plataforma, porque era um único array compartilhado pelo processo.
  const { data: tenantId } = await req.supabase.rpc("current_tenant_id");
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });
  switch (category) {
    case "sources": return res.json(tenantBucket(sourcesByTenant, tenantId, DEFAULT_SOURCES));
    case "fields": case "custom-fields": case "custom_lead_fields":
      return res.json(tenantBucket(customFieldsByTenant, tenantId, DEFAULT_CUSTOM_FIELDS));
    case "task-categories": case "categories":
      return res.json(tenantBucket(taskCategoriesByTenant, tenantId, DEFAULT_TASK_CATEGORIES));
    case "templates": return res.json(tenantBucket(templatesByTenant, tenantId, DEFAULT_TEMPLATES));
    default: return res.status(404).json({ error: "Categoria não encontrada" });
  }
});

app.post("/api/settings/:category", requireUser, async (req: any, res) => {
  const { category } = req.params;
  const item = req.body;
  const id = Math.random().toString(36).substring(2, 9);
  const newItem = { id, ...item };
  if (supabase) {
    const tableName = `crm_${category.replace("-", "_")}`;
    const { data, error } = await req.supabase.from(tableName).insert([newItem]).select();
    if (!error && data) return res.json(data[0]);
  }
  const { data: tenantId } = await req.supabase.rpc("current_tenant_id");
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });
  switch (category) {
    case "sources": {
      const newSource = { id, name: item.name || item.nome };
      tenantBucket(sourcesByTenant, tenantId, DEFAULT_SOURCES).push(newSource);
      return res.json(newSource);
    }
    case "fields": case "custom-fields": case "custom_lead_fields":
      tenantBucket(customFieldsByTenant, tenantId, DEFAULT_CUSTOM_FIELDS).push(newItem);
      return res.json(newItem);
    case "task-categories":
      tenantBucket(taskCategoriesByTenant, tenantId, DEFAULT_TASK_CATEGORIES).push(newItem);
      return res.json(newItem);
    case "templates":
      tenantBucket(templatesByTenant, tenantId, DEFAULT_TEMPLATES).push(newItem);
      return res.json(newItem);
    default: return res.status(404).json({ error: "Categoria inválida" });
  }
});

app.delete("/api/settings/:category/:id", requireUser, async (req: any, res) => {
  const { category, id } = req.params;
  if (supabase) {
    const tableName = `crm_${category.replace("-", "_")}`;
    await req.supabase.from(tableName).delete().eq("id", id);
  }
  const { data: tenantId } = await req.supabase.rpc("current_tenant_id");
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });
  switch (category) {
    case "sources":
      sourcesByTenant[tenantId] = tenantBucket(sourcesByTenant, tenantId, DEFAULT_SOURCES).filter((s) => s.id !== id);
      break;
    case "fields": case "custom-fields": case "custom_lead_fields":
      customFieldsByTenant[tenantId] = tenantBucket(customFieldsByTenant, tenantId, DEFAULT_CUSTOM_FIELDS).filter((f) => f.id !== id);
      break;
    case "task-categories": case "categories":
      taskCategoriesByTenant[tenantId] = tenantBucket(taskCategoriesByTenant, tenantId, DEFAULT_TASK_CATEGORIES).filter((c) => c.id !== id);
      break;
    case "templates":
      templatesByTenant[tenantId] = tenantBucket(templatesByTenant, tenantId, DEFAULT_TEMPLATES).filter((t) => t.id !== id);
      break;
  }
  res.json({ success: true });
});

app.post("/api/ai/suggest-new-config", requireUser, async (req, res) => {
  const { type } = req.body;
  if (!process.env.GEMINI_API_KEY) return res.json({ suggestion: null });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Você é um consultor de CRM. Sugira um exemplo para "${type}".
      NÃO inclua campos como 'target'. Use os campos exatos abaixo.
      Responda APENAS com JSON:
      - Se for "Campo Personalizado": {"name": "Data de Aniversário", "type": "Data", "required": false}
      - Se for "Origem": {"nome": "Indicação Parceiro Premium"}
      - Se for "Categoria de Tarefa": {"nome": "Follow-up Estratégico", "cor": "bg-purple-500"}
      - Se for "Modelo": {"name": "Boas-vindas", "content": "Olá {{name}}, seja bem-vindo!", "category": "Vendas"}`,
      config: { responseMimeType: "application/json" }
    });
    res.json(JSON.parse(response.text ?? "{}"));
  } catch {
    res.status(500).json({ error: "Erro na sugestão da IA" });
  }
});

app.post("/api/ai/generic-insight", requireUser, async (req, res) => {
  const { context, data } = req.body;
  if (!process.env.GEMINI_API_KEY) {
    return res.json({ insight: "A Master IA está em modo offline no momento. Conecte sua API Key para obter insights estratégicos." });
  }
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Você é o cérebro analítico do S.P.Y. CRM.
      Contexto da solicitação: ${context}.
      Dados brutos para análise: ${JSON.stringify(data)}.
      Sua tarefa: Forneça um insight estratégico curto, direto e acionável em português (máximo 3 frases).
      Foque em melhoria de ROI, conversão ou retenção.`,
    });
    res.json({ insight: response.text ?? "" });
  } catch (error) {
    console.error("Erro na Master IA:", error);
    res.status(500).json({ error: "Falha ao processar insight cerebral." });
  }
});

// ── Post-Meeting Report ────────────────────────────────────────────────────
// (o antigo Copilot de Reunião — /api/ai/reuniao-copilot, Gemini cru e paralelo à Aurora —
// foi removido: a própria Aurora agora cobre esse papel dentro da sala, ver
// useAuroraMeetingPresence.ts + AuroraJitsiVoice.tsx.)

// ── Aurora (chat com o G-TECH AI OS, embutido no S.P.Y.) ─────────────────────
// Proxy autenticado para o webhook do Chat Trigger da Aurora no n8n (workflow AURORA CORE).
// A URL do webhook nunca chega ao navegador — só este backend a conhece (AURORA_WEBHOOK_URL).
app.post("/api/ai/aurora-chat", requireUser, async (req: any, res: any) => {
  const { message, sessionId: clientSessionId } = req.body ?? {};
  if (!message?.trim()) return res.status(400).json({ error: "Mensagem vazia." });

  const webhookUrl = process.env.AURORA_WEBHOOK_URL;
  if (!webhookUrl) return res.status(503).json({ error: "Aurora não está configurada neste ambiente." });

  // Este endpoint atende dois chamadores diferentes com a mesma Aurora (n8n AURORA CORE):
  //   1) o widget da Aurora (AuroraWidget.tsx) — liberado pra qualquer empresa com o módulo
  //      "aurora" ativo (Layout.tsx), não só G-Tech. Cada usuário ganha sua própria sessão de
  //      memória (aurora-user-<id>), isolada das outras empresas; o master/G-Tech mantém a
  //      sessão pessoal histórica ("aurora-gustavo-principal") por compatibilidade com o que já
  //      estava configurado no workflow. tenantId/tenantName/isMaster vão no payload pro workflow
  //      do n8n rotear as ferramentas de escrita (calendário/WhatsApp) pra credencial da empresa
  //      certa — essa parametrização está sendo feita no n8n em paralelo a esta mudança.
  //   2) o copilot de reunião (ReuniaoRoom.tsx / useAuroraMeetingPresence.ts) — manda um
  //      sessionId próprio por reunião (`aurora-reuniao-<reuniaoId>`), disponível a qualquer
  //      closer autenticado. Antes de usar esse reuniaoId pra montar a chave de memória, valida
  //      que a reunião existe pro tenant do chamador — via req.supabase (client escopado ao JWT,
  //      sujeito à RLS da Fase 1), então um reuniaoId de outro tenant simplesmente não aparece.
  let sessionId: string;
  let tenantId: string | null = null;
  let tenantName: string | null = null;
  let isMasterCaller = false;

  const meetingMatch = typeof clientSessionId === "string" ? clientSessionId.match(/^aurora-reuniao-(.+)$/) : null;
  if (meetingMatch) {
    const { data: reuniao, error: reuniaoError } = await req.supabase
      .from("reunioes").select("id").eq("id", meetingMatch[1]).maybeSingle();
    if (reuniaoError || !reuniao) {
      return res.status(403).json({ error: "Reunião não encontrada ou sem permissão de acesso." });
    }
    sessionId = clientSessionId;
  } else {
    const { data: caller, error: callerError } = await req.supabase
      .from("users").select("is_master, tenant_id, tenants(name)").eq("id", req.user.id).maybeSingle();
    if (callerError || !caller) {
      return res.status(403).json({ error: "Não foi possível identificar o usuário." });
    }
    isMasterCaller = !!caller.is_master;
    tenantId = caller.tenant_id ?? null;
    tenantName = (caller as any).tenants?.name ?? null;
    // A chave de memória do agente é sempre derivada do usuário autenticado; um sessionId
    // enviado pelo cliente (fora do caso aurora-reuniao-*, validado acima por RLS) é ignorado
    // para ninguém endereçar a memória de outro usuário ou do master.
    sessionId = isMasterCaller
      ? "aurora-gustavo-principal"
      : `aurora-user-${req.user.id}`;
  }

  try {
    const { data } = await axios.post(
      webhookUrl,
      { action: "sendMessage", sessionId, chatInput: message, tenantId, tenantName, isMaster: isMasterCaller },
      { timeout: 60000 }
    );
    return res.json({ output: data?.output ?? "", audioBase64: data?.audioBase64 ?? null });
  } catch (err: any) {
    console.error("[Aurora Chat]", err?.response?.data ?? err?.message);
    return res.status(502).json({ error: "Aurora está indisponível agora." });
  }
});

// ── Aurora tenant-scoped: IA operacional que consulta dados reais do tenant ──
//
// Distinta da Aurora Master acima (que fala com um webhook n8n externo e é
// exclusiva de master/reuniões) — esta é a evolução pedida de "chatbot" pra
// "IA operacional": qualquer usuário autenticado pode perguntar em linguagem
// natural ("quais leads estão sem contato há mais de 3 dias?") e a Aurora
// consulta o banco de verdade, nunca inventa números.
//
// Isolamento: cada "tool" abaixo usa req.supabase (client escopado ao JWT do
// chamador, sujeito a RLS) — nunca supabaseService, e nunca um tenantId vindo
// do corpo da requisição. A IA só decide QUAL tool chamar e com quais
// argumentos; a query em si roda com os mesmos privilégios que o usuário já
// tem no resto do sistema. Aurora de um tenant não pode, estruturalmente,
// consultar dado de outro tenant — o mesmo RLS de sempre continua sendo o
// único ponto de verdade sobre isolamento.
//
// NÃO TESTADO contra credencial real (GEMINI_API_KEY) neste ambiente — ver
// regra do projeto sobre marcar como "requer ambiente/credencial externa".
const AURORA_TOOLS = [
  {
    name: "leads_sem_contato",
    description: "Lista leads do funil que estão sem nenhum contato registrado há mais de N dias (ou nunca tiveram contato registrado).",
    parameters: {
      type: Type.OBJECT,
      properties: { dias: { type: Type.NUMBER, description: "Número mínimo de dias sem contato" } },
      required: ["dias"],
    },
  },
  {
    name: "resumo_pipeline",
    description: "Retorna a contagem de leads ativos por status/etapa do funil de vendas do tenant.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "proximas_reunioes",
    description: "Lista as próximas reuniões/compromissos agendados nos próximos N dias.",
    parameters: {
      type: Type.OBJECT,
      properties: { dias: { type: Type.NUMBER, description: "Janela de dias à frente a considerar" } },
      required: ["dias"],
    },
  },
  {
    name: "resumo_financeiro",
    description: "Soma receitas e despesas lançadas nos últimos N dias, por tipo de lançamento.",
    parameters: {
      type: Type.OBJECT,
      properties: { dias: { type: Type.NUMBER, description: "Janela de dias retroativos a considerar" } },
      required: ["dias"],
    },
  },
  {
    name: "tarefas_pendentes",
    description: "Lista tarefas operacionais e follow-ups em aberto ou atrasados do tenant.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "vendas_e_propostas",
    description: "Retorna resumo de propostas comerciais emitidas e vendas registradas no tenant.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "clientes_resumo",
    description: "Retorna a lista e quantidade de clientes cadastrados no tenant por setor e situação.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "solar_funil_resumo",
    description: "Retorna o resumo do funil fotovoltaico do tenant: quantidade de análises por estágio, propostas enviadas, vendas fechadas e potência instalada. Use para perguntas sobre leads solares, propostas e status do funil de energia solar.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "buscar_produto",
    description: "Busca produtos ativos do catálogo do tenant por nome/palavra-chave — usa pra 'selecionar' e referenciar o produto certo (nome exato, preço, recorrência, taxa de implantação) ao discutir ou sugerir uma proposta pro usuário. Só consulta o catálogo, nunca cria proposta/venda nenhuma sozinha — quem decide e confirma é sempre o usuário, no fluxo normal de criação de proposta.",
    parameters: {
      type: Type.OBJECT,
      properties: { termo: { type: Type.STRING, description: "Nome ou palavra-chave do produto (ex.: 'licença fundador', 'tráfego pago')" } },
      required: ["termo"],
    },
  },
  {
    name: "marcar_produto_interesse",
    description: "Marca um produto do catálogo como 'produto de interesse' num lead específico — uma tag leve, visível no Lead Details, SEM criar proposta/venda nenhuma e sem lançar nada no financeiro (equivalente a clicar na tag de um produto na aba Produtos do lead). Use quando o usuário disser algo como 'marca esse produto pro lead X' ou 'a Aurora seleciona o produto' — nunca use isso como se fosse fechar uma venda; pra vender de verdade, o usuário precisa usar o fluxo normal de proposta.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        lead_nome: { type: Type.STRING, description: "Nome do lead ou da empresa, como aparece no CRM (busca aproximada)" },
        produto_nome: { type: Type.STRING, description: "Nome ou palavra-chave do produto do catálogo" },
      },
      required: ["lead_nome", "produto_nome"],
    },
  },
  {
    name: "consultar_implementacao",
    description: "Consulta a implementação (implantação) de um cliente que já fechou: status, responsável, progresso, o que ainda falta preencher e as respostas já registradas do formulário. Use quando o usuário perguntar 'como está a implementação da Fulano', 'o que falta pra Fulano' ou antes de preencher algo, pra saber o que já existe.",
    parameters: {
      type: Type.OBJECT,
      properties: { cliente_nome: { type: Type.STRING, description: "Nome (ou parte do nome) do cliente, como aparece na Base de Clientes" } },
      required: ["cliente_nome"],
    },
  },
  {
    name: "atualizar_implementacao",
    description: "Preenche campos do formulário de implementação de um cliente (Implementações no CRM) a partir do que o usuário ditar — ex.: 'o WhatsApp da Fulano é 63 99999-0000', 'CNPJ e razão social da Beta são ...'. Envie TODOS os campos ditos numa única chamada, no array 'campos'. Só preenche campos que o CLIENTE responde (dados da empresa, responsáveis, CRM, IDs de integração, financeiro, Aurora); NÃO altera status de integração, checklist de go-live nem notas internas — isso é da equipe, no sistema. Nunca grave senhas ou tokens de acesso. Se o cliente ainda não tem implementação iniciada, avise que precisa iniciar em CRM > Implementações.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        cliente_nome: { type: Type.STRING, description: "Nome (ou parte do nome) do cliente, como aparece na Base de Clientes" },
        campos: {
          type: Type.ARRAY,
          description: "Lista de campos a preencher",
          items: {
            type: Type.OBJECT,
            properties: {
              campo: { type: Type.STRING, description: "Nome do campo como no formulário, incluindo a integração quando houver (ex.: 'WhatsApp número que será conectado', 'CNPJ', 'Meta Ads ID do Pixel', 'Etapas do funil')" },
              valor: { type: Type.STRING, description: "Valor. Para campos sim/não use 'sim' ou 'não'; para datas use DD/MM/AAAA" },
            },
            required: ["campo", "valor"],
          },
        },
      },
      required: ["cliente_nome", "campos"],
    },
  },
];

// Tools que mexem em dado da equipe/implantação só valem no chat INTERNO
// autenticado. No auto-reply do WhatsApp (conversa com cliente/lead externo,
// sem sessão de usuário) elas ficam de fora — senão qualquer contato poderia
// ler ou alterar a implantação de um cliente só citando o nome dele.
const AURORA_INTERNAL_ONLY_TOOLS = new Set(["consultar_implementacao", "atualizar_implementacao"]);
const AURORA_TOOLS_WHATSAPP = AURORA_TOOLS.filter((t) => !AURORA_INTERNAL_ONLY_TOOLS.has(t.name));

// Resolve "Fulano" -> a implementação daquele cliente, sem chutar: pergunta
// quando há mais de um candidato. `scoped` aplica o filtro de tenant.
async function auroraFindImplementation(supabaseClient: any, scoped: (q: any) => any, clienteNome: string) {
  const nome = String(clienteNome || "").trim();
  if (!nome) return { erro: { sucesso: false, mensagem: "Informe o nome do cliente." } };
  const { data: clientes, error: cErr } = await scoped(
    supabaseClient.from("clientes").select("id, name").ilike("name", `%${nome}%`)
  ).limit(8);
  if (cErr) return { erro: { error: cErr.message } };
  if (!clientes || clientes.length === 0) return { erro: { sucesso: false, mensagem: `Nenhum cliente encontrado com o nome "${nome}".` } };

  const { data: impls, error: iErr } = await scoped(
    supabaseClient.from("implementations").select("id, cliente_id, status, data, responsavel, go_live_date")
      .in("cliente_id", clientes.map((c: any) => c.id))
  );
  if (iErr) return { erro: { error: iErr.message } };
  if (!impls || impls.length === 0) {
    return { erro: { sucesso: false, mensagem: `Encontrei ${clientes.map((c: any) => c.name).join(", ")}, mas nenhum tem implementação iniciada. O usuário precisa iniciar em CRM > Implementações.` } };
  }
  if (impls.length > 1) {
    return {
      erro: {
        sucesso: false,
        mensagem: `Mais de um cliente com implementação bate com "${nome}" — pergunte ao usuário qual é o certo.`,
        candidatos: impls.map((i: any) => clientes.find((c: any) => c.id === i.cliente_id)?.name).filter(Boolean),
      },
    };
  }
  const impl = impls[0] as any;
  return { impl, clienteNome: clientes.find((c: any) => c.id === impl.cliente_id)?.name || nome };
}

// `tenantId` é opcional pro caminho autenticado (req.supabase já escopa por
// RLS) mas OBRIGATÓRIO na prática pro caminho novo do auto-reply do WhatsApp
// (runAuroraAutoReply abaixo, que usa supabaseService — bypassa RLS de
// propósito porque o webhook do WAHA não tem sessão de usuário). Filtra
// explicitamente por tenant_id sempre que fornecido — redundante mas
// inofensivo no caminho com RLS, essencial no caminho sem RLS.
async function runAuroraTool(name: string, args: any, supabaseClient: any, tenantId?: string): Promise<any> {
  const dias = Number(args?.dias) > 0 ? Number(args.dias) : 3;
  const scoped = (q: any) => (tenantId ? q.eq("tenant_id", tenantId) : q);

  if (name === "leads_sem_contato") {
    const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await scoped(
      supabaseClient
        .from("leads")
        .select("name, company, status, last_contact_at")
        .is("deleted_at", null)
        .or(`last_contact_at.is.null,last_contact_at.lt.${cutoff}`)
    ).order("last_contact_at", { ascending: true, nullsFirst: true }).limit(25);
    if (error) return { error: error.message };
    return { dias_considerados: dias, total: data?.length ?? 0, leads: data ?? [] };
  }

  if (name === "resumo_pipeline") {
    // Agregado sobre TODOS os leads — precisa da paginação de verdade (ver
    // fetchAllRowsPaginated), senão o PostgREST trunca em 1000 e a IA
    // responde uma contagem errada pra qualquer tenant acima disso.
    const data = await fetchAllRowsPaginated(supabaseClient, "leads", "status", (q) => scoped(q).is("deleted_at", null));
    const contagem: Record<string, number> = {};
    for (const row of data ?? []) {
      const s = (row as any).status || "Sem status";
      contagem[s] = (contagem[s] || 0) + 1;
    }
    return { total_leads: data?.length ?? 0, por_status: contagem };
  }

  if (name === "proximas_reunioes") {
    const nowIso = new Date().toISOString();
    const futureIso = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await scoped(
      supabaseClient
        .from("reunioes")
        .select('leadName, closerName, scheduledAt, status')
        .gte("scheduledAt", nowIso)
        .lte("scheduledAt", futureIso)
    ).order("scheduledAt", { ascending: true }).limit(25);
    if (error) return { error: error.message };
    return { dias_considerados: dias, total: data?.length ?? 0, reunioes: data ?? [] };
  }

  if (name === "resumo_financeiro") {
    const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
    // Mesma razão do resumo_pipeline: soma agregada precisa de TODAS as
    // linhas do período, não só as primeiras 1000 que o PostgREST devolveria.
    const data = await fetchAllRowsPaginated(supabaseClient, "finance_entries", "type,value,status", (q) => scoped(q).gte("created_at", cutoff));
    const porTipo: Record<string, number> = {};
    for (const row of data ?? []) {
      const t = (row as any).type || "Outro";
      porTipo[t] = (porTipo[t] || 0) + (Number((row as any).value) || 0);
    }
    return { dias_considerados: dias, total_lancamentos: data?.length ?? 0, soma_por_tipo: porTipo };
  }

  if (name === "tarefas_pendentes") {
    const { data, error } = await scoped(
      supabaseClient.from("tasks").select("title, status, priority, date, responsible").neq("status", "Concluída")
    ).limit(25);
    if (error) return { error: error.message };
    return { total_pendentes: data?.length ?? 0, tarefas: data ?? [] };
  }

  if (name === "vendas_e_propostas") {
    const { data: propostas, error: propErr } = await scoped(
      supabaseClient.from("proposals").select("titulo, cliente, valor, status, created_at")
    ).order("created_at", { ascending: false }).limit(15);
    if (propErr) return { error: propErr.message };

    const { data: vendas, error: vendErr } = await scoped(
      supabaseClient.from("vendas").select("id, valor_total, forma_pagamento, status, created_at")
    ).order("created_at", { ascending: false }).limit(15);

    return {
      propostas: propostas ?? [],
      vendas_recentes: vendErr ? [] : (vendas ?? [])
    };
  }

  if (name === "clientes_resumo") {
    const { data, error } = await scoped(
      supabaseClient.from("clientes").select("name, industry, status, city, state")
    ).limit(30);
    if (error) return { error: error.message };
    return { total_clientes: data?.length ?? 0, clientes: data ?? [] };
  }

  if (name === "solar_funil_resumo") {
    // Mesma razão do resumo_pipeline: funil agregado precisa de TODAS as
    // linhas, não só as primeiras 1000 que o PostgREST devolveria sem paginar.
    const rows = await fetchAllRowsPaginated(supabaseClient, "solar_analises", "status,potencia_estimada_kwp,valor_proposta", (q) => scoped(q));
    const porEstagio: Record<string, number> = {};
    rows.forEach((r: any) => { porEstagio[r.status] = (porEstagio[r.status] ?? 0) + 1; });
    const fechados = rows.filter((r: any) => r.status === "Concluído");
    const propostasEnviadas = rows.filter((r: any) =>
      ["Proposta Enviada", "Homologação", "Instalação", "Concluído"].includes(r.status)
    ).length;
    return {
      total_leads_solares: rows.length,
      por_estagio: porEstagio,
      propostas_enviadas: propostasEnviadas,
      vendas_fechadas: fechados.length,
      potencia_instalada_kwp: fechados.reduce((s: number, r: any) => s + Number(r.potencia_estimada_kwp ?? 0), 0),
      receita_fechada: fechados.reduce((s: number, r: any) => s + Number(r.valor_proposta ?? 0), 0),
    };
  }

  if (name === "buscar_produto") {
    const termo = String(args?.termo || "").trim();
    if (!termo) return { error: "Informe um termo de busca." };
    const { data, error } = await scoped(
      supabaseClient
        .from("products")
        .select("id, name, price, category, is_recurring, recurring_period, implementation_fee, description")
        .eq("active", true)
        .ilike("name", `%${termo}%`)
    ).limit(10);
    if (error) return { error: error.message };
    if (!data || data.length === 0) {
      return { encontrado: false, mensagem: `Nenhum produto ativo do catálogo bate com "${termo}".` };
    }
    return {
      encontrado: true,
      produtos: data.map((p: any) => ({
        id: p.id,
        nome: p.name,
        preco: Number(p.price) || 0,
        categoria: p.category || null,
        recorrente: !!p.is_recurring,
        frequencia: p.is_recurring ? (p.recurring_period || "mensal") : null,
        taxa_implantacao: Number(p.implementation_fee) || 0,
        descricao: p.description || null,
      })),
    };
  }

  if (name === "marcar_produto_interesse") {
    const leadNome = String(args?.lead_nome || "").trim();
    const produtoNome = String(args?.produto_nome || "").trim();
    if (!leadNome || !produtoNome) return { error: "Informe o nome do lead e o nome do produto." };

    const { data: leadMatches, error: leadErr } = await scoped(
      supabaseClient.from("leads").select('id, name, company, "customFields"').is("deleted_at", null)
        .or(`name.ilike.%${pgrstSafe(leadNome)}%,company.ilike.%${pgrstSafe(leadNome)}%`)
    ).limit(5);
    if (leadErr) return { error: leadErr.message };
    if (!leadMatches || leadMatches.length === 0) {
      return { sucesso: false, mensagem: `Nenhum lead encontrado com o nome/empresa "${leadNome}".` };
    }
    if (leadMatches.length > 1) {
      return {
        sucesso: false,
        mensagem: `Mais de um lead bate com "${leadNome}" — pergunte ao usuário qual é o certo antes de marcar.`,
        candidatos: leadMatches.map((l: any) => ({ nome: l.name, empresa: l.company })),
      };
    }
    const lead = leadMatches[0] as any;

    const { data: productMatches, error: prodErr } = await scoped(
      supabaseClient.from("products").select("id, name, price").eq("active", true).ilike("name", `%${produtoNome}%`)
    ).limit(5);
    if (prodErr) return { error: prodErr.message };
    if (!productMatches || productMatches.length === 0) {
      return { sucesso: false, mensagem: `Nenhum produto ativo do catálogo bate com "${produtoNome}".` };
    }
    if (productMatches.length > 1) {
      return {
        sucesso: false,
        mensagem: `Mais de um produto bate com "${produtoNome}" — pergunte ao usuário qual é o certo antes de marcar.`,
        candidatos: productMatches.map((p: any) => ({ nome: p.name, preco: Number(p.price) || 0 })),
      };
    }
    const produto = productMatches[0] as any;

    const customFields = lead.customFields || {};
    const atuais: string[] = Array.isArray(customFields.produtosInteresseIds) ? customFields.produtosInteresseIds : [];
    if (atuais.includes(produto.id)) {
      return { sucesso: true, ja_marcado: true, lead: lead.name, produto: produto.name, mensagem: `${produto.name} já estava marcado como interesse pra ${lead.name}.` };
    }
    const { error: updateErr } = await scoped(
      supabaseClient.from("leads").update({ customFields: { ...customFields, produtosInteresseIds: [...atuais, produto.id] } }).eq("id", lead.id)
    );
    if (updateErr) return { error: updateErr.message };

    return {
      sucesso: true,
      lead: lead.name,
      produto: produto.name,
      preco: Number(produto.price) || 0,
      mensagem: `Marquei "${produto.name}" (${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(produto.price) || 0)}) como produto de interesse pra ${lead.name} — visível na aba Produtos do lead, sem criar proposta nenhuma.`,
    };
  }

  if (name === "consultar_implementacao") {
    const found = await auroraFindImplementation(supabaseClient, scoped, args?.cliente_nome);
    if ("erro" in found) return found.erro;
    const { impl, clienteNome } = found;
    const data = impl.data || {};
    const geral = implComputeProgress(data);
    const cliente = implComputeProgress(data, "client");
    const respostas: Record<string, string> = {};
    for (const f of implAllFields("client")) {
      const v = data[f.id];
      if (v === undefined || v === null || v === "") continue;
      respostas[`${f.group ? f.group + " — " : ""}${f.label}`] = typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v).slice(0, 200);
    }
    return {
      sucesso: true,
      cliente: clienteNome,
      status: impl.status,
      responsavel: impl.responsavel || null,
      go_live_previsto: impl.go_live_date || null,
      progresso_geral_percent: geral.overall.percent,
      progresso_do_cliente_percent: cliente.overall.percent,
      pendencias: implPendingFields(data).slice(0, 30).map(({ section, field }) => `${section.title} › ${field.group ? field.group + " — " : ""}${field.label}`),
      respostas,
    };
  }

  if (name === "atualizar_implementacao") {
    const found = await auroraFindImplementation(supabaseClient, scoped, args?.cliente_nome);
    if ("erro" in found) return found.erro;
    const { impl, clienteNome } = found;
    if (impl.status === "Concluída") return { sucesso: false, mensagem: `A implementação de ${clienteNome} já está concluída — reabra no CRM antes de alterar.` };

    const campos = Array.isArray(args?.campos) ? args.campos.slice(0, 40) : [];
    if (campos.length === 0) return { sucesso: false, mensagem: "Nenhum campo informado." };

    const patch: Record<string, any> = {};
    const aplicados: { campo: string; valor: any }[] = [];
    const naoAplicados: { campo: string; motivo: string; opcoes?: string[] }[] = [];
    for (const item of campos) {
      const consulta = String(item?.campo || "");
      const r = implFindField(consulta, "client");
      if (r.status === "none") { naoAplicados.push({ campo: consulta, motivo: "Não achei esse campo no formulário (ou ele é interno da equipe)." }); continue; }
      if (r.status === "ambiguous") {
        naoAplicados.push({ campo: consulta, motivo: "Mais de um campo bate — pergunte qual.", opcoes: r.candidates.map(f => `${f.group ? f.group + " — " : ""}${f.label}`) });
        continue;
      }
      const c = implCoerceFieldValue(r.field, item?.valor);
      if (c.ok === false) { naoAplicados.push({ campo: consulta, motivo: c.reason }); continue; }
      patch[r.field.id] = c.value;
      aplicados.push({ campo: `${r.field.group ? r.field.group + " — " : ""}${r.field.label}`, valor: typeof c.value === "boolean" ? (c.value ? "Sim" : "Não") : c.value ?? "(limpo)" });
    }
    if (aplicados.length === 0) return { sucesso: false, mensagem: "Nenhum campo pôde ser aplicado.", nao_aplicados: naoAplicados };

    const merged = implApplyPatch(impl.data || {}, patch);
    const { error: updErr } = await scoped(supabaseClient.from("implementations").update({ data: merged }).eq("id", impl.id));
    if (updErr) return { error: updErr.message };
    return {
      sucesso: true,
      cliente: clienteNome,
      atualizados: aplicados,
      nao_aplicados: naoAplicados,
      progresso_geral_percent: implComputeProgress(merged).overall.percent,
      mensagem: `Atualizei ${aplicados.length} campo(s) da implementação de ${clienteNome}.`,
    };
  }

  return { error: `Ferramenta desconhecida: ${name}` };
}

/**
 * Auto-reply da Aurora pra mensagem recebida via WhatsApp (chamado só pelo
 * webhook do WAHA — ver POST /api/whatsapp/webhook/:instanceId). Só dispara
 * se o tenant tiver pelo menos um agente ativo em aurora_agents (decisão do
 * usuário: sem agente ativo, mensagem fica só registrada, sem resposta
 * automática). Reaproveita exatamente o mesmo padrão de tool-calling do chat
 * manual (/api/ai/aurora-tenant-chat), só trocando o tom do systemInstruction
 * pra um atendimento via WhatsApp (mais curto) e usando supabaseService (sem
 * sessão de usuário aqui) — por isso runAuroraTool recebe tenantId explícito.
 */
async function runAuroraAutoReply(tenantId: string, instanceId: string, contactId: string, phone: string, incomingText: string): Promise<void> {
  if (!supabaseService || !process.env.GEMINI_API_KEY) return;

  try {
    const { data: activeAgent } = await supabaseService
      .from("aurora_agents").select("id").eq("tenant_id", tenantId).eq("active", true).limit(1).maybeSingle();
    if (!activeAgent) return; // sem agente ativo — sem resposta automática, por decisão explícita do usuário.

    const { data: history } = await supabaseService
      .from("chat_messages").select("text,sender").eq("contact_id", contactId)
      .order("created_at", { ascending: false }).limit(15);
    const contents = [...(history ?? [])].reverse().map((m: any) => ({
      role: m.sender === "contact" ? "user" : "model",
      parts: [{ text: m.text }],
    }));
    if (contents.length === 0 || contents[contents.length - 1].role !== "user") {
      contents.push({ role: "user", parts: [{ text: incomingText }] });
    }

    const systemInstruction = "Você é a Aurora, atendente virtual do S.P.Y. CRM conversando por WhatsApp com um cliente/lead da empresa. Responda de forma curta, natural e cordial, como uma conversa real de WhatsApp — não como um relatório. Use as ferramentas disponíveis SOMENTE se precisar consultar dado real da empresa (pipeline, financeiro, tarefas) pra responder; nunca invente números, nomes ou datas. Responda em português do Brasil.";

    const first = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents,
      config: { systemInstruction, tools: [{ functionDeclarations: AURORA_TOOLS_WHATSAPP }] },
    });

    let replyText: string;
    const call = (first as any).functionCalls?.[0];
    if (!call) {
      replyText = typeof first.text === "function" ? (first as any).text() : (first.text ?? "");
    } else {
      const toolResult = AURORA_INTERNAL_ONLY_TOOLS.has(call.name)
        ? { error: "Ferramenta indisponível neste canal." }
        : await runAuroraTool(call.name, call.args, supabaseService, tenantId);
      const second = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
          ...contents,
          { role: "model", parts: [{ functionCall: call }] },
          { role: "user", parts: [{ functionResponse: { name: call.name, response: toolResult } }] },
        ],
        config: { systemInstruction, tools: [{ functionDeclarations: AURORA_TOOLS_WHATSAPP }] },
      });
      replyText = typeof second.text === "function" ? (second as any).text() : (second.text ?? "");
    }
    if (!replyText?.trim()) return;

    const provider = getWhatsAppProvider();
    await provider.sendTextMessage(instanceId, phone, replyText);
    await supabaseService.from("chat_messages").insert({
      tenant_id: tenantId, contact_id: contactId, whatsapp_instance_id: instanceId, text: replyText, sender: "ai", status: "sent",
    });
    await supabaseService.from("chat_contacts").update({ last_message: replyText, last_message_at: new Date().toISOString() }).eq("id", contactId);
  } catch (err: any) {
    console.error("[whatsapp/auto-reply]", err?.message);
  }
}

app.post("/api/ai/aurora-tenant-chat", requireUser, async (req: any, res: any) => {
  const { message } = req.body ?? {};
  if (!message?.trim()) return res.status(400).json({ error: "Mensagem vazia." });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: "Aurora operacional não está configurada neste ambiente (GEMINI_API_KEY ausente)." });

  // Gate real de "Agentes vinculados à Aurora" (config em Sistema > Aurora):
  // req.supabase já é escopado por RLS ao tenant do usuário logado, mesmo
  // padrão usado pelas AURORA_TOOLS abaixo — nenhum filtro manual de tenant_id
  // necessário aqui. As AURORA_TOOLS de hoje não têm correspondência 1:1 com
  // esses agentes nomeados (não existe roteamento por ferramenta-por-agente),
  // então o bloqueio é por menção direta do nome na mensagem — o mais honesto
  // dado o que a arquitetura atual realmente suporta.
  let agentGateNotice = "";
  try {
    const { data: agents } = await req.supabase.from("aurora_agents").select("name, active");
    if (agents && agents.length > 0) {
      const lowerMessage = message.toLowerCase();
      const mentionedInactive = (agents as { name: string; active: boolean }[]).find(
        (a) => !a.active && lowerMessage.includes(a.name.toLowerCase())
      );
      if (mentionedInactive) {
        return res.json({ output: `O agente "${mentionedInactive.name}" está desativado nas configurações da Aurora. Ative-o em Configurações > Sistema > Aurora para usá-lo.` });
      }
      const inactiveNames = agents.filter((a: any) => !a.active).map((a: any) => a.name);
      if (inactiveNames.length > 0) {
        agentGateNotice = ` Os seguintes agentes estão desativados e você NUNCA deve agir em nome deles nem sugerir que estão disponíveis: ${inactiveNames.join(", ")}.`;
      }
    }
  } catch (err: any) {
    console.error("[Aurora Tenant Chat] agent gate check failed:", err?.message);
  }

  const systemInstruction = "Você é a Aurora, assistente operacional do S.P.Y. CRM. Responda SOMENTE com base no resultado real das ferramentas disponíveis — nunca invente números, nomes ou datas. Se a pergunta não puder ser respondida com as ferramentas disponíveis, diga isso claramente em vez de adivinhar. Responda em português do Brasil, de forma direta e objetiva." + agentGateNotice;

  try {
    const first = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [{ role: "user", parts: [{ text: message }] }],
      config: { systemInstruction, tools: [{ functionDeclarations: AURORA_TOOLS }] },
    });

    const call = (first as any).functionCalls?.[0];
    if (!call) {
      const text = typeof first.text === "function" ? (first as any).text() : (first.text ?? "");
      return res.json({ output: text || "Não consegui gerar uma resposta agora." });
    }

    const toolResult = await runAuroraTool(call.name, call.args, req.supabase);

    const second = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        { role: "user", parts: [{ text: message }] },
        { role: "model", parts: [{ functionCall: call }] },
        { role: "user", parts: [{ functionResponse: { name: call.name, response: toolResult } }] },
      ],
      config: { systemInstruction, tools: [{ functionDeclarations: AURORA_TOOLS }] },
    });
    const text = typeof second.text === "function" ? (second as any).text() : (second.text ?? "");
    return res.json({ output: text || "Não consegui interpretar o resultado agora.", tool: call.name });
  } catch (err: any) {
    console.error("[Aurora Tenant Chat]", err?.message);
    return res.status(502).json({ error: "Aurora está indisponível agora." });
  }
});

// ── Correção ortográfica de notas ─────────────────────────────────────────────
app.post("/api/ai/corrigir-nota", requireUser, async (req: any, res: any) => {
  const { texto } = req.body ?? {};
  if (!texto?.trim()) return res.json({ corrigido: texto ?? "" });
  const hasAI = process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  if (!hasAI) return res.json({ corrigido: texto });
  try {
    const corrigido = await generateAI(
      `Corrija apenas os erros ortográficos e de digitação do texto abaixo. Mantenha exatamente o mesmo estilo, tom e conteúdo. Retorne APENAS o texto corrigido, sem explicações, sem aspas, sem prefixos.\n\nTexto: ${texto}`
    );
    return res.json({ corrigido: corrigido.trim() || texto });
  } catch {
    return res.json({ corrigido: texto });
  }
});

// ── Copilot de Lead (pré-reunião — análise estática do perfil) ────────────────
app.post("/api/ai/lead-copilot", requireUser, async (req: any, res: any) => {
  const { leadContext } = req.body ?? {};
  const hasAI = process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  if (!hasAI) return res.json({ analysis: null, error: "Nenhuma chave de IA configurada." });
  if (!leadContext) return res.status(400).json({ error: "Contexto do lead ausente." });

  try {
    const prompt = `Você é o Copilot de CRM do S.P.Y.. Analise o perfil do lead e retorne SOMENTE o JSON, sem markdown, sem texto extra.

PERFIL DO LEAD:
Nome: ${leadContext.name ?? "Não informado"}
Empresa: ${leadContext.company ?? "Não informado"}
Score IA: ${leadContext.scoreIA ?? "N/A"}
Temperatura: ${leadContext.temperature ?? "N/A"}
Estágio: ${leadContext.stage ?? "Desconhecido"}
Interesse declarado: ${leadContext.lead_interesse ?? "Não informado"}
Resumo SDR: ${leadContext.iaSummary ?? "Sem histórico"}
Produto de interesse: ${leadContext.product ?? "Não definido"}

Responda APENAS com este JSON:
{"resumo_curto":"...","probabilidade_fechamento":70,"recomendacao_proximo_passo":"...","abordagem_ideal":"...","pergunta_abertura":"...","objecoes_previstas":["...","..."],"alerta":""}`;

    const raw  = await generateAI(prompt);
    const data = extractJSON(raw);
    return res.json({ analysis: data });
  } catch (err: any) {
    console.error("[Copilot Lead] Erro:", err?.message);
    return res.json({
      analysis: {
        resumo_curto: "Análise indisponível no momento. Tente novamente.",
        probabilidade_fechamento: null,
        recomendacao_proximo_passo: "Clique em 'Analisar Lead' para tentar novamente.",
        abordagem_ideal: null,
        pergunta_abertura: null,
        objecoes_previstas: [],
        alerta: "Falha ao conectar com a IA: " + (err?.message ?? "erro desconhecido"),
      },
    });
  }
});

app.post("/api/ai/reuniao-relatorio", requireUser, async (req: any, res: any) => {
  const { transcript, notes, leadContext, pauta, reuniaoId } = req.body ?? {};
  const hasAI = process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  if (!hasAI) return res.json({ relatorio: "Relatório não disponível — configure uma chave de IA." });

  try {
    const relatorio = await generateAI(`Você é o analista de vendas do S.P.Y. CRM. Gere um relatório completo desta reunião.

LEAD: ${leadContext?.name ?? "N/A"} | ${leadContext?.company ?? "N/A"}
Score IA: ${leadContext?.scoreIA ?? "N/A"} | Temperatura: ${leadContext?.temperature ?? "N/A"}
Relatório SDR: ${leadContext?.iaSummary ?? "Sem relatório"}
Pauta: ${pauta ?? "Não definida"}

TRANSCRIÇÃO:
${(transcript ?? "Sem transcrição capturada").slice(0, 4000)}

NOTAS DO CLOSER:
${notes ?? "Sem notas"}

Gere um relatório executivo em markdown com:
## Resumo Executivo
## Pontos-Chave Discutidos
## Análise BANT Final
## Objeções e Como Foram Tratadas
## Próximos Passos (com responsáveis e prazos)
## Recomendação de Fechamento (Alta/Média/Baixa probabilidade e por quê)`);

    if (reuniaoId) {
      // Usa o client escopado com o JWT do chamador (req.supabase, de
      // requireUser) em vez do client anônimo do módulo — a RLS da Fase 1 só
      // libera esse UPDATE para quem está autenticado e pertence ao tenant
      // dono da reunião.
      const { error: updateError } = await req.supabase.from("reunioes").update({
        relatorio_ia: relatorio,
        ...(transcript ? { transcricao: transcript } : {}),
        ...(notes ? { notas_closer: notes } : {}),
        status: "Concluída",
      }).eq("id", reuniaoId);
      if (updateError) console.error("[Relatório Reunião] Erro ao salvar:", updateError.message);
    }

    res.json({ relatorio });
  } catch (err: any) {
    console.error("[Relatório Reunião]", err?.message);
    res.status(500).json({ error: "Erro ao gerar relatório." });
  }
});

// ── Admin: Gestão de Empresas Parceiras (Master) ──────────────────────────

/**
 * Exige que o usuário autenticado (via requireUser) seja Master. Só o Master
 * pode gerenciar credenciais de login de OUTROS usuários — esse é o motivo de
 * essas rotas existirem no backend: alterar e-mail/senha de outro usuário no
 * Supabase Auth exige a Admin API (auth.admin.*), que só funciona com a
 * SUPABASE_SERVICE_ROLE_KEY — uma chave que nunca pode ir para o browser.
 */
// Comparação em tempo constante (evita timing attack em segredos).
function safeEqual(a: unknown, b: unknown): boolean {
  const ba = Buffer.from(String(a ?? ""));
  const bb = Buffer.from(String(b ?? ""));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

async function requireMaster(req: any, res: express.Response, next: express.NextFunction) {
  try {
    const { data: caller, error } = await req.supabase.from("users").select("is_master").eq("id", req.user.id).maybeSingle();
    if (error || !caller?.is_master) {
      return res.status(403).json({ error: "Apenas administradores master podem executar esta ação." });
    }
    next();
  } catch (err: any) {
    console.error("[requireMaster]", err?.message);
    res.status(500).json({ error: "Erro ao verificar permissões de administrador." });
  }
}

// Fase 3 (modo de log) do plano de permissões — expõe o que os triggers de
// permission_check_log já registraram (nunca bloqueia nada, só audita).
// Restrito a master: o log expõe atividade de todos os usuários do tenant.
app.get("/api/admin/permission-check-log", requireUser, requireMaster, async (req: any, res) => {
  const { data, error } = await req.supabase
    .from("permission_check_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return res.status(500).json({ error: "Erro ao carregar o log de permissões." });
  res.json(data || []);
});

app.get("/api/admin/tenant-admin-user/:tenantId", requireUser, requireMaster, async (req: any, res) => {
  try {
    if (!supabaseService) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." });

    const { tenantId } = req.params;
    const { data: adminUser, error } = await supabaseService
      .from("users")
      .select("id, email, name")
      .eq("tenant_id", tenantId)
      .eq("is_master", false)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !adminUser) {
      return res.status(404).json({ error: "Nenhum usuário administrador encontrado para esta empresa." });
    }
    res.json({ success: true, user: adminUser });
  } catch (err: any) {
    console.error("[tenant-admin-user]", err?.message);
    res.status(500).json({ error: "Erro ao buscar administrador da empresa." });
  }
});

app.post("/api/admin/tenant-user/:userId/credentials", requireUser, requireMaster, async (req: any, res) => {
  try {
    if (!supabaseService) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." });

    const { userId } = req.params;
    const { email, password } = req.body ?? {};

    if (!email && !password) {
      return res.status(400).json({ error: "Informe um novo e-mail e/ou senha para atualizar." });
    }
    if (password && password.length < 6) {
      return res.status(400).json({ error: "A senha precisa ter pelo menos 6 caracteres." });
    }

    const authUpdates: { email?: string; password?: string } = {};
    if (email) authUpdates.email = email;
    if (password) authUpdates.password = password;

    const { error: authError } = await supabaseService.auth.admin.updateUserById(userId, authUpdates);
    if (authError) {
      console.error("[tenant-user-credentials] Falha ao atualizar credenciais:", authError.message);
      return res.status(500).json({ error: "Falha ao atualizar credenciais." });
    }

    if (email) {
      await supabaseService.from("users").update({ email }).eq("id", userId);
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error("[tenant-user-credentials]", err?.message);
    res.status(500).json({ error: "Erro ao atualizar credenciais do administrador." });
  }
});

/**
 * Cria uma empresa parceira + o usuário administrador inicial dela, num
 * fluxo administrativo (é o Master quem define e-mail/senha, não a própria
 * empresa se auto-cadastrando). Por isso usamos a Admin API com
 * email_confirm: true — a conta já nasce confirmada, sem depender de e-mail
 * de confirmação (que além de desnecessário aqui, saía com o link apontando
 * para a Site URL configurada no Supabase, não para o domínio do S.P.Y.).
 */
app.post("/api/admin/tenant", requireUser, requireMaster, async (req: any, res) => {
  if (!supabaseService) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." });

  const { tenantName, niche, adminEmail, adminPassword, plan, primaryColor, timezone, modules, implementationId } = req.body ?? {};
  if (!tenantName?.trim()) return res.status(400).json({ error: "Informe o nome da empresa." });
  if (!adminEmail?.trim()) return res.status(400).json({ error: "Informe o e-mail do administrador da empresa." });
  if (!adminPassword || adminPassword.length < 6) return res.status(400).json({ error: "A senha do administrador precisa ter pelo menos 6 caracteres." });

  try {
    const { data: existingUser } = await supabaseService.from("users").select("id").eq("email", adminEmail.trim()).maybeSingle();
    if (existingUser) return res.status(409).json({ error: "Este e-mail já está cadastrado no sistema." });

    // Criação a partir de uma implementação: a implementação (lida sob a RLS de quem pediu) é a
    // fonte da verdade — o servidor revalida se os dados estão completos e monta o cadastro da
    // empresa a partir dela; nada disso vem do corpo da requisição.
    let impl: { id: string; data: Record<string, any> } | null = null;
    if (implementationId !== undefined && implementationId !== null) {
      if (typeof implementationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(implementationId)) {
        return res.status(400).json({ error: "implementationId inválido." });
      }
      const { data: found } = await req.supabase.from("implementations").select("id, data, linked_tenant_id").eq("id", implementationId).maybeSingle();
      if (!found) return res.status(404).json({ error: "Implementação não encontrada." });
      if (found.linked_tenant_id) return res.status(409).json({ error: "Esta implementação já está vinculada a um ambiente." });
      const readiness = tenantReadiness(found.data || {});
      if (!readiness.ready) return res.status(400).json({ error: `Dados da implementação incompletos: faltam ${readiness.missing.join(", ")}.` });
      impl = { id: found.id, data: found.data || {} };
    }

    const { data: tenantData, error: tenantError } = await supabaseService
      .from("tenants")
      .insert({
        name: tenantName.trim(),
        niche: niche || "Parceira",
        plan: typeof plan === "string" && plan.trim() ? plan.trim().slice(0, 50) : "start",
        status: "Active",
        timezone: timezone?.trim() || "America/Sao_Paulo",
        primary_color: /^#[0-9A-Fa-f]{6}$/.test(primaryColor) ? primaryColor : "#2563EB",
        modules: modules && typeof modules === "object"
          ? modules
          : { crm: true, sdr: false, advDashboard: false, financeiro: true, marketing: false, educacao: false, clinica: false, produtividade: true, rh: false, bi: false, engajamento: false },
      })
      .select()
      .maybeSingle();
    if (tenantError || !tenantData) {
      console.error("[tenant-create] Falha ao criar tenant:", tenantError?.message);
      return res.status(500).json({ error: "Erro ao criar empresa." });
    }

    const { data: authData, error: authError } = await supabaseService.auth.admin.createUser({
      email: adminEmail.trim(),
      password: adminPassword,
      email_confirm: true,
    });
    if (authError || !authData.user) {
      console.error("[tenant-create] Falha ao criar conta de acesso:", authError?.message);
      await supabaseService.from("tenants").delete().eq("id", tenantData.id);
      return res.status(500).json({ error: "Erro ao criar conta de acesso do administrador." });
    }

    const { error: profileError } = await supabaseService.from("users").insert({
      id: authData.user.id,
      tenant_id: tenantData.id,
      name: `Admin ${tenantName.trim()}`,
      email: adminEmail.trim(),
      role: "Admin",
      is_master: false,
      is_tenant_admin: true,
      active: true,
    });
    if (profileError) {
      console.error("[tenant-create] Falha ao criar perfil do admin:", profileError.message);
      await supabaseService.from("tenants").delete().eq("id", tenantData.id);
      await supabaseService.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ error: "Erro ao criar o perfil do administrador." });
    }

    // Implementação: grava o cadastro da empresa (Configurações › Dados da Empresa) e vincula.
    let empresaDadosSalvos: boolean | undefined;
    let vinculada: boolean | undefined;
    if (impl) {
      const { error: empresaError } = await supabaseService.from("app_settings")
        .insert({ tenant_id: tenantData.id, key: "empresa_dados", value: buildEmpresaDados(impl.data) });
      empresaDadosSalvos = !empresaError;
      if (empresaError) console.error("[tenant-create] Falha ao gravar empresa_dados:", empresaError.message);
      const { error: linkError } = await req.supabase.from("implementations")
        .update({ linked_tenant_id: tenantData.id, last_synced_at: new Date().toISOString() }).eq("id", impl.id);
      vinculada = !linkError;
      if (linkError) console.error("[tenant-create] Falha ao vincular a implementação:", linkError.message);
    }

    res.json({ success: true, tenantId: tenantData.id, ...(impl ? { empresaDadosSalvos, vinculada } : {}) });
  } catch (err: any) {
    console.error("[tenant-create]", err?.message);
    res.status(500).json({ error: "Erro ao cadastrar empresa." });
  }
});

// ── WhatsApp — Simulador ou WAHA real (ver server/whatsappProvider.ts) ──
//
// Instâncias agora são persistidas de verdade em whatsapp_instances (RLS por
// tenant) em vez de um array em memória do processo. Qual provider concreto
// (Simulador ou WAHA) faz o trabalho por trás de cada chamada depende só de
// WAHA_API_URL estar configurada no ambiente — nunca é decidido pelo cliente.
// O frontend deve sempre consultar
// GET /api/whatsapp/provider-status antes de apresentar essas telas como uma
// conexão real, em vez de assumir isso.

function bodyWithFallback(req: any) { return req.body || {}; }

// URL pública desta implantação — usada só pra montar a URL de webhook que o
// servidor registra automaticamente no WAHA ao criar uma instância (ver
// POST /api/whatsapp/instances abaixo). Precisa apontar pro domínio real em
// produção (https://www.spycrm.com.br); sem configurar, cai no dev local.
const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || "http://localhost:3002").replace(/\/+$/, "");

function mapChatContactRow(row: any) {
  const initials = (row.name || "").split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase() || "WA";
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar || initials,
    channel: row.channel || "WhatsApp",
    lastMessage: row.last_message || "",
    time: row.last_message_at ? new Date(row.last_message_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
    unread: row.unread_count || 0,
    online: false, // WAHA não expõe presença em tempo real neste contrato — sempre false até existir.
    phone: row.phone,
    tags: row.tags || [],
  };
}

// sender no banco distingue contact/human/ai (auditoria/futura UI) — a tela
// hoje só entende "me"/"them", então human e ai colapsam em "me" (é "a gente"
// respondendo, do ponto de vista do cliente no WhatsApp).
function mapChatMessageRow(row: any) {
  return {
    id: row.id,
    text: row.text,
    sender: row.sender === "contact" ? "them" : "me",
    time: new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    status: row.status || undefined,
  };
}

function mapInstanceRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || "-",
    status: row.status,
    apiKey: row.api_key,
    webhookUrl: row.webhook_url || "",
    qrcode: row.qrcode || "",
    provider: row.provider,
    createdAt: row.created_at,
  };
}

app.get("/api/whatsapp/provider-status", requireUser, async (_req: any, res) => {
  res.json({ provider: getActiveProviderName(), configured: isWahaConfigured() });
});

app.get("/api/whatsapp/instances", requireUser, async (req: any, res) => {
  const { data, error } = await req.supabase.from("whatsapp_instances").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error("[whatsapp/instances GET]", error.message);
    return res.status(500).json({ error: "Erro ao carregar instâncias." });
  }
  res.json((data || []).map(mapInstanceRow));
});

app.post("/api/whatsapp/instances", requireUser, async (req: any, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Nome da instância é obrigatório" });

  const provider = getWhatsAppProvider();
  const { data: row, error: insertError } = await req.supabase
    .from("whatsapp_instances")
    .insert({ name, status: "DISCONNECTED", provider: provider.name })
    .select().maybeSingle();
  if (insertError || !row) {
    console.error("[whatsapp/instances POST]", insertError?.message);
    return res.status(500).json({ error: "Erro ao criar instância." });
  }

  // A URL de webhook não é mais digitada pelo usuário — é montada aqui, com
  // o token gerado pela própria migration (whatsapp_instances.webhook_secret),
  // e registrada direto no WAHA. Sem isso, o usuário precisava colar uma URL
  // manualmente nas Configurações sem nada real do outro lado pra receber.
  const computedWebhookUrl = `${PUBLIC_APP_URL}/api/whatsapp/webhook/${row.id}?secret=${row.webhook_secret}`;

  try {
    const created = await provider.createInstance(row.id, computedWebhookUrl);
    const { data: updated } = await req.supabase
      .from("whatsapp_instances")
      .update({ api_key: created.apiKey, webhook_url: computedWebhookUrl })
      .eq("id", row.id).select().maybeSingle();
    return res.json(mapInstanceRow(updated || row));
  } catch (err: any) {
    console.error(`[whatsapp/instances POST] provider=${provider.name}`, err?.message);
    // A linha já existe no banco (estado DISCONNECTED) — devolve mesmo assim
    // em vez de deixar o usuário sem instância nenhuma; ele pode tentar
    // conectar de novo depois.
    return res.json(mapInstanceRow(row));
  }
});

app.post("/api/whatsapp/instances/:id/qrcode", requireUser, async (req: any, res) => {
  const { id } = req.params;
  const { data: inst, error } = await req.supabase.from("whatsapp_instances").select("*").eq("id", id).maybeSingle();
  if (error || !inst) return res.status(404).json({ error: "Instância não encontrada" });

  const provider = getWhatsAppProvider();
  try {
    const result = await provider.getQrCode(id);
    await req.supabase.from("whatsapp_instances").update({ status: result.status, qrcode: result.qrcode }).eq("id", id);
    res.json(result);
  } catch (err: any) {
    console.error(`[whatsapp/instances/qrcode] provider=${provider.name}`, err?.message);
    res.status(502).json({ error: `Falha ao gerar QR code (${provider.name}): ${err?.message || "erro desconhecido"}` });
  }
});

app.post("/api/whatsapp/instances/:id/connect", requireUser, async (req: any, res) => {
  const { id } = req.params;
  const { data: inst, error } = await req.supabase.from("whatsapp_instances").select("*").eq("id", id).maybeSingle();
  if (error || !inst) return res.status(404).json({ error: "Instância não encontrada" });

  const provider = getWhatsAppProvider();
  try {
    const result = await provider.getConnectionState(id);
    const { data: updated } = await req.supabase
      .from("whatsapp_instances")
      .update({ status: result.status, phone: result.phone ?? inst.phone, qrcode: null })
      .eq("id", id).select().maybeSingle();
    res.json({ status: result.status, instance: mapInstanceRow(updated || inst) });
  } catch (err: any) {
    console.error(`[whatsapp/instances/connect] provider=${provider.name}`, err?.message);
    res.status(502).json({ error: `Falha ao verificar conexão (${provider.name}): ${err?.message || "erro desconhecido"}` });
  }
});

app.delete("/api/whatsapp/instances/:id", requireUser, async (req: any, res) => {
  const { id } = req.params;
  // Posse primeiro: só a instância visível ao chamador (RLS) chega ao gateway WAHA compartilhado.
  const { data: owned, error: ownErr } = await req.supabase.from("whatsapp_instances").select("id").eq("id", id).maybeSingle();
  if (ownErr) return res.status(500).json({ error: "Erro ao remover instância." });
  if (!owned) return res.status(404).json({ error: "Instância não encontrada." });
  const provider = getWhatsAppProvider();
  try { await provider.deleteInstance(owned.id); } catch (err: any) { console.error(`[whatsapp/instances DELETE] provider=${provider.name}`, err?.message); }
  const { error } = await req.supabase.from("whatsapp_instances").delete().eq("id", owned.id).select("id");
  if (error) return res.status(500).json({ error: "Erro ao remover instância." });
  res.json({ success: true, message: `Instância ${owned.id} removida` });
});

app.put("/api/whatsapp/instances/:id", requireUser, async (req: any, res) => {
  const { id } = req.params;
  // webhookUrl não é mais editável por aqui de propósito — é gerado e
  // registrado no WAHA só na criação (POST acima), com o token da própria
  // instância. Aceitar edição manual aqui reabriria a mesma brecha que
  // motivou tirar o campo livre das Configurações.
  const { name, phone, status } = req.body;
  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (status !== undefined) updates.status = status;

  const { data: updated, error } = await req.supabase.from("whatsapp_instances").update(updates).eq("id", id).select().maybeSingle();
  if (error || !updated) return res.status(404).json({ error: "Instância não encontrada" });
  res.json(mapInstanceRow(updated));
});

/**
 * Webhook receiver do WAHA — chamado pelo próprio gateway WAHA quando uma
 * mensagem chega no número conectado, NÃO por um usuário logado (não tem
 * sessão/JWT de app, então nunca usa req.supabase aqui, sempre supabaseService
 * + tenant_id resolvido a partir da própria linha de whatsapp_instances,
 * nunca de um campo do payload). Verifica o token (?secret=) antes de
 * processar qualquer coisa — sem isso, seria um POST público que qualquer um
 * poderia chamar pra injetar mensagem falsa em qualquer tenant.
 *
 * Formato do payload (evento "message" do WAHA): baseado no contrato REST
 * público documentado em https://waha.devlike.pro — igual ao resto do
 * WAHAProvider (ver server/whatsappProvider.ts), isso nunca foi exercitado
 * contra um servidor WAHA real neste ambiente até este ponto; tratar como
 * não-validado até confirmar contra a instância real já configurada.
 */
app.post("/api/whatsapp/webhook/:instanceId", async (req: any, res) => {
  const { instanceId } = req.params;
  // Aceita header (preferido) ou ?secret= (único formato que o WAHA suporta).
  const headerSecret = req.headers["x-webhook-secret"];
  const secret = typeof headerSecret === "string" && headerSecret
    ? headerSecret
    : (typeof req.query.secret === "string" ? req.query.secret : "");

  if (!supabaseService) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." });

  try {
    const { data: inst } = await supabaseService
      .from("whatsapp_instances")
      .select("id, tenant_id, webhook_secret")
      .eq("id", instanceId)
      .maybeSingle();
    if (!inst || !secret || !safeEqual(secret, inst.webhook_secret)) {
      return res.status(403).json({ error: "Token de webhook inválido." });
    }

    // Responde rápido pro WAHA não re-tentar por timeout — o processamento
    // (persistência + auto-reply, que chama a IA) roda depois, sem bloquear
    // a resposta HTTP.
    res.status(200).json({ received: true });

    const body = req.body ?? {};
    if (body.event !== "message") return; // session.status e outros eventos: só ack, sem processar.

    const payload = body.payload ?? {};
    if (payload.fromMe) return; // eco da própria mensagem enviada por nós — já persistida no envio.

    const waMessageId: string | undefined = payload.id;
    const rawFrom: string = payload.from || "";
    const phone = rawFrom.replace(/@c\.us$/, "").replace(/@s\.whatsapp\.net$/, "");
    const text: string = payload.body || payload.text || "";
    if (!phone || !text) return;

    const { data: contact, error: contactErr } = await supabaseService
      .from("chat_contacts")
      .upsert(
        { tenant_id: inst.tenant_id, whatsapp_instance_id: inst.id, phone, name: payload.notifyName || phone, last_message: text, last_message_at: new Date().toISOString() },
        { onConflict: "whatsapp_instance_id,phone" }
      )
      .select().maybeSingle();
    if (contactErr || !contact) {
      console.error("[whatsapp/webhook] upsert contato falhou:", contactErr?.message);
      return;
    }
    // unread_count separado do upsert acima (upsert sobrescreveria com 0 de novo).
    await supabaseService.from("chat_contacts").update({ unread_count: (contact.unread_count || 0) + 1 }).eq("id", contact.id);

    // insert() simples em vez de upsert(onConflict) — o PostgREST/supabase-js
    // não resolve o arbiter do UNIQUE(wa_message_id) de forma confiável aqui
    // (testado direto: erro "no unique or exclusion constraint matching",
    // mesmo com a constraint existindo e o schema recarregado). Trata
    // violação de unicidade (23505 — reentrega do mesmo evento pelo WAHA)
    // como esperada, não como erro real.
    const { error: msgErr } = await supabaseService
      .from("chat_messages")
      .insert({ tenant_id: inst.tenant_id, contact_id: contact.id, whatsapp_instance_id: inst.id, text, sender: "contact", status: "received", wa_message_id: waMessageId || null });
    if (msgErr && msgErr.code !== "23505") console.error("[whatsapp/webhook] insert mensagem falhou:", msgErr.message);
    if (msgErr) return; // duplicata (23505) ou falha real — não dispara auto-reply de novo pro mesmo evento.

    await runAuroraAutoReply(inst.tenant_id, inst.id, contact.id, contact.phone, text);
  } catch (err: any) {
    console.error("[whatsapp/webhook]", err?.message);
    // Resposta HTTP já foi enviada acima — só loga.
  }
});

app.get("/api/whatsapp/contacts", requireUser, async (req: any, res) => {
  // Contatos crescem com o tempo igual as outras tabelas de alto volume —
  // 500 mais recentes por conversa (order por last_message_at) é generoso
  // pro uso real de uma caixa de entrada; sem isso, sofreria do mesmo
  // truncamento silencioso em 1000 do PostgREST pra tenants grandes.
  const { data, error } = await req.supabase.from("chat_contacts").select("*").order("last_message_at", { ascending: false, nullsFirst: false }).limit(500);
  if (error) {
    console.error("[whatsapp/contacts GET]", error.message);
    return res.status(500).json({ error: "Erro ao buscar contatos." });
  }
  res.json((data || []).map(mapChatContactRow));
});

app.post("/api/whatsapp/contacts", requireUser, async (req: any, res) => {
  const { name, phone, tags = ["lead"] } = req.body;
  if (!name || !phone) return res.status(400).json({ error: "Nome e Telefone são obrigatórios" });
  const tenantId = await resolveRequestedTenantId(req, res);
  if (!tenantId) return;
  const cleanPhone = phone.startsWith("+") ? phone : `+55 ${phone}`;

  const { data: existing } = await req.supabase.from("chat_contacts").select("*").eq("phone", cleanPhone).maybeSingle();
  if (existing) return res.json(mapChatContactRow(existing));

  // Contato criado manualmente pelo CRM (não por mensagem recebida) — sem
  // instância vinculada ainda; associa à primeira instância conectada do
  // tenant, se houver (pra "Enviar" já funcionar na hora).
  const { data: inst } = await req.supabase.from("whatsapp_instances").select("id").eq("status", "CONNECTED").limit(1).maybeSingle();

  const { data: created, error } = await req.supabase.from("chat_contacts")
    .insert({ tenant_id: tenantId, whatsapp_instance_id: inst?.id ?? null, name, phone: cleanPhone, tags, last_message: "Nova conversa iniciada", last_message_at: new Date().toISOString() })
    .select().maybeSingle();
  if (error || !created) {
    console.error("[whatsapp/contacts POST]", error?.message);
    return res.status(500).json({ error: "Erro ao criar contato." });
  }
  res.json(mapChatContactRow(created));
});

app.get("/api/whatsapp/messages/:contactId", requireUser, async (req: any, res) => {
  const { contactId } = req.params;
  // Buscava o histórico INTEIRO da conversa sem limite, a cada poll (esta
  // tela consulta de novo a cada poucos segundos enquanto o chat tá aberto)
  // — uma conversa de anos com um cliente recorrente facilmente passa de
  // milhares de mensagens. Traz as 200 mais recentes (desc) e inverte pra
  // manter a ordem cronológica que a UI espera (mais antiga primeiro).
  const { data, error } = await req.supabase.from("chat_messages").select("*").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(200);
  if (error) {
    console.error("[whatsapp/messages GET]", error.message);
    return res.status(500).json({ error: "Erro ao buscar mensagens." });
  }
  res.json([...(data || [])].reverse().map(mapChatMessageRow));
});

app.post("/api/whatsapp/messages/send", requireUser, async (req: any, res) => {
  const { contactId, text } = req.body;
  if (!contactId || !text) return res.status(400).json({ error: "ID do contato e texto são obrigatórios" });
  const tenantId = await resolveRequestedTenantId(req, res);
  if (!tenantId) return;

  const { data: contact } = await req.supabase.from("chat_contacts").select("*").eq("id", contactId).maybeSingle();
  if (!contact) return res.status(404).json({ error: "Contato não encontrado" });

  const provider = getWhatsAppProvider();
  let instanceIdForSend = contact.whatsapp_instance_id;
  if (provider.name === "waha") {
    // Só entra aqui se WAHA_API_URL estiver configurada — nesse modo o envio
    // precisa ser real (nada de eco local fingindo sucesso).
    if (!contact.phone) return res.status(400).json({ error: "Contato sem telefone cadastrado — não é possível enviar via WhatsApp." });
    if (!instanceIdForSend) {
      const { data: inst } = await req.supabase.from("whatsapp_instances").select("id").eq("status", "CONNECTED").limit(1).maybeSingle();
      if (!inst) return res.status(409).json({ error: "Nenhuma instância WhatsApp conectada. Conecte uma instância antes de enviar mensagens." });
      instanceIdForSend = inst.id;
    }
    try {
      await provider.sendTextMessage(instanceIdForSend, contact.phone, text);
    } catch (err: any) {
      console.error("[whatsapp/messages/send] waha", err?.message);
      return res.status(502).json({ error: `Falha ao enviar mensagem via WAHA: ${err?.message || "erro desconhecido"}` });
    }
  }

  const { data: inserted, error } = await req.supabase.from("chat_messages")
    .insert({ tenant_id: tenantId, contact_id: contactId, whatsapp_instance_id: instanceIdForSend, text, sender: "human", status: "sent" })
    .select().maybeSingle();
  if (error || !inserted) {
    console.error("[whatsapp/messages/send] insert", error?.message);
    return res.status(500).json({ error: "Mensagem enviada mas falhou ao registrar no histórico." });
  }
  await req.supabase.from("chat_contacts").update({ last_message: text, last_message_at: new Date().toISOString() }).eq("id", contactId);
  res.json({ success: true, message: mapChatMessageRow(inserted) });
});

app.post("/api/whatsapp/copilot/analyze", requireUser, async (req: any, res) => {
  const { contactId } = req.body;
  if (!contactId) return res.status(400).json({ error: "contactId é obrigatório" });
  const [{ data: chatHistory }, { data: contact }] = await Promise.all([
    req.supabase.from("chat_messages").select("text,sender").eq("contact_id", contactId).order("created_at", { ascending: true }).limit(200),
    req.supabase.from("chat_contacts").select("name").eq("id", contactId).maybeSingle(),
  ]);
  if (!chatHistory || chatHistory.length === 0) {
    return res.json({
      suggestion: "Ainda não há mensagens registradas com este contato para analisar. Tente fazer uma saudação cortês, introduzindo o S.P.Y. CRM e perguntando como pode auxiliá-lo.",
      sentiment: "Neutro"
    });
  }
  const conversationText = chatHistory.map((m: any) => `${m.sender === "contact" ? "Cliente" : "Vendedor/Atendente"}: ${m.text}`).join("\n");
  const promptContext = `Você é o S.P.Y. Copilot, um assistente especializado em CRM, Vendas e Atendimento via WhatsApp.
  O cliente se chama: ${contact ? contact.name : "Cliente"}.
  O histórico de mensagens é este:
  ${conversationText}
  Sua tarefa é:
  1. Analisar brevemente o status/intenção do cliente (especialmente dúvidas de frete, preço, fechamento).
  2. Sugerir a RESPOSTA PERFEITA em português para o vendedor copiar e enviar.
  Retorne a resposta no formato JSON:
  - analysis (uma frase resumindo o sentimento e status das negociações)
  - suggestion (o rascunho exato da mensagem pronta para o vendedor usar)
  - sentiment (Positivo, Neutro ou Negativo)`;
  try {
    if (!process.env.GEMINI_API_KEY) {
      const lastMsg = chatHistory[chatHistory.length - 1];
      let sugg = `Olá ${contact ? contact.name : ""}, compreendo sua dúvida! Estamos analisando sua solicitação. De qualquer forma, gostaria de agendar uma ligação rápida hoje às 14h para fecharmos os detalhes?`;
      if (lastMsg.text.toLowerCase().includes("frete")) {
        sugg = `Olá ${contact ? contact.name : ""}, com certeza! Para sua região, nós conseguimos fazer o frete com um desconto especial de 50%, ou até GRÁTIS se fecharmos o contrato Pro hoje. O que acha?`;
      }
      return res.json({ analysis: "O cliente demonstrou interesse inicial. A IA sugere oferecer atendimento ágil para acelerar o fechamento.", suggestion: sugg, sentiment: "Positivo" });
    }
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: promptContext,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { analysis: { type: Type.STRING }, suggestion: { type: Type.STRING }, sentiment: { type: Type.STRING } },
          required: ["analysis", "suggestion", "sentiment"]
        },
      },
    });
    res.json(JSON.parse(response.text ?? "{}"));
  } catch (e) {
    console.error("Copilot analysis failure:", e);
    res.status(500).json({ error: "Erro de processamento da IA" });
  }
});

// ── Testes reais de integrações (Configurações → Integrações) ──────────────
//
// "Disparar Teste" (webhooks globais e SDR) e "Testar Conexão TLS" (SMTP)
// eram puro teatro: um toast.promise em cima de um setTimeout, sem nenhuma
// chamada de rede de verdade — sempre "sucesso", mesmo com URL/credencial
// inválida ou vazia. Isso roda no backend (não no navegador) porque muitos
// receptores de webhook (n8n, Make, Zapier) não respondem com header CORS,
// então um fetch direto do browser falharia mesmo com a URL certa.

app.post("/api/integrations/webhook-test", requireUser, async (req: any, res) => {
  const { url, event, payload } = req.body ?? {};
  if (!url) return res.status(400).json({ error: "URL do webhook é obrigatória." });
  try {
    const safeUrl = await assertSafeHttpUrl(url).catch((e: any) => { res.status(400).json({ ok: false, error: e?.message || "URL inválida." }); return null; });
    if (!safeUrl) return;
    const started = Date.now();
    // Sem redirects: um 302 poderia apontar para host interno (SSRF).
    const response = await axios.post(
      safeUrl.toString(),
      payload ?? { event: event || "test_ping", test: true, timestamp: new Date().toISOString() },
      { timeout: 8000, validateStatus: () => true, maxRedirects: 0, maxContentLength: 1_000_000 }
    );
    const ok = response.status >= 200 && response.status < 300;
    res.json({ ok, status: response.status, latencyMs: Date.now() - started });
  } catch (err: any) {
    res.json({ ok: false, status: null, error: err?.code === "ECONNABORTED" ? "Tempo de resposta esgotado (timeout)." : (err?.message || "Falha ao conectar ao endpoint.") });
  }
});

// ── Conector Externo (FASE 5.4 — mandato Aurora+SPY+Integrações, V1 API/Webhook-only) ──────
// Escrita/leitura do secret_value nunca passa pelo cliente do tenant (RLS nega tudo na tabela
// base) — só estas rotas, via supabaseService. tenant_id nunca vem do corpo da requisição:
// resolvido aqui a partir do próprio usuário autenticado (mesmo princípio de /api/v1/leads).
async function requireTenantAdmin(req: any, res: express.Response, next: express.NextFunction) {
  try {
    const { data: caller, error } = await req.supabase
      .from("users")
      .select("is_master, is_tenant_admin, tenant_id")
      .eq("id", req.user.id)
      .maybeSingle();
    if (error || !caller) {
      return res.status(403).json({ error: "Não foi possível verificar permissões." });
    }
    if (!caller.is_master && !caller.is_tenant_admin) {
      return res.status(403).json({ error: "Apenas administradores da empresa podem gerenciar conectores externos." });
    }
    req.tenantId = caller.tenant_id;
    next();
  } catch (err: any) {
    console.error("[requireTenantAdmin]", err?.message);
    res.status(500).json({ error: "Erro ao verificar permissões." });
  }
}

app.post("/api/integrations/external", requireUser, requireTenantAdmin, async (req: any, res) => {
  if (!supabaseService) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." });
  const { name, base_url, auth_type = "none", auth_header_name, secret_value, sync_events = [] } = req.body ?? {};
  if (!name || !base_url) return res.status(400).json({ error: "Nome e URL base são obrigatórios." });
  if (!["none", "api_key", "bearer", "basic"].includes(auth_type)) {
    return res.status(400).json({ error: "Tipo de autenticação inválido." });
  }
  try {
    new URL(base_url);
    if (!base_url.startsWith("https://")) return res.status(400).json({ error: "A URL base deve usar HTTPS." });
  } catch {
    return res.status(400).json({ error: "URL base inválida." });
  }

  const { data, error } = await supabaseService
    .from("external_integrations")
    .insert({
      tenant_id: req.tenantId,
      name,
      base_url,
      auth_type,
      auth_header_name: auth_header_name || null,
      secret_value: secret_value || null,
      sync_events,
      updated_by: req.user.id,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[Conector Externo] Erro ao criar:", error.message);
    return res.status(500).json({ error: "Falha ao salvar o conector." });
  }
  res.status(201).json({ success: true, id: data?.id });
});

app.put("/api/integrations/external/:id", requireUser, requireTenantAdmin, async (req: any, res) => {
  if (!supabaseService) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." });
  const { name, base_url, auth_type, auth_header_name, secret_value, sync_events, active } = req.body ?? {};

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: req.user.id };
  if (name !== undefined) updates.name = name;
  if (base_url !== undefined) {
    if (!base_url.startsWith("https://")) return res.status(400).json({ error: "A URL base deve usar HTTPS." });
    updates.base_url = base_url;
  }
  if (auth_type !== undefined) updates.auth_type = auth_type;
  if (auth_header_name !== undefined) updates.auth_header_name = auth_header_name || null;
  // secret_value só é sobrescrito se um valor novo, não-vazio, foi enviado — permite editar
  // outros campos (ex.: desativar) sem precisar re-digitar o segredo já salvo.
  if (secret_value) updates.secret_value = secret_value;
  if (sync_events !== undefined) updates.sync_events = sync_events;
  if (active !== undefined) updates.active = active;

  // .eq("tenant_id", ...) garante que um admin não pode editar o conector de outro tenant
  // mesmo sabendo o id (RLS na tabela base nega tudo pro cliente, mas esta rota usa
  // supabaseService — o isolamento aqui é feito explicitamente na query, não pela RLS).
  const { error } = await supabaseService
    .from("external_integrations")
    .update(updates)
    .eq("id", req.params.id)
    .eq("tenant_id", req.tenantId);
  if (error) {
    console.error("[Conector Externo] Erro ao atualizar:", error.message);
    return res.status(500).json({ error: "Falha ao atualizar o conector." });
  }
  res.json({ success: true });
});

app.delete("/api/integrations/external/:id", requireUser, requireTenantAdmin, async (req: any, res) => {
  if (!supabaseService) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." });
  const { error } = await supabaseService
    .from("external_integrations")
    .delete()
    .eq("id", req.params.id)
    .eq("tenant_id", req.tenantId);
  if (error) {
    console.error("[Conector Externo] Erro ao excluir:", error.message);
    return res.status(500).json({ error: "Falha ao excluir o conector." });
  }
  res.json({ success: true });
});

// Teste real: busca o conector (com o segredo) no backend, monta o mesmo header que o
// dispatcher (dispatch_external_integration_event) montaria, e faz uma chamada de verdade —
// não é um setTimeout/Math.random() fingindo sucesso (mesmo cuidado já aplicado no teste do
// Meta Pixel).
app.post("/api/integrations/external/:id/test", requireUser, requireTenantAdmin, async (req: any, res) => {
  if (!supabaseService) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." });
  const { data: integration, error } = await supabaseService
    .from("external_integrations")
    .select("*")
    .eq("id", req.params.id)
    .eq("tenant_id", req.tenantId)
    .maybeSingle();
  if (error || !integration) return res.status(404).json({ error: "Conector não encontrado." });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (integration.auth_type === "bearer" && integration.secret_value) {
    headers["Authorization"] = `Bearer ${integration.secret_value}`;
  } else if (integration.auth_type === "api_key" && integration.secret_value) {
    headers[integration.auth_header_name || "X-API-Key"] = integration.secret_value;
  } else if (integration.auth_type === "basic" && integration.secret_value) {
    headers["Authorization"] = `Basic ${Buffer.from(integration.secret_value).toString("base64")}`;
  }

  try {
    // Mesma guarda do webhook-test: só https público, sem redirects (evita SSRF interno).
    const safeUrl = await assertSafeHttpUrl(integration.base_url).catch((e: any) => { res.status(400).json({ ok: false, error: e?.message || "URL inválida." }); return null; });
    if (!safeUrl) return;
    const started = Date.now();
    const response = await axios.post(
      safeUrl.toString(),
      { event: "test_ping", integration: integration.name, timestamp: new Date().toISOString() },
      { headers, timeout: 8000, validateStatus: () => true, maxRedirects: 0, maxContentLength: 1_000_000 }
    );
    const ok = response.status >= 200 && response.status < 300;
    res.json({ ok, status: response.status, latencyMs: Date.now() - started });
  } catch (err: any) {
    res.json({ ok: false, status: null, error: err?.code === "ECONNABORTED" ? "Tempo de resposta esgotado (timeout)." : (err?.message || "Falha ao conectar ao endpoint.") });
  }
});

app.post("/api/integrations/smtp-test", requireUser, async (req: any, res) => {
  const { smtpServer, smtpPort, encryption, smtpUser, smtpPass } = req.body ?? {};
  if (!smtpServer || !smtpPort || !smtpUser || !smtpPass) {
    return res.status(400).json({ error: "Preencha host, porta, usuário e senha antes de testar." });
  }
  try {
    // Só portas SMTP padrão e host público (evita port-scan/SSRF interno).
    await assertSafeSmtpTarget(smtpServer, smtpPort);
    const transporter = nodemailer.createTransport({
      host: smtpServer,
      port: Number(smtpPort),
      secure: encryption === "SSL/TLS", // true = TLS implícito (465); StartTLS/Nenhuma negociam na porta 587/25
      auth: { user: smtpUser, pass: smtpPass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
    await transporter.verify();
    res.json({ ok: true });
  } catch (err: any) {
    res.json({ ok: false, error: err?.message || "Falha na autenticação SMTP." });
  }
});

// Meta Conversions API (CAPI) — dispara um evento de teste real contra a
// Graph API usando o Pixel ID e o token informados pelo tenant. Antes disso o
// botão de teste era um setTimeout com Math.random() que "sempre dava certo"
// — corrigido pra ser uma chamada HTTP real, cuja resposta (aceita/rejeitada)
// é repassada ao frontend sem reinterpretação.
app.post("/api/integrations/meta-pixel-test", requireUser, async (req: any, res) => {
  const { pixelId, accessToken, event } = req.body ?? {};
  if (!pixelId || !accessToken) return res.status(400).json({ error: "Pixel ID e Token de Acesso são obrigatórios." });
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(pixelId)}/events`,
      {
        data: [{
          event_name: event || "Lead",
          event_time: Math.floor(Date.now() / 1000),
          action_source: "system_generated",
          user_data: { client_user_agent: "S.P.Y. CRM Integration Test" },
        }],
        access_token: accessToken,
      },
      { timeout: 10000, validateStatus: () => true }
    );
    const ok = response.status >= 200 && response.status < 300 && !response.data?.error;
    res.json({ ok, status: response.status, error: response.data?.error?.message });
  } catch (err: any) {
    res.json({ ok: false, status: null, error: err?.message || "Falha ao contatar a Graph API do Meta." });
  }
});

// GA4 Measurement Protocol — usa o endpoint oficial de depuração do Google
// (/debug/mp/collect), que valida o payload sem exigir OAuth. Não confundir
// com a API de conversões do Google Ads propriamente dita (essa exige
// developer token + OAuth via Google Ads API e não está implementada).
app.post("/api/integrations/ga4-test", requireUser, async (req: any, res) => {
  const { measurementId, apiSecret, event } = req.body ?? {};
  if (!measurementId || !apiSecret) return res.status(400).json({ error: "Measurement ID e API Secret são obrigatórios." });
  try {
    const response = await axios.post(
      `https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`,
      { client_id: "spy-crm-integration-test", events: [{ name: event || "generate_lead", params: {} }] },
      { timeout: 10000, validateStatus: () => true }
    );
    const messages = response.data?.validationMessages || [];
    const ok = response.status === 200 && messages.length === 0;
    res.json({ ok, status: response.status, validationMessages: messages });
  } catch (err: any) {
    res.json({ ok: false, status: null, error: err?.message || "Falha ao contatar o endpoint de validação do GA4." });
  }
});

// Teste de credenciais de gateway de pagamento — chamada real e de baixo
// impacto (endpoint de "quem sou eu"/conta) contra cada gateway, nunca uma
// cobrança de verdade. Antes disso o botão fazia só um setTimeout que sempre
// resolvia com sucesso e o "Salvar Credenciais" nem persistia o que o usuário
// digitava (inputs eram `defaultValue` sem `onChange`) — os dois foram
// corrigidos (o salvamento no frontend, em ConfigIntegracoesApps.tsx).
app.post("/api/integrations/payment-gateway-test", requireUser, async (req: any, res) => {
  const { provider, environment, secretKey } = req.body ?? {};
  if (!provider || !secretKey) return res.status(400).json({ error: "Provider e chave secreta são obrigatórios." });
  try {
    if (provider === "mercadopago") {
      const { data } = await axios.get("https://api.mercadopago.com/users/me", {
        headers: { Authorization: `Bearer ${secretKey}` }, timeout: 10000,
      });
      return res.json({ ok: true, accountLabel: data?.email || data?.nickname || `Usuário ${data?.id}` });
    }
    if (provider === "stripe") {
      const { data } = await axios.get("https://api.stripe.com/v1/account", {
        headers: { Authorization: `Bearer ${secretKey}` }, timeout: 10000,
      });
      return res.json({ ok: true, accountLabel: data?.settings?.dashboard?.display_name || data?.id });
    }
    if (provider === "asaas") {
      const base = environment === "production" ? "https://api.asaas.com/v3" : "https://sandbox.asaas.com/api/v3";
      const { data } = await axios.get(`${base}/myAccount`, {
        headers: { access_token: secretKey }, timeout: 10000,
      });
      return res.json({ ok: true, accountLabel: data?.email || data?.name });
    }
    return res.status(400).json({ error: "Gateway não reconhecido." });
  } catch (err: any) {
    const status = err?.response?.status;
    res.json({ ok: false, error: status ? `Gateway recusou as credenciais (HTTP ${status}).` : (err?.message || "Falha ao contatar o gateway.") });
  }
});

app.use("/api/google-calendar", createGoogleCalendarRouter({ requireUser, supabaseService }));

// Global error handler — catches any unhandled throws in async routes. Nunca
// devolve err.message pro cliente (pode conter detalhe de tabela/coluna/constraint
// do Postgres) — detalhe completo só no log do servidor.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[S.P.Y.] Unhandled error:", err?.message || err);
  if (!res.headersSent) {
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

// ── Export for Vercel Serverless ───────────────────────────────────────────

export default app;

