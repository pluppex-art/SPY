// Checkout publico com Pix avulso (sem gateway). Fluxo:
//  1. cliente preenche o cadastro (nome, telefone, e-mail, CPF/CNPJ, empresa) e escolhe o plano;
//  2. o servidor calcula o preco (plano + promocao) e gera o Pix "copia e cola" (BR Code) com o valor exato;
//  3. o cliente paga e avisa; o admin confirma (Planos > Checkout) e o sistema cria a empresa, libera o acesso,
//     atualiza o lead e avisa o cliente por e-mail.
// Seguranca: preco NUNCA vem do cliente; rotas publicas com limite de requisicoes e sem dados sensiveis na resposta;
// rotas de administracao exigem super admin; o pedido e acessado por um token aleatorio (nao adivinhavel).

import { Router } from "express";
import type { NextFunction, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "crypto";
import rateLimit from "express-rate-limit";
import { sendPlatformEmail } from "./mailer.js";

type Deps = {
  requireUser: (req: any, res: Response, next: NextFunction) => any;
  requireMaster: (req: any, res: Response, next: NextFunction) => any;
  supabaseService: SupabaseClient | null;
  provisionPlan: (tenantId: string, planId: string, by?: string) => Promise<{ planCode: string; status: string }>;
  publicAppUrl: string;
};

// ── Pix (BR Code estatico com valor) ────────────────────────────────────────
const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .\-]/g, "").trim();

