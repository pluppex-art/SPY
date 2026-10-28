// SaaS: cobrança por assinatura, teto de IA por tenant e LGPD.
//
// Regras de segurança (iguais às do restante do servidor):
//  - tenant_id NUNCA vem às cegas do cliente: usuário → users.tenant_id; master/parceiro trocando
//    de empresa → header x-active-tenant-id, aceito só depois de has_tenant_access().
//  - Escritas de billing/orçamento passam pelo client DO USUÁRIO (RLS = só super admin escreve);
//    supabaseService só grava trilhas (billing_events, lgpd_requests, ai_usage_log) depois da rota
//    já ter validado tenant e permissão.
//  - Tenant SEM linha em tenant_subscriptions = ativo (não suspende ninguém por omissão).

import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AsyncLocalStorage } from "async_hooks";
import { timingSafeEqual } from "crypto";
import axios from "axios";
import rateLimit from "express-rate-limit";

// ── Contexto de IA por requisição (quem está gastando) ──────────────────────
export const aiContext = new AsyncLocalStorage<{ tenantId: string }>();

type Deps = {
  requireUser: (req: any, res: Response, next: NextFunction) => any;
  requireMaster: (req: any, res: Response, next: NextFunction) => any;
  supabase: SupabaseClient | null;
  supabaseService: SupabaseClient | null;
  supabaseUrl: string;
  supabaseKey: string;
  createUserClient: (token: string) => SupabaseClient;
};

const BLOCKED_STATUSES = new Set(["suspended", "canceled"]);

function bearer(req: Request): string | undefined {
  const h = req.headers["authorization"] as string | undefined;
  return h?.startsWith("Bearer ") ? h.slice(7) : undefined;
}

function safeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Valor interpolado em filtro .or()/.ilike() do PostgREST: tira o que altera a sintaxe do filtro. */
function pgrstSafe(v: string): string {
  return v.replace(/[,()*%\\"'`:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Tenant efetivo da requisição (já autenticada: req.user / req.supabase vêm do requireUser). */
async function activeTenantOf(req: any): Promise<string | null> {
  const { data: caller } = await req.supabase.from("users").select("tenant_id").eq("id", req.user.id).maybeSingle();
  const own = caller?.tenant_id as string | undefined;
  if (!own) return null;
  const hdr = req.headers["x-active-tenant-id"];
  const wanted = typeof hdr === "string" && hdr ? hdr : (typeof req.query.tenantId === "string" ? req.query.tenantId : "");
  if (!wanted || wanted === own) return own;
  const { data: allowed } = await req.supabase.rpc("has_tenant_access", { target_tenant_id: wanted });
  return allowed ? wanted : null;
}

export function createSaas(deps: Deps) {
  const { requireUser, requireMaster, supabase, supabaseService, createUserClient } = deps;

  // ── Estado de cobrança/orçamento com cache curto (evita 2 queries por chamada de IA) ──
  const stateCache = new Map<string, { at: number; v: { blocked: boolean; used: number; limit: number | null; warnPct: number; hardStop: boolean } }>();
  const invalidate = (tenantId: string) => stateCache.delete(tenantId);

  async function tenantState(tenantId: string) {
    const hit = stateCache.get(tenantId);
    if (hit && Date.now() - hit.at < 60_000) return hit.v;
    if (!supabaseService) return { blocked: false, used: 0, limit: null, warnPct: 80, hardStop: true };
    const [sub, budget, used] = await Promise.all([
      supabaseService.from("tenant_subscriptions").select("status").eq("tenant_id", tenantId).maybeSingle(),
      supabaseService.from("tenant_ai_budget").select("monthly_token_limit, warn_pct, hard_stop").eq("tenant_id", tenantId).maybeSingle(),
      supabaseService.rpc("tenant_ai_tokens_month", { p_tenant: tenantId }),
    ]);
    const v = {
      blocked: !!sub.data && BLOCKED_STATUSES.has(sub.data.status),
      used: Number(used.data ?? 0),
      limit: budget.data?.monthly_token_limit != null ? Number(budget.data.monthly_token_limit) : null,
      warnPct: budget.data?.warn_pct ?? 80,
      hardStop: budget.data?.hard_stop ?? true,
    };
    stateCache.set(tenantId, { at: Date.now(), v });
    return v;
  }

  /** IA liberada para este tenant? (não suspenso e dentro do teto mensal quando há hard stop) */
  async function isAiAllowed(tenantId: string): Promise<boolean> {
    const st = await tenantState(tenantId);
    if (st.blocked) return false;
    return !(st.limit != null && st.hardStop && st.used >= st.limit);
  }

  /** Para fluxos sem sessão de usuário (webhook de WhatsApp etc.): o tenant está suspenso? */
  async function isTenantSuspended(tenantId: string): Promise<boolean> {
    return (await tenantState(tenantId)).blocked;
  }

  // ── Gate: suspensão + teto de IA. Roda ANTES do requireUser da rota; só valida, não autentica. ──
  function aiGate(opts: { enforceBudget: boolean }) {
    return async (req: any, res: Response, next: NextFunction) => {
      try {
        const token = bearer(req);
        if (!token || !supabase) return next(); // sem sessão: o requireUser da rota responde 401
        const { data: auth } = await supabase.auth.getUser(token);
        if (!auth?.user) return next();
        req.user = auth.user;
        req.supabase = createUserClient(token);
        const tenantId = await activeTenantOf(req);
        if (!tenantId) return next();
        const st = await tenantState(tenantId);
        if (st.blocked) {
          return res.status(402).json({ error: "Assinatura suspensa. Regularize o pagamento para continuar.", code: "tenant_suspended" });
        }
        if (opts.enforceBudget && st.limit != null) {
          const pct = Math.floor((st.used / st.limit) * 100);
          if (st.hardStop && st.used >= st.limit) {
            return res.status(429).json({ error: "Limite mensal de IA deste plano atingido.", code: "ai_budget_exceeded", used: st.used, limit: st.limit });
          }
          if (pct >= st.warnPct) res.setHeader("X-AI-Budget-Warning", String(pct));
        }
        return aiContext.run({ tenantId }, () => next());
      } catch (err: any) {
        console.error("[aiGate]", err?.message);
        return next(); // falha do gate nunca derruba a rota (fail-open só pro gate; a rota segue autenticando)
      }
    };
  }

  /** Registra tokens consumidos (fire-and-forget) no tenant do contexto atual. */
  function recordAiUsage(model: string, promptTokens?: number, completionTokens?: number, totalTokens?: number) {
    const ctx = aiContext.getStore();
    if (!ctx || !supabaseService) return;
    const total = totalTokens ?? ((promptTokens ?? 0) + (completionTokens ?? 0));
    if (!total) return;
    void supabaseService.from("ai_usage_log").insert({
      workflow_name: "spy-server", agent_group: "spy", source: "spy-server", model,
      prompt_tokens: promptTokens ?? null, completion_tokens: completionTokens ?? null, total_tokens: total,
      tenant_id: ctx.tenantId,
    }).then(({ error }) => { if (error) console.warn("[ai-usage]", error.message); });
    invalidate(ctx.tenantId);
  }

  /** Envolve ai.models.generateContent para contabilizar tokens sem tocar nos ~17 pontos de chamada. */
  function trackGeminiUsage(aiClient: any) {
    try {
      const models = aiClient?.models;
      if (!models?.generateContent || models.__tracked) return;
      const orig = models.generateContent.bind(models);
      models.generateContent = async (params: any) => {
        const res = await orig(params);
        const u = (res as any)?.usageMetadata;
        if (u) recordAiUsage(String(params?.model ?? "gemini"), u.promptTokenCount, u.candidatesTokenCount, u.totalTokenCount);
        return res;
      };
      models.__tracked = true;
    } catch (e: any) { console.warn("[ai-usage] não foi possível instrumentar o Gemini:", e?.message); }
  }

  // ── Rotas ───────────────────────────────────────────────────────────────────
  const router = Router();

  // Planos ativos (qualquer usuário logado vê a vitrine de planos)
  router.get("/plans", requireUser, async (req: any, res) => {
    const { data, error } = await req.supabase.from("subscription_plans").select("*").order("price_cents", { ascending: true });
    if (error) return res.status(500).json({ error: "Erro ao carregar planos." });
    res.json(data || []);
  });

  // Situação do tenant ativo: assinatura + plano + consumo de IA
  router.get("/status", requireUser, async (req: any, res) => {
    const tenantId = await activeTenantOf(req);
    if (!tenantId) return res.status(403).json({ error: "Tenant inválido." });
    const { data: sub } = await req.supabase.from("tenant_subscriptions").select("*, plan:subscription_plans(*)").eq("tenant_id", tenantId).maybeSingle();
    const st = await tenantState(tenantId);
    res.json({
      tenantId,
      subscription: sub ?? null,
      effectiveStatus: sub?.status ?? "none",
      blocked: st.blocked,
      ai: { used: st.used, limit: st.limit, warnPct: st.warnPct, hardStop: st.hardStop },
    });
  });

  // Planos (CRUD) — RLS limita a escrita a super admin; requireMaster dá erro claro antes.
  router.post("/plans", requireUser, requireMaster, async (req: any, res) => {
    const b = req.body || {};
    if (!b.code || !b.name) return res.status(400).json({ error: "Informe código e nome do plano." });
    const row = {
      code: String(b.code).trim().toLowerCase().slice(0, 40), name: String(b.name).trim().slice(0, 80),
      price_cents: Math.max(0, Math.round(Number(b.priceCents) || 0)),
      billing_interval: b.billingInterval === "yearly" ? "yearly" : "monthly",
      trial_days: Math.max(0, Math.round(Number(b.trialDays) || 0)),
      limits: typeof b.limits === "object" && b.limits ? b.limits : {},
      features: Array.isArray(b.features) ? b.features.map(String).slice(0, 30) : [],
      active: b.active !== false,
      tagline: String(b.tagline ?? "").trim().slice(0, 300),
      setup_price_cents: Math.min(100_000_000, Math.max(0, Math.round(Number(b.setupPriceCents) || 0))),
      badge: String(b.badge ?? "").trim().slice(0, 40) || null,
      features_header: String(b.featuresHeader ?? "").trim().slice(0, 80),
      cta_text: String(b.ctaText ?? "").trim().slice(0, 60),
      highlight: b.highlight === true,
      show_on_site: b.showOnSite === true,
      sort_order: Math.min(9999, Math.max(0, Math.round(Number(b.sortOrder) || 0))),
      modules: b.modules && typeof b.modules === "object" && !Array.isArray(b.modules)
        ? Object.fromEntries(Object.entries(b.modules).filter(([k]) => /^[a-z_]{2,40}$/.test(k)).map(([k, v]) => [k, v === true]))
        : {},
      ai_monthly_tokens: b.aiMonthlyTokens === null || b.aiMonthlyTokens === "" || b.aiMonthlyTokens === undefined
        ? null : (Number(b.aiMonthlyTokens) > 0 ? Math.round(Number(b.aiMonthlyTokens)) : null),
      updated_at: new Date().toISOString(),
    } as Record<string, any>;
    // Plano ligado a um produto: preço, ativo e recorrência vêm do catálogo (fonte única).
    if (typeof b.productId === "string" && b.productId) {
      const { data: prod } = await req.supabase.from("products").select("id, price, active, deleted_at, recurring_period").eq("id", b.productId).maybeSingle();
      if (!prod) return res.status(400).json({ error: "Produto não encontrado." });
      row.product_id = prod.id;
      row.price_cents = Math.max(0, Math.round(Number(prod.price) * 100));
      row.active = prod.active !== false && !prod.deleted_at;
      row.billing_interval = ["yearly", "annual", "anual"].includes(String(prod.recurring_period || "").toLowerCase()) ? "yearly" : "monthly";
    } else if (b.productId === null) {
      row.product_id = null;
    }
    row.price_cents = Math.min(100_000_000, row.price_cents);
    row.features = row.features.map((f: string) => f.trim().slice(0, 120)).filter(Boolean);
    const { data, error } = b.id
      ? await req.supabase.from("subscription_plans").update(row).eq("id", b.id).select().single()
      : await req.supabase.from("subscription_plans").insert(row).select().single();
    if (error) return res.status(400).json({ error: error.code === "23505" ? "Já existe um plano com esse código." : "Erro ao salvar o plano." });
    res.json(data);
  });

  // Vitrine pública de preços (landings /lp e /landing). Sem auth; só campos de vitrine.
  const publicPlansLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
  router.get("/public-plans", publicPlansLimiter, async (_req, res) => {
    if (!supabaseService) return res.status(503).json({ error: "Indisponível." });
    const [plans, tiers] = await Promise.all([
      supabaseService.from("subscription_plans")
        .select("code,name,price_cents,billing_interval,setup_price_cents,tagline,badge,features_header,features,cta_text,highlight,sort_order")
        .eq("active", true).eq("show_on_site", true)
        .order("sort_order", { ascending: true }).order("price_cents", { ascending: true }),
      supabaseService.from("credit_tiers").select("credits,price_cents,sort_order").eq("active", true).eq("show_on_site", true).order("sort_order", { ascending: true }),
    ]);
    if (plans.error || tiers.error) return res.status(500).json({ error: "Erro ao carregar planos." });
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json({
      plans: (plans.data || []).map((p: any) => ({
        code: p.code, name: p.name, priceCents: p.price_cents, billingInterval: p.billing_interval,
        setupPriceCents: p.setup_price_cents ?? 0, tagline: p.tagline ?? "", badge: p.badge ?? null,
        featuresHeader: p.features_header ?? "", features: Array.isArray(p.features) ? p.features : [],
        ctaText: p.cta_text ?? "", highlight: !!p.highlight, sortOrder: p.sort_order ?? 0,
      })),
      creditTiers: (tiers.data || []).map((t: any) => ({ credits: t.credits, priceCents: t.price_cents, sortOrder: t.sort_order ?? 0 })),
    });
  });

  // Faixas de créditos de IA da vitrine (CRUD master; RLS limita a escrita a super admin).
  router.get("/credit-tiers", requireUser, requireMaster, async (req: any, res) => {
    const { data, error } = await req.supabase.from("credit_tiers").select("*").order("sort_order", { ascending: true });
    if (error) return res.status(500).json({ error: "Erro ao carregar faixas de créditos." });
    res.json(data || []);
  });
  router.post("/credit-tiers", requireUser, requireMaster, async (req: any, res) => {
    const b = req.body || {};
    const credits = Math.round(Number(b.credits));
    const price = Math.round(Number(b.priceCents));
    if (!(credits > 0) || !(price >= 0) || credits > 1_000_000_000 || price > 100_000_000) return res.status(400).json({ error: "Informe créditos e preço válidos." });
    const row: Record<string, any> = { credits, price_cents: price, sort_order: Math.min(9999, Math.max(0, Math.round(Number(b.sortOrder) || 0))), active: b.active !== false, show_on_site: b.showOnSite !== false };
    if (typeof b.productId === "string" && b.productId) {
      const { data: prod } = await req.supabase.from("products").select("id, price, active, deleted_at").eq("id", b.productId).maybeSingle();
      if (!prod) return res.status(400).json({ error: "Produto não encontrado." });
      row.product_id = prod.id; row.price_cents = Math.max(0, Math.round(Number(prod.price) * 100)); row.active = prod.active !== false && !prod.deleted_at;
    } else if (b.productId === null) row.product_id = null;
    const { data, error } = b.id
      ? await req.supabase.from("credit_tiers").update(row).eq("id", b.id).select().single()
      : await req.supabase.from("credit_tiers").insert(row).select().single();
    if (error) return res.status(400).json({ error: "Erro ao salvar a faixa de créditos." });
    res.json(data);
  });
  router.delete("/credit-tiers/:id", requireUser, requireMaster, async (req: any, res) => {
    const { error } = await req.supabase.from("credit_tiers").delete().eq("id", req.params.id);
    if (error) return res.status(400).json({ error: "Erro ao remover a faixa de créditos." });
    res.json({ ok: true });
  });

  // ── Plano ↔ catálogo ──────────────────────────────────────────────────────────
  // Tenant dono do catálogo da plataforma (onde ficam os produtos "Licença", "Implementação"...).
  const OWNER_TENANT_ID = process.env.SPY_OWNER_TENANT_ID || "27ef95ee-84dd-499e-9f25-cd9baecb5fe4";

  /** Cria no catálogo o produto de um plano / pacote de créditos que ainda não tem um, e liga os dois. */
  router.post("/plans/:id/create-product", requireUser, requireMaster, async (req: any, res) => {
    if (!supabaseService) return res.status(503).json({ error: "Service role não configurada." });
    const { data: plan } = await req.supabase.from("subscription_plans").select("*").eq("id", req.params.id).maybeSingle();
    if (!plan) return res.status(404).json({ error: "Plano não encontrado." });
    if (plan.product_id) return res.status(409).json({ error: "Este plano já está ligado a um produto." });
    const { data: prod, error } = await supabaseService.from("products").insert({
      tenant_id: OWNER_TENANT_ID, name: `Licença S.P.Y | ${plan.name}`, type: "Digital", category: "Software",
      price: plan.price_cents / 100, active: plan.active, is_recurring: true,
      recurring_period: plan.billing_interval === "yearly" ? "yearly" : "monthly",
      description: plan.tagline || null,
      type_attributes: { isRecurring: true, billingCycle: plan.billing_interval === "yearly" ? "Anual" : "Mensal", tipoEntrega: "Acesso por Login" },
    }).select("id").single();
    if (error || !prod) return res.status(500).json({ error: "Erro ao criar o produto do plano." });
    const { error: linkErr } = await req.supabase.from("subscription_plans").update({ product_id: prod.id }).eq("id", plan.id);
    if (linkErr) return res.status(500).json({ error: "Produto criado, mas não foi possível ligá-lo ao plano." });
    res.json({ productId: prod.id });
  });

  router.post("/credit-tiers/:id/create-product", requireUser, requireMaster, async (req: any, res) => {
    if (!supabaseService) return res.status(503).json({ error: "Service role não configurada." });
    const { data: tier } = await req.supabase.from("credit_tiers").select("*").eq("id", req.params.id).maybeSingle();
    if (!tier) return res.status(404).json({ error: "Pacote não encontrado." });
    if (tier.product_id) return res.status(409).json({ error: "Este pacote já está ligado a um produto." });
    const { data: prod, error } = await supabaseService.from("products").insert({
      tenant_id: OWNER_TENANT_ID, name: `Pacote de créditos de IA | ${Number(tier.credits).toLocaleString("pt-BR")}`, type: "Digital", category: "Créditos de IA",
      price: tier.price_cents / 100, active: tier.active, is_recurring: false,
      description: `${Number(tier.credits).toLocaleString("pt-BR")} créditos de inteligência artificial.`,
      type_attributes: { isRecurring: false, creditosIA: tier.credits },
    }).select("id").single();
    if (error || !prod) return res.status(500).json({ error: "Erro ao criar o produto do pacote." });
    const { error: linkErr } = await req.supabase.from("credit_tiers").update({ product_id: prod.id }).eq("id", tier.id);
    if (linkErr) return res.status(500).json({ error: "Produto criado, mas não foi possível ligá-lo ao pacote." });
    res.json({ productId: prod.id });
  });

  /**
   * Aplica um plano a um tenant: assinatura (teste ou ativa), módulos do plano e teto de IA.
   * Única regra usada tanto pela venda fechada (criação do ambiente) quanto pelo Admin.
   */
  async function provisionPlan(tenantId: string, planId: string, by?: string) {
    if (!supabaseService) throw new Error("Service role não configurada.");
    const { data: plan } = await supabaseService.from("subscription_plans").select("*").eq("id", planId).maybeSingle();
    if (!plan) throw new Error("Plano inexistente.");
    const { data: current } = await supabaseService.from("tenant_subscriptions").select("status").eq("tenant_id", tenantId).maybeSingle();
    const trial = Number(plan.trial_days) > 0;
    const row: any = {
      tenant_id: tenantId, plan_id: plan.id, status: trial ? "trial" : "active", gateway: "manual", updated_at: new Date().toISOString(),
      trial_ends_at: trial ? new Date(Date.now() + plan.trial_days * 86400_000).toISOString() : null,
      suspended_at: null,
    };
    const { error: subErr } = await supabaseService.from("tenant_subscriptions").upsert(row, { onConflict: "tenant_id" });
    if (subErr) throw new Error("Erro ao salvar a assinatura.");
    const mods = plan.modules && typeof plan.modules === "object" ? plan.modules : {};
    if (Object.keys(mods).length > 0) {
      const { data: t } = await supabaseService.from("tenants").select("modules").eq("id", tenantId).maybeSingle();
      await supabaseService.from("tenants").update({ modules: { ...(t?.modules || {}), ...mods }, plan: plan.code }).eq("id", tenantId);
    } else {
      await supabaseService.from("tenants").update({ plan: plan.code }).eq("id", tenantId);
    }
    if (plan.ai_monthly_tokens) {
      await supabaseService.from("tenant_ai_budget").upsert(
        { tenant_id: tenantId, monthly_token_limit: plan.ai_monthly_tokens, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
    }
    await logEvent(tenantId, "plan_applied", { from_status: current?.status ?? null, to_status: row.status, amount_cents: plan.price_cents, payload: { by: by ?? null, plan: plan.code } });
    invalidate(tenantId);
    return { planCode: plan.code, status: row.status as string };
  }

  /** Plano que o cliente comprou: procura, nas propostas do lead da implementação, um item cujo produto é um plano. */
  async function planIdFromLead(leadId?: string | null): Promise<string | null> {
    if (!supabaseService || !leadId) return null;
    const { data: props } = await supabaseService.from("proposals").select("id, created_at").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(20);
    const ids = (props || []).map((p: any) => p.id);
    if (ids.length === 0) return null;
    const { data: items } = await supabaseService.from("proposal_items").select("product_id").in("proposal_id", ids).not("product_id", "is", null);
    const productIds = [...new Set((items || []).map((i: any) => i.product_id))];
    if (productIds.length === 0) return null;
    const { data: plans } = await supabaseService.from("subscription_plans").select("id").in("product_id", productIds).limit(1);
    return plans?.[0]?.id ?? null;
  }

  router.post("/subscriptions/:tenantId/apply-plan", requireUser, requireMaster, async (req: any, res) => {
    try {
      const planId = String(req.body?.planId || "");
      if (!planId) return res.status(400).json({ error: "Informe o plano." });
      res.json(await provisionPlan(req.params.tenantId, planId, req.user.id));
    } catch (e: any) { res.status(400).json({ error: e?.message || "Erro ao aplicar o plano." }); }
  });

  async function logEvent(tenantId: string, type: string, extra: Record<string, any> = {}) {
    if (!supabaseService) return;
    await supabaseService.from("billing_events").insert({ tenant_id: tenantId, type, ...extra });
  }

  const addPeriod = (from: Date, interval: string) => {
    const d = new Date(from);
    if (interval === "yearly") d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1);
    return d;
  };

  // Define/atualiza a assinatura de um tenant (plano, trial, carência, status)
  router.put("/subscriptions/:tenantId", requireUser, requireMaster, async (req: any, res) => {
    const tenantId = req.params.tenantId;
    const b = req.body || {};
    let plan: any = null;
    if (b.planId) {
      const { data } = await req.supabase.from("subscription_plans").select("*").eq("id", b.planId).maybeSingle();
      plan = data;
      if (!plan) return res.status(400).json({ error: "Plano inexistente." });
    }
    const { data: current } = await req.supabase.from("tenant_subscriptions").select("*").eq("tenant_id", tenantId).maybeSingle();
    const status = ["trial", "active", "past_due", "suspended", "canceled"].includes(b.status) ? b.status : (current?.status ?? "trial");
    const row: any = {
      tenant_id: tenantId,
      plan_id: plan?.id ?? current?.plan_id ?? null,
      status,
      grace_days: Number.isFinite(Number(b.graceDays)) ? Math.max(0, Math.round(Number(b.graceDays))) : (current?.grace_days ?? 7),
      gateway: b.gateway ?? current?.gateway ?? "manual",
      notes: typeof b.notes === "string" ? b.notes.slice(0, 500) : current?.notes ?? null,
      updated_at: new Date().toISOString(),
    };
    if (status === "trial") {
      const days = Number.isFinite(Number(b.trialDays)) ? Number(b.trialDays) : (plan?.trial_days ?? 14);
      row.trial_ends_at = b.trialEndsAt ?? current?.trial_ends_at ?? new Date(Date.now() + days * 86400_000).toISOString();
    }
    if (b.currentPeriodEnd) row.current_period_end = new Date(b.currentPeriodEnd).toISOString();
    if (status === "suspended" && current?.status !== "suspended") row.suspended_at = new Date().toISOString();
    if (status !== "suspended") row.suspended_at = null;

    const { data, error } = await req.supabase.from("tenant_subscriptions").upsert(row, { onConflict: "tenant_id" }).select().single();
    if (error) return res.status(400).json({ error: "Erro ao salvar a assinatura." });
    await logEvent(tenantId, "manual", { from_status: current?.status ?? null, to_status: status, payload: { by: req.user.id } });
    invalidate(tenantId);
    res.json(data);
  });

  // Marca pagamento recebido: ativa e empurra o fim do período
  router.post("/subscriptions/:tenantId/mark-paid", requireUser, requireMaster, async (req: any, res) => {
    const tenantId = req.params.tenantId;
    const { data: sub } = await req.supabase.from("tenant_subscriptions").select("*, plan:subscription_plans(*)").eq("tenant_id", tenantId).maybeSingle();
    if (!sub) return res.status(404).json({ error: "Tenant sem assinatura. Defina o plano primeiro." });
    const base = sub.current_period_end && new Date(sub.current_period_end) > new Date() ? new Date(sub.current_period_end) : new Date();
    const end = addPeriod(base, sub.plan?.billing_interval ?? "monthly").toISOString();
    const { data, error } = await req.supabase.from("tenant_subscriptions")
      .update({ status: "active", last_payment_at: new Date().toISOString(), current_period_end: end, suspended_at: null, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId).select().single();
    if (error) return res.status(400).json({ error: "Erro ao registrar pagamento." });
    await logEvent(tenantId, "payment_confirmed", { from_status: sub.status, to_status: "active", amount_cents: sub.plan?.price_cents ?? null, payload: { by: req.user.id, source: "manual" } });
    invalidate(tenantId);
    res.json(data);
  });

  // Roda a régua agora (o agendamento diário é opcional — ver migrations/*cron.sql.example)
  router.post("/tick", requireUser, requireMaster, async (_req: any, res) => {
    if (!supabaseService) return res.status(503).json({ error: "Service role não configurada." });
    const { data, error } = await supabaseService.rpc("billing_tick");
    if (error) return res.status(500).json({ error: "Erro ao executar a régua de cobrança." });
    stateCache.clear();
    res.json({ changed: data });
  });

  // Teto de IA do tenant
  router.put("/ai-budget/:tenantId", requireUser, requireMaster, async (req: any, res) => {
    const b = req.body || {};
    const limit = b.monthlyTokenLimit === null || b.monthlyTokenLimit === "" || b.monthlyTokenLimit === undefined ? null : Math.round(Number(b.monthlyTokenLimit));
    if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) return res.status(400).json({ error: "Limite inválido." });
    const row = {
      tenant_id: req.params.tenantId, monthly_token_limit: limit,
      warn_pct: Math.min(100, Math.max(1, Math.round(Number(b.warnPct) || 80))),
      hard_stop: b.hardStop !== false, updated_at: new Date().toISOString(),
    };
    const { data, error } = await req.supabase.from("tenant_ai_budget").upsert(row, { onConflict: "tenant_id" }).select().single();
    if (error) return res.status(400).json({ error: "Erro ao salvar o orçamento de IA." });
    invalidate(req.params.tenantId);
    res.json(data);
  });

  // ── Asaas (opcional: só funciona com ASAAS_API_KEY no servidor) ──
  const asaasBase = () => (process.env.ASAAS_ENV === "sandbox" ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/v3");
  const asaasHeaders = () => ({ access_token: process.env.ASAAS_API_KEY || "", "Content-Type": "application/json", "User-Agent": "spy-crm" });

  router.post("/subscriptions/:tenantId/asaas", requireUser, requireMaster, async (req: any, res) => {
    if (!process.env.ASAAS_API_KEY) return res.status(503).json({ error: "ASAAS_API_KEY não configurada no servidor. Use o modo manual ou configure o gateway." });
    const tenantId = req.params.tenantId;
    const b = req.body || {};
    try {
      const { data: sub } = await req.supabase.from("tenant_subscriptions").select("*, plan:subscription_plans(*)").eq("tenant_id", tenantId).maybeSingle();
      if (!sub?.plan) return res.status(400).json({ error: "Defina o plano da assinatura antes de gerar a cobrança." });
      if (!b.name || !b.cpfCnpj) return res.status(400).json({ error: "Informe nome e CPF/CNPJ do cliente." });
      let customerId = sub.gateway_customer_id as string | null;
      if (!customerId) {
        const c = await axios.post(`${asaasBase()}/customers`, { name: String(b.name).slice(0, 100), email: b.email || undefined, cpfCnpj: String(b.cpfCnpj).replace(/\D/g, ""), externalReference: tenantId }, { headers: asaasHeaders(), timeout: 20000 });
        customerId = c.data.id;
      }
      const due = new Date(Date.now() + Math.max(1, Number(b.firstDueInDays) || 3) * 86400_000).toISOString().slice(0, 10);
      const s = await axios.post(`${asaasBase()}/subscriptions`, {
        customer: customerId, billingType: ["BOLETO", "PIX", "CREDIT_CARD"].includes(b.billingType) ? b.billingType : "UNDEFINED",
        value: sub.plan.price_cents / 100, nextDueDate: due, cycle: sub.plan.billing_interval === "yearly" ? "YEARLY" : "MONTHLY",
        description: `Assinatura ${sub.plan.name}`, externalReference: tenantId,
      }, { headers: asaasHeaders(), timeout: 20000 });
      await req.supabase.from("tenant_subscriptions").update({ gateway: "asaas", gateway_customer_id: customerId, gateway_subscription_id: s.data.id, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId);
      await logEvent(tenantId, "gateway_webhook", { gateway_ref: s.data.id, payload: { action: "subscription_created", by: req.user.id } });
      res.json({ gateway: "asaas", customerId, subscriptionId: s.data.id });
    } catch (err: any) {
      console.error("[asaas]", err?.response?.data || err?.message);
      res.status(502).json({ error: "O Asaas recusou a operação. Confira os dados do cliente e a chave." });
    }
  });

  // Webhook do Asaas (público, autenticado por token compartilhado)
  router.post("/webhook/asaas", async (req: any, res) => {
    const expected = process.env.ASAAS_WEBHOOK_TOKEN || "";
    const got = String(req.headers["asaas-access-token"] || "");
    if (!expected || !got || !safeEq(got, expected)) return res.status(401).json({ error: "Token inválido." });
    if (!supabaseService) return res.status(503).json({ error: "Indisponível." });
    try {
      const evt = String(req.body?.event || "");
      const pay = req.body?.payment || {};
      const subId = pay.subscription || req.body?.subscription?.id;
      if (!subId) return res.json({ ok: true, ignored: "sem assinatura" });
      const { data: sub } = await supabaseService.from("tenant_subscriptions").select("*, plan:subscription_plans(*)").eq("gateway_subscription_id", subId).maybeSingle();
      if (!sub) return res.json({ ok: true, ignored: "assinatura desconhecida" });
      const ref = `${evt}:${pay.id || subId}`;
      const { data: dup } = await supabaseService.from("billing_events").select("id").eq("tenant_id", sub.tenant_id).eq("gateway_ref", ref).maybeSingle();
      if (dup) return res.json({ ok: true, duplicate: true });

      let to: string | null = null;
      const patch: any = { updated_at: new Date().toISOString() };
      if (evt === "PAYMENT_CONFIRMED" || evt === "PAYMENT_RECEIVED") {
        to = "active";
        const base = sub.current_period_end && new Date(sub.current_period_end) > new Date() ? new Date(sub.current_period_end) : new Date();
        Object.assign(patch, { status: "active", last_payment_at: new Date().toISOString(), current_period_end: addPeriod(base, sub.plan?.billing_interval ?? "monthly").toISOString(), suspended_at: null });
      } else if (evt === "PAYMENT_OVERDUE") {
        to = sub.status === "suspended" ? "suspended" : "past_due";
        patch.status = to;
      } else if (evt === "SUBSCRIPTION_DELETED" || evt === "SUBSCRIPTION_INACTIVATED") {
        to = "canceled"; patch.status = to;
      }
      if (to) await supabaseService.from("tenant_subscriptions").update(patch).eq("id", sub.id);
      await supabaseService.from("billing_events").insert({
        tenant_id: sub.tenant_id, type: evt.startsWith("PAYMENT_") ? (to === "active" ? "payment_confirmed" : "payment_overdue") : "gateway_webhook",
        from_status: sub.status, to_status: to, amount_cents: pay.value != null ? Math.round(Number(pay.value) * 100) : null, gateway_ref: ref,
        payload: { event: evt, paymentId: pay.id ?? null },
      });
      invalidate(sub.tenant_id);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[asaas-webhook]", err?.message);
      res.status(500).json({ error: "Erro ao processar o webhook." });
    }
  });

  // ── LGPD ────────────────────────────────────────────────────────────────────
  const lgpd = Router();

  async function lgpdGuard(req: any, res: Response, next: NextFunction) {
    const { data: ok } = await req.supabase.rpc("is_tenant_admin_or_master");
    if (!ok) return res.status(403).json({ error: "Apenas administradores podem usar as ferramentas de LGPD." });
    const tenantId = await activeTenantOf(req);
    if (!tenantId) return res.status(403).json({ error: "Tenant inválido." });
    req.lgpdTenant = tenantId;
    next();
  }

  const SUBJECTS: Record<string, { table: string; label: string }> = { lead: { table: "leads", label: "Lead" }, cliente: { table: "clientes", label: "Cliente" } };

  lgpd.get("/search", requireUser, lgpdGuard, async (req: any, res) => {
    const q = pgrstSafe(String(req.query.q || ""));
    if (q.length < 3) return res.json([]);
    const tenantId = req.lgpdTenant;
    const [leads, clientes] = await Promise.all([
      req.supabase.from("leads").select("id, name, email, phone, company").eq("tenant_id", tenantId).is("deleted_at", null)
        .or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`).limit(15),
      req.supabase.from("clientes").select("id, name, email, phone, documento").eq("tenant_id", tenantId)
        .or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`).limit(15),
    ]);
    res.json([
      ...(leads.data || []).map((r: any) => ({ type: "lead", id: r.id, name: r.name, email: r.email, phone: r.phone, extra: r.company })),
      ...(clientes.data || []).map((r: any) => ({ type: "cliente", id: r.id, name: r.name, email: r.email, phone: r.phone, extra: r.documento })),
    ]);
  });

  async function audit(req: any, kind: string, type: string, id: string, status: "done" | "failed", details: any = {}) {
    if (!supabaseService) return;
    await supabaseService.from("lgpd_requests").insert({ tenant_id: req.lgpdTenant, kind, subject_type: type, subject_id: String(id), requested_by: req.user.id, status, details });
  }

  lgpd.get("/export/:type/:id", requireUser, lgpdGuard, async (req: any, res) => {
    const subj = SUBJECTS[req.params.type];
    if (!subj) return res.status(400).json({ error: "Tipo inválido." });
    const tenantId = req.lgpdTenant;
    const { data: row } = await req.supabase.from(subj.table).select("*").eq("id", req.params.id).eq("tenant_id", tenantId).maybeSingle();
    if (!row) return res.status(404).json({ error: "Registro não encontrado neste tenant." });
    const activities = req.params.type === "lead"
      ? (await req.supabase.from("lead_activities").select("*").eq("lead_id", req.params.id).eq("tenant_id", tenantId)).data || []
      : [];
    await audit(req, "export", req.params.type, req.params.id, "done", { activities: activities.length });
    res.setHeader("Content-Disposition", `attachment; filename="lgpd-${req.params.type}-${String(req.params.id).slice(0, 8)}.json"`);
    res.json({ exportedAt: new Date().toISOString(), subjectType: req.params.type, record: row, activities });
  });

  lgpd.post("/anonymize/:type/:id", requireUser, lgpdGuard, async (req: any, res) => {
    const subj = SUBJECTS[req.params.type];
    if (!subj) return res.status(400).json({ error: "Tipo inválido." });
    if (req.body?.confirm !== true) return res.status(400).json({ error: "Confirmação obrigatória: esta ação é irreversível." });
    const tenantId = req.lgpdTenant;
    const patch: Record<string, any> = req.params.type === "lead"
      ? { name: "Titular anonimizado", email: null, phone: null, mobile_wa: null, cnpj: null, document_id: null, company: null, title: null, notes: null, iaSummary: null, lead_interesse_cliente: null, clientName: null, customFields: {} }
      : { name: "Titular anonimizado", email: null, phone: null, documento: null, cep: null, logradouro: null, numero: null, bairro: null, complemento: null };
    const { data, error } = await req.supabase.from(subj.table).update(patch).eq("id", req.params.id).eq("tenant_id", tenantId).select("id");
    if (error || !data?.length) {
      await audit(req, "anonymize", req.params.type, req.params.id, "failed", { reason: error?.message ?? "não encontrado" });
      return res.status(error ? 400 : 404).json({ error: "Não foi possível anonimizar este registro." });
    }
    let activities = 0;
    if (req.params.type === "lead") {
      const a = await req.supabase.from("lead_activities").update({ title: "Registro anonimizado", description: null, seller: null }).eq("lead_id", req.params.id).eq("tenant_id", tenantId).select("id");
      activities = a.data?.length ?? 0;
    }
    await audit(req, "anonymize", req.params.type, req.params.id, "done", { activities });
    res.json({ ok: true, anonymized: subj.label, activities });
  });

  lgpd.post("/consent", requireUser, lgpdGuard, async (req: any, res) => {
    const b = req.body || {};
    if (!SUBJECTS[b.subjectType] || !b.subjectId) return res.status(400).json({ error: "Titular inválido." });
    await audit(req, "consent", b.subjectType, b.subjectId, "done", { granted: b.granted !== false, channel: String(b.channel || "outro").slice(0, 40), note: String(b.note || "").slice(0, 300) });
    res.json({ ok: true });
  });

  lgpd.get("/requests", requireUser, lgpdGuard, async (req: any, res) => {
    const { data, error } = await req.supabase.from("lgpd_requests").select("*").eq("tenant_id", req.lgpdTenant).order("created_at", { ascending: false }).limit(100);
    if (error) return res.status(500).json({ error: "Erro ao carregar o histórico." });
    res.json(data || []);
  });

  return { billingRouter: router, lgpdRouter: lgpd, provisionPlan, planIdFromLead, aiGate, trackGeminiUsage, recordAiUsage, isTenantSuspended, isAiAllowed };
}