export function pixBrCode(o: { key: string; name: string; city: string; amountCents: number; txid: string }): string {
  const conta = tlv("00", "br.gov.bcb.pix") + tlv("01", o.key.trim());
  const body =
    tlv("00", "01") + tlv("01", "12") + tlv("26", conta) + tlv("52", "0000") + tlv("53", "986") +
    tlv("54", (o.amountCents / 100).toFixed(2)) + tlv("58", "BR") +
    tlv("59", (semAcento(o.name) || "RECEBEDOR").toUpperCase().slice(0, 25)) +
    tlv("60", (semAcento(o.city) || "SAO PAULO").toUpperCase().slice(0, 15)) +
    tlv("62", tlv("05", o.txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***"));
  const semCrc = body + "6304";
  return semCrc + crc16(semCrc);
}

// ── CPF / CNPJ ──────────────────────────────────────────────────────────────
export function documentoValido(raw: string): boolean {
  const d = String(raw || "").replace(/\D/g, "");
  if (/^(\d)\1+$/.test(d)) return false;
  const dig = (base: string, pesos: number[]) => {
    const s = base.split("").reduce((a, c, i) => a + Number(c) * pesos[i], 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  if (d.length === 11) {
    const p1 = dig(d.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const p2 = dig(d.slice(0, 9) + p1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return d.endsWith(`${p1}${p2}`);
  }
  if (d.length === 14) {
    const p1 = dig(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const p2 = dig(d.slice(0, 12) + p1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return d.endsWith(`${p1}${p2}`);
  }
  return false;
}

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createCheckoutRouter({ requireUser, requireMaster, supabaseService: db, provisionPlan, publicAppUrl }: Deps) {
  const router = Router();
  const pub = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false });
  const pubWrite = rateLimit({ windowMs: 60_000, limit: 8, standardHeaders: true, legacyHeaders: false });

  type Quote = { plan: any; promo: any | null; priceCents: number; setupCents: number; discountCents: number; totalCents: number };

  async function quoteFor(planCode: string, promoCode?: string): Promise<Quote> {
    if (!db) throw new Error("Indisponível.");
    const { data: plan } = await db.from("subscription_plans").select("*").eq("code", String(planCode || "").toLowerCase()).eq("active", true).maybeSingle();
    if (!plan) throw new Error("Plano não encontrado.");
    const now = Date.now();
    const { data: promos } = await db.from("checkout_promos").select("*").eq("active", true);
    const vale = (p: any) =>
      (!p.valid_until || new Date(p.valid_until).getTime() > now) &&
      (p.max_uses == null || p.uses < p.max_uses) &&
      (!p.plan_code || p.plan_code === plan.code);
    const base = Math.max(0, Number(plan.price_cents) || 0);
    const setup = Math.max(0, Number(plan.setup_price_cents) || 0);
    const desconto = (p: any) => Math.min(base + setup,
      Math.round(base * (p.percent_off / 100)) + Number(p.amount_off_cents || 0) + (p.setup_waived ? setup : 0));

    let promo: any = null;
    const code = String(promoCode || "").trim().toLowerCase();
    if (code) {
      promo = (promos || []).find((p: any) => p.code && p.code.toLowerCase() === code && vale(p)) || null;
      if (!promo) throw new Error("Cupom inválido ou expirado.");
    } else {
      promo = (promos || []).filter((p: any) => !p.code && vale(p)).sort((a: any, b: any) => desconto(b) - desconto(a))[0] || null;
    }
    const discountCents = promo ? desconto(promo) : 0;
    return { plan, promo, priceCents: base, setupCents: setup, discountCents, totalCents: base + setup - discountCents };
  }

  const quoteJson = (q: Quote) => ({
    plan: { code: q.plan.code, name: q.plan.name, tagline: q.plan.tagline ?? "", interval: q.plan.billing_interval, features: Array.isArray(q.plan.features) ? q.plan.features : [] },
    priceCents: q.priceCents, setupCents: q.setupCents, discountCents: q.discountCents, totalCents: q.totalCents,
    promo: q.promo ? { label: q.promo.label || q.promo.code || "Promoção", code: q.promo.code ?? null, auto: !q.promo.code } : null,
  });

  async function config() {
    const { data } = await db!.from("checkout_config").select("*").eq("id", "main").maybeSingle();
    return data as { active: boolean; pix_key: string; receiver_name: string; receiver_city: string; notify_email: string } | null;
  }

  // ── Publico ────────────────────────────────────────────────────────────────
  router.get("/plans", pub, async (_req, res) => {
    if (!db) return res.status(503).json({ error: "Indisponível." });
    const cfg = await config();
    const { data } = await db.from("subscription_plans")
      .select("code,name,price_cents,billing_interval,setup_price_cents,tagline,badge,features,highlight,sort_order")
      .eq("active", true).eq("show_on_site", true).order("sort_order").order("price_cents");
    const plans = [];
    for (const p of data || []) {
      try { plans.push({ ...quoteJson(await quoteFor((p as any).code)), badge: (p as any).badge ?? null, highlight: !!(p as any).highlight }); } catch { /* plano sem cotação */ }
    }
    res.json({ enabled: !!(cfg?.active && cfg.pix_key), plans });
  });

  router.post("/quote", pub, async (req, res) => {
    try { res.json(quoteJson(await quoteFor(req.body?.planCode, req.body?.promoCode))); }
    catch (e: any) { res.status(400).json({ error: e?.message || "Não foi possível calcular." }); }
  });

  router.post("/order", pubWrite, async (req, res) => {
    if (!db) return res.status(503).json({ error: "Indisponível." });
    const b = req.body || {};
    const nome = String(b.nome || "").trim().slice(0, 120);
    const empresa = String(b.empresa || "").trim().slice(0, 160);
    const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
    const telefone = String(b.telefone || "").trim().slice(0, 30);
    const documento = String(b.documento || "").replace(/\D/g, "");
    if (nome.length < 3) return res.status(400).json({ error: "Informe seu nome completo." });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Informe um e-mail válido." });
    if (telefone.replace(/\D/g, "").length < 10) return res.status(400).json({ error: "Informe o telefone com DDD." });
    if (!documentoValido(documento)) return res.status(400).json({ error: "CPF ou CNPJ inválido." });
    if (empresa.length < 2) return res.status(400).json({ error: "Informe o nome da empresa." });

    const cfg = await config();
    if (!cfg?.active || !cfg.pix_key) return res.status(503).json({ error: "O pagamento ainda não está disponível. Fale com a gente pelo WhatsApp." });

    let q: Quote;
    try { q = await quoteFor(b.planCode, b.promoCode); } catch (e: any) { return res.status(400).json({ error: e?.message || "Plano inválido." }); }
    if (q.totalCents < 100) return res.status(400).json({ error: "Valor inválido para pagamento via Pix." });

    // O mesmo comprador clicando duas vezes reaproveita o pedido aberto (mesmo plano, valor e documento).
    const { data: aberto } = await db.from("checkout_orders").select("*")
      .eq("documento", documento).eq("email", email).eq("plan_code", q.plan.code).eq("total_cents", q.totalCents)
      .in("status", ["pending", "awaiting_confirmation"]).gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (aberto) return res.json({ token: aberto.token, totalCents: aberto.total_cents, pixPayload: aberto.pix_payload, status: aberto.status, expiresAt: aberto.expires_at });

    const token = randomBytes(18).toString("hex");
    const txid = `SPY${token.slice(0, 20).toUpperCase()}`;
    const pixPayload = pixBrCode({ key: cfg.pix_key, name: cfg.receiver_name, city: cfg.receiver_city, amountCents: q.totalCents, txid });
    const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();

    // Lead no CRM de quem vende, ja na hora do cadastro (quem desistiu do Pix tambem vira lead para follow-up).
    let leadId: string | null = null;
    const sellerTenant = process.env.SPY_FORM_TENANT_ID || process.env.AXIS_FORM_TENANT_ID;
    if (sellerTenant) {
      leadId = randomUUID();
      const { error: leadErr } = await db.from("leads").insert({
        id: leadId, tenant_id: sellerTenant, name: nome, email, phone: telefone, company: empresa, cnpj: documento,
        source: "Checkout S.P.Y.", status: "Novo", priority: "Alta", value: q.totalCents / 100, scoreIA: 80,
        notes: `Checkout: plano ${q.plan.name}, total ${brl(q.totalCents)}${q.promo ? `, promoção ${q.promo.label || q.promo.code}` : ""}. Aguardando Pix.`,
        date: new Date().toISOString().split("T")[0],
      });
      if (leadErr) { console.error("[checkout] lead:", leadErr.message); leadId = null; }
    }

    const { error } = await db.from("checkout_orders").insert({
      token, plan_id: q.plan.id, plan_code: q.plan.code, plan_name: q.plan.name, nome, telefone, email, documento, empresa,
      price_cents: q.priceCents, setup_cents: q.setupCents, discount_cents: q.discountCents, total_cents: q.totalCents,
      promo_id: q.promo?.id ?? null, promo_code: q.promo?.code ?? null, txid, pix_payload: pixPayload, lead_id: leadId, expires_at: expiresAt,
    });
    if (error) { console.error("[checkout] order:", error.message); return res.status(500).json({ error: "Não foi possível gerar o Pix. Tente novamente." }); }
    res.json({ token, totalCents: q.totalCents, pixPayload, status: "pending", expiresAt });
  });

  router.get("/order/:token", pub, async (req, res) => {
    if (!db) return res.status(503).json({ error: "Indisponível." });
    const { data } = await db.from("checkout_orders").select("status,total_cents,plan_name,pix_payload,expires_at,nome,email").eq("token", String(req.params.token).slice(0, 80)).maybeSingle();
    if (!data) return res.status(404).json({ error: "Pedido não encontrado." });
    const expirado = data.status === "pending" && new Date(data.expires_at).getTime() < Date.now();
    res.json({ status: expirado ? "expired" : data.status, totalCents: data.total_cents, planName: data.plan_name, pixPayload: data.pix_payload, nome: data.nome, email: data.email });
  });

  // "Já paguei": avisa quem vende para conferir o Pix e confirmar.
  router.post("/order/:token/paid", pubWrite, async (req, res) => {
    if (!db) return res.status(503).json({ error: "Indisponível." });
    const { data: o } = await db.from("checkout_orders").select("*").eq("token", String(req.params.token).slice(0, 80)).maybeSingle();
    if (!o) return res.status(404).json({ error: "Pedido não encontrado." });
    if (o.status === "paid" || o.status === "awaiting_confirmation") return res.json({ status: o.status });
    if (o.status !== "pending") return res.status(409).json({ error: "Este pedido não está mais aberto." });
    await db.from("checkout_orders").update({ status: "awaiting_confirmation", informed_paid_at: new Date().toISOString() }).eq("id", o.id);
    if (o.lead_id) await db.from("leads").update({ notes: `Checkout: cliente informou que pagou ${brl(o.total_cents)} (${o.plan_name}). Conferir o Pix e confirmar em Planos > Checkout.` }).eq("id", o.lead_id);
    try {
      const cfg = await config();
      if (cfg?.notify_email) {
        await sendPlatformEmail({
          to: cfg.notify_email, subject: `Pix informado: ${o.empresa} — ${brl(o.total_cents)}`,
          html: `<p><strong>${esc(o.nome)}</strong> (${esc(o.empresa)}) informou o pagamento de <strong>${brl(o.total_cents)}</strong> do plano ${esc(o.plan_name)}.</p><p>Confira o Pix recebido e confirme em <a href="${publicAppUrl}/app/admin?tab=plans&sub=checkout">Planos › Checkout</a>.</p>`,
        });
      }
    } catch (e: any) { console.error("[checkout] aviso interno:", e?.message); }
    res.json({ status: "awaiting_confirmation" });
  });

  // ── Administracao (super admin) ────────────────────────────────────────────
  router.get("/admin", requireUser, requireMaster, async (_req, res) => {
    if (!db) return res.status(503).json({ error: "Service role não configurada." });
    const [cfg, promos, orders] = await Promise.all([
      config(),
      db.from("checkout_promos").select("*").order("created_at", { ascending: false }),
      db.from("checkout_orders").select("id,status,plan_name,nome,empresa,email,telefone,documento,total_cents,discount_cents,promo_code,created_at,informed_paid_at,paid_at,error,tenant_id")
        .order("created_at", { ascending: false }).limit(100),
    ]);
    res.json({ config: cfg, promos: promos.data || [], orders: orders.data || [] });
  });

  router.put("/admin/config", requireUser, requireMaster, async (req, res) => {
    if (!db) return res.status(503).json({ error: "Service role não configurada." });
    const b = req.body || {};
    const row = {
      id: "main", active: b.active === true,
      pix_key: String(b.pixKey || "").trim().slice(0, 140),
      receiver_name: String(b.receiverName || "").trim().slice(0, 25),
      receiver_city: String(b.receiverCity || "").trim().slice(0, 15),
      notify_email: String(b.notifyEmail || "").trim().slice(0, 200),
      updated_at: new Date().toISOString(),
    };
    if (row.active && (!row.pix_key || !row.receiver_name || !row.receiver_city)) {
      return res.status(400).json({ error: "Para ativar, preencha a chave Pix, o nome e a cidade do recebedor." });
    }
    const { error } = await db.from("checkout_config").upsert(row, { onConflict: "id" });
    if (error) return res.status(400).json({ error: "Erro ao salvar." });
    res.json({ ok: true });
  });

  router.post("/admin/promos", requireUser, requireMaster, async (req, res) => {
    if (!db) return res.status(503).json({ error: "Service role não configurada." });
    const b = req.body || {};
    const row = {
      code: String(b.code || "").trim().slice(0, 40) || null,
      label: String(b.label || "").trim().slice(0, 80),
      plan_code: String(b.planCode || "").trim().toLowerCase() || null,
      percent_off: Math.min(100, Math.max(0, Math.round(Number(b.percentOff) || 0))),
      amount_off_cents: Math.max(0, Math.round(Number(b.amountOffCents) || 0)),
      setup_waived: b.setupWaived === true,
      valid_until: b.validUntil ? new Date(b.validUntil).toISOString() : null,
      max_uses: Number(b.maxUses) > 0 ? Math.round(Number(b.maxUses)) : null,
      active: b.active !== false,
    };
    if (!row.percent_off && !row.amount_off_cents && !row.setup_waived) return res.status(400).json({ error: "Defina um desconto (%, valor ou isenção da implantação)." });
    const { data, error } = b.id
      ? await db.from("checkout_promos").update(row).eq("id", b.id).select().single()
      : await db.from("checkout_promos").insert(row).select().single();
    if (error) return res.status(400).json({ error: error.code === "23505" ? "Já existe uma promoção com esse cupom." : "Erro ao salvar a promoção." });
    res.json(data);
  });

  router.delete("/admin/promos/:id", requireUser, requireMaster, async (req, res) => {
    if (!db) return res.status(503).json({ error: "Service role não configurada." });
    const { error } = await db.from("checkout_promos").delete().eq("id", req.params.id);
    if (error) return res.status(400).json({ error: "Erro ao excluir." });
    res.json({ ok: true });
  });

  router.post("/admin/orders/:id/cancel", requireUser, requireMaster, async (req, res) => {
    if (!db) return res.status(503).json({ error: "Service role não configurada." });
    const { error } = await db.from("checkout_orders").update({ status: "canceled" }).eq("id", req.params.id).neq("status", "paid");
    if (error) return res.status(400).json({ error: "Erro ao cancelar." });
    res.json({ ok: true });
  });

  /** Confirma o Pix: cria a empresa + acesso, aplica o plano, atualiza o lead e avisa o cliente. Idempotente. */
  router.post("/admin/orders/:id/confirm", requireUser, requireMaster, async (req: any, res) => {
    if (!db) return res.status(503).json({ error: "Service role não configurada." });
    const { data: o } = await db.from("checkout_orders").select("*").eq("id", req.params.id).maybeSingle();
    if (!o) return res.status(404).json({ error: "Pedido não encontrado." });
    if (o.status === "paid") return res.json({ ok: true, jaConfirmado: true, tenantId: o.tenant_id });
    if (o.status === "canceled") return res.status(409).json({ error: "Pedido cancelado." });

    const falha = async (msg: string, status = 400) => { await db.from("checkout_orders").update({ error: msg }).eq("id", o.id); return res.status(status).json({ error: msg }); };

    // Reserva o pedido (evita confirmar em duplicidade com dois cliques ao mesmo tempo).
    const { data: lock } = await db.from("checkout_orders").update({ status: "paid", paid_at: new Date().toISOString(), confirmed_by: req.user.id, error: null })
      .eq("id", o.id).neq("status", "paid").select("id").maybeSingle();
    if (!lock) return res.json({ ok: true, jaConfirmado: true });
    const desfazer = async (msg: string) => { await db.from("checkout_orders").update({ status: o.status, paid_at: null, confirmed_by: null, error: msg }).eq("id", o.id); };

    let tenantId: string | null = o.tenant_id;
    try {
      if (!tenantId) {
        const { data: existente } = await db.from("users").select("id").eq("email", o.email).maybeSingle();
        if (existente) { await desfazer("Este e-mail já tem acesso ao sistema."); return res.status(409).json({ error: "Este e-mail já tem acesso ao sistema. Peça outro e-mail ao cliente ou crie o acesso manualmente." }); }

        const { data: tenant, error: tErr } = await db.from("tenants").insert({
          name: o.empresa, niche: "Parceira", plan: o.plan_code, status: "Active", timezone: "America/Sao_Paulo", primary_color: "#2563EB",
          modules: { crm: true, sdr: false, advDashboard: false, financeiro: true, marketing: false, educacao: false, clinica: false, produtividade: true, rh: false, bi: false, engajamento: false },
        }).select().maybeSingle();
        if (tErr || !tenant) { await desfazer("Erro ao criar a empresa."); return res.status(500).json({ error: "Erro ao criar a empresa." }); }

        const senha = randomBytes(18).toString("base64url");
        const created = await db.auth.admin.createUser({ email: o.email, password: senha, email_confirm: true });
        if (!created.data?.user) {
          await db.from("tenants").delete().eq("id", tenant.id);
          await desfazer("Erro ao criar o acesso (o e-mail pode já ter login).");
          return res.status(409).json({ error: "Não foi possível criar o acesso: o e-mail pode já ter um login no sistema." });
        }
        const { error: uErr } = await db.from("users").insert({
          id: created.data.user.id, tenant_id: tenant.id, name: o.nome, email: o.email, role: "Admin", is_master: false, is_tenant_admin: true, active: true,
        });
        if (uErr) {
          await db.from("tenants").delete().eq("id", tenant.id);
          await db.auth.admin.deleteUser(created.data.user.id);
          await desfazer("Erro ao criar o perfil de acesso.");
          return res.status(500).json({ error: "Erro ao criar o perfil de acesso." });
        }
        tenantId = tenant.id;
        await db.from("app_settings").insert({ tenant_id: tenant.id, key: "empresa_dados", value: { nome: o.empresa, cnpj: o.documento, email: o.email, telefone: o.telefone } });
      }

      if (o.plan_id) {
        await provisionPlan(tenantId!, o.plan_id, req.user.id);
        const { data: plan } = await db.from("subscription_plans").select("billing_interval").eq("id", o.plan_id).maybeSingle();
        const fim = new Date();
        if (plan?.billing_interval === "yearly") fim.setFullYear(fim.getFullYear() + 1); else fim.setMonth(fim.getMonth() + 1);
        await db.from("tenant_subscriptions").update({
          status: "active", trial_ends_at: null, last_payment_at: new Date().toISOString(), current_period_end: fim.toISOString(), updated_at: new Date().toISOString(),
        }).eq("tenant_id", tenantId);
        await db.from("billing_events").insert({ tenant_id: tenantId, type: "payment_confirmed", to_status: "active", amount_cents: o.total_cents, payload: { by: req.user.id, source: "checkout_pix", order: o.id } });
      }

      await db.from("checkout_orders").update({ tenant_id: tenantId }).eq("id", o.id);
      if (o.promo_id) {
        const { data: pr } = await db.from("checkout_promos").select("uses").eq("id", o.promo_id).maybeSingle();
        if (pr) await db.from("checkout_promos").update({ uses: (pr.uses || 0) + 1 }).eq("id", o.promo_id);
      }
      if (o.lead_id) await db.from("leads").update({ status: "Fechado", value: o.total_cents / 100, notes: `Checkout: pagamento de ${brl(o.total_cents)} confirmado (${o.plan_name}). Empresa criada e acesso enviado.` }).eq("id", o.lead_id);

      // Acesso: link para o cliente definir a propria senha (nada de senha por e-mail).
      let emailEnviado = false;
      try {
        const link = await db.auth.admin.generateLink({ type: "recovery", email: o.email, options: { redirectTo: `${publicAppUrl}/redefinir-senha` } });
        const url = link.data?.properties?.action_link;
        if (url) {
          await sendPlatformEmail({
            to: o.email, subject: "Pagamento confirmado — seu acesso ao S.P.Y.",
            html: `<p>Olá, ${esc(o.nome.split(" ")[0])}!</p><p>Recebemos o pagamento de <strong>${brl(o.total_cents)}</strong> (plano ${esc(o.plan_name)}). A empresa <strong>${esc(o.empresa)}</strong> já está criada.</p><p><a href="${url}">Clique aqui para definir sua senha e entrar</a>.</p><p>Em breve nosso time entra em contato pelo WhatsApp para a implantação.</p>`,
          });
          emailEnviado = true;
        }
      } catch (e: any) { console.error("[checkout] e-mail de acesso:", e?.message); }

      // Agente de implantacao (n8n), igual ao cadastro manual de empresa. Nunca atrasa nem derruba a confirmacao.
      const secret = process.env.SPY_IMPLEMENTACAO_WEBHOOK_SECRET;
      if (secret) {
        fetch("https://n8n.spycrm.com.br/webhook/spy-agente-implementacao-tenant-criado", {
          method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret },
          body: JSON.stringify({ tenant_id: tenantId, company: o.empresa, email: o.email, phone: o.telefone, implementation_id: "" }),
        }).catch((e: any) => console.error("[checkout] agente de implantação:", e?.message));
      }

      res.json({ ok: true, tenantId, emailEnviado });
    } catch (e: any) {
      console.error("[checkout] confirm:", e?.message);
      await desfazer("Erro inesperado ao confirmar.");
      res.status(500).json({ error: "Erro inesperado ao confirmar. Tente de novo." });
    }
  });

  return router;
}
