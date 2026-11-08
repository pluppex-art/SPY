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
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import rateLimit from "express-rate-limit";
import { sendPlatformEmail } from "./mailer.js";
import { upsertLead, atualizarLeadPorId } from "./leadUpsert.js";
import { notificationEmail, type NotificationKind } from "./emailTemplates.js";
import { whatsappUrl, formatPhoneBR } from "./emailNotify.js";

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

/** O Pix exige a chave "crua": CPF/CNPJ só com números, telefone como +55DDDNÚMERO, e-mail em minúsculas. */
export function normalizaChavePix(raw: string): string {
  const k = String(raw || "").trim();
  if (k.includes("@")) return k.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return k.toLowerCase();
  if (/^\+/.test(k)) return `+${k.replace(/\D/g, "")}`;
  if (/^\(?\d{2}\)?[\s-]?9?\d{4}-?\d{4}$/.test(k) && k.replace(/\D/g, "").length <= 11 && /[()\s]/.test(k)) return `+55${k.replace(/\D/g, "")}`;
  if (/^[\d.\-/\s]+$/.test(k)) return k.replace(/\D/g, "");
  return k;
}

export function pixBrCode(o: { key: string; name: string; city: string; amountCents: number; txid: string }): string {
  const conta = tlv("00", "br.gov.bcb.pix") + tlv("01", normalizaChavePix(o.key));
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
/** Escapa % _ \\ para usar o e-mail em ilike como igualdade case-insensitive. */
const likeEsc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
/** Usuario desativado/excluido nao e reaproveitado pelo checkout (reativacao so pelo admin). */
const usuarioInativo = (u: any) => !!u && (u.active === false || !!u.deleted_at);

/** Varios destinatarios no mesmo campo (separados por virgula, ponto e virgula ou espaco). */
const destinatarios = (raw: unknown): string[] => [...new Set(String(raw || "").split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))].slice(0, 6);

export function createCheckoutRouter({ requireUser, requireMaster, supabaseService: db, provisionPlan, publicAppUrl }: Deps) {
  const router = Router();

  /** Avisos internos no mesmo modelo dos avisos do S.P.Y. (financeiro/comercial). Nunca lança; espera no máximo 8s. */
  async function avisarEquipe(copyKey: string, kind: NotificationKind, title: string, description: string, details: { label: string; value: string }[], phone?: string, link = `${publicAppUrl}/app/admin?tab=plans&sub=checkout`) {
    try {
      const cfg = await config();
      const para = destinatarios(cfg?.notify_email);
      if (!para.length) return;
      const wa = whatsappUrl(phone);
      const det = [...details];
      if (wa && phone) det.push({ label: "WhatsApp", value: formatPhoneBR(phone) });
      const mail = notificationEmail({ kind, copyKey, title, description, details: det, linkUrl: link, primaryButton: wa ? { label: "Chamar no WhatsApp", url: wa } : undefined, name: "equipe" });
      await Promise.race([
        Promise.allSettled(para.map((to) => sendPlatformEmail({ to, ...mail }))),
        new Promise((r) => setTimeout(r, 8000)),
      ]);
    } catch (e: any) { console.error("[checkout] aviso interno:", e?.message); }
  }
  const pub = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false });
  const pubWrite = rateLimit({ windowMs: 60_000, limit: 8, standardHeaders: true, legacyHeaders: false });

  type Quote = { plan: any; promo: any | null; priceCents: number; setupCents: number; discountCents: number; totalCents: number; listCents: number; listSetupCents?: number; listMonthlyCents?: number };

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
    return { plan, promo, priceCents: base, setupCents: setup, discountCents, totalCents: base + setup - discountCents, listCents: base + setup };
  }

  /** Produto unico: o valor promocional do checkout (sem implantacao) substitui a tabela do plano; o "de" riscado vem da config. */
  async function finalQuote(planCode: string, promoCode?: string): Promise<Quote> {
    const cfg = await config();
    if (cfg?.single_plan_code && cfg.offer_cents && String(planCode).toLowerCase() === cfg.single_plan_code.toLowerCase()) {
      const q = await quoteFor(cfg.single_plan_code);
      const detalhado = (cfg.list_setup_cents || 0) > 0 && (cfg.list_monthly_cents || 0) > 0;
      const lista = Math.max(detalhado ? (cfg.list_setup_cents as number) + (cfg.list_monthly_cents as number) : cfg.list_price_cents || 0, cfg.offer_cents);
      return { ...q, promo: { label: "Oferta de lançamento", code: null }, priceCents: lista, setupCents: 0, discountCents: lista - cfg.offer_cents, totalCents: cfg.offer_cents, listCents: lista, ...(detalhado ? { listSetupCents: cfg.list_setup_cents as number, listMonthlyCents: cfg.list_monthly_cents as number } : {}) };
    }
    return quoteFor(planCode, promoCode);
  }

  const quoteJson = (q: Quote) => ({
    plan: { code: q.plan.code, name: q.plan.name, tagline: q.plan.tagline ?? "", interval: q.plan.billing_interval, features: Array.isArray(q.plan.features) ? q.plan.features : [] },
    priceCents: q.priceCents, setupCents: q.setupCents, discountCents: q.discountCents, totalCents: q.totalCents, listCents: q.listCents, listSetupCents: q.listSetupCents ?? null, listMonthlyCents: q.listMonthlyCents ?? null,
    promo: q.promo ? { label: q.promo.label || q.promo.code || "Promoção", code: q.promo.code ?? null, auto: !q.promo.code } : null,
  });

  async function config() {
    const { data } = await db!.from("checkout_config").select("*").eq("id", "main").maybeSingle();
    return data as { active: boolean; pix_key: string; receiver_name: string; receiver_city: string; notify_email: string; single_plan_code: string | null; list_price_cents: number; offer_cents: number | null; list_setup_cents?: number | null; list_monthly_cents?: number | null } | null;
  }

  class FulfillError extends Error { constructor(msg: string, public code = 500) { super(msg); } }

  const AUTO_FULFILL = () => process.env.CHECKOUT_AUTO_FULFILL === "true";
  const addPeriod = (from: Date, interval?: string | null) => { const d = new Date(from); if (interval === "yearly") d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1); return d; };
  const clientIp = (req: any) => String(req.headers?.["x-forwarded-for"] || req.ip || "").split(",")[0].trim().slice(0, 64) || null;

  /** Id do usuario no Auth por e-mail (RPC so do service role). Null se nao existe ou a RPC ainda nao foi aplicada. */
  async function authIdByEmail(email: string): Promise<string | null> {
    const { data, error } = await db!.rpc("auth_user_id_by_email", { p_email: email });
    if (error) { console.error("[checkout] auth_user_id_by_email:", error.message); return null; }
    return (data as string | null) || null;
  }

  /**
   * Agente de implantacao (n8n), igual ao cadastro manual de empresa. Aguarda a resposta por ate 6s (AbortController);
   * o resultado e gravado no pedido e, se falhar, a equipe e avisada. URL e implementation_id vem de env (com o padrao atual).
   */
  async function acionarAgentes(o: any, tenantId: string): Promise<{ ok: boolean; erro: string | null }> {
    const secret = process.env.SPY_IMPLEMENTACAO_WEBHOOK_SECRET;
    if (!secret) return { ok: false, erro: "SPY_IMPLEMENTACAO_WEBHOOK_SECRET não configurada: agentes não acionados." };
    const url = process.env.SPY_IMPLEMENTACAO_WEBHOOK_URL || "https://n8n.spycrm.com.br/webhook/spy-agente-implementacao-tenant-criado";
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 6000);
    try {
      const r = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret }, signal: ac.signal,
        body: JSON.stringify({ tenant_id: tenantId, company: o.empresa, email: o.email, phone: o.telefone, implementation_id: process.env.SPY_IMPLEMENTACAO_ID || "" }),
      });
      if (!r.ok) return { ok: false, erro: `n8n respondeu HTTP ${r.status}` };
      return { ok: true, erro: null };
    } catch (e: any) {
      return { ok: false, erro: e?.name === "AbortError" ? "n8n não respondeu em 6 segundos" : String(e?.message || "falha ao chamar o n8n").slice(0, 200) };
    } finally { clearTimeout(timer); }
  }

  /**
   * Libera o pedido. Dois caminhos:
   *  - kind 'new': cria empresa + admin + assinatura (ou, se o e-mail JA tem acesso, reaproveita a empresa dele: ver abaixo);
   *  - kind 'renewal' (renovacao, cliente cancelado/suspenso voltando, segunda compra do mesmo e-mail): NAO cria empresa nova.
   *    Decisao de modelo: um e-mail = uma empresa (users.email e unico). Entao reativa/estende a assinatura da empresa que ja existe.
   * Idempotente e recuperavel: tenant_id e created_user_id sao gravados no pedido logo que existem; uma retentativa reaproveita
   * o que ja foi criado. Se este passe criou algo e falhar antes de concluir, desfaz TUDO que ele criou (sem orfaos).
   * `by` = quem confirmou (null = venda automatica pelo comprovante, so com CHECKOUT_AUTO_FULFILL=true).
   */
  async function fulfill(o: any, by: string | null, res: any, opts: { recover?: boolean } = {}) {
    const agora = new Date().toISOString();
    // Reserva o pedido (evita confirmar em duplicidade com dois cliques ao mesmo tempo).
    const base = db!.from("checkout_orders").update({ status: "paid", paid_at: agora, confirmed_by: by, error: null }).eq("id", o.id);
    const { data: lock } = await (opts.recover
      ? base.eq("status", "paid").is("fulfilled_at", null).lt("paid_at", new Date(Date.now() - 3 * 60_000).toISOString())
      : base.neq("status", "paid")).select("id").maybeSingle();
    if (!lock) return opts.recover
      ? res.status(409).json({ error: "Este pedido ainda está sendo processado. Aguarde 3 minutos e tente de novo." })
      : res.json({ ok: true, jaConfirmado: true });
    const desfazer = async (msg: string) => { await db!.from("checkout_orders").update({ status: o.status, paid_at: opts.recover ? o.paid_at : null, confirmed_by: null, error: msg }).eq("id", o.id); };

    let tenantId: string | null = o.tenant_id || null;
    let userId: string | null = o.created_user_id || null;
    const criado = { tenant: false, authUser: false, userRow: false };
    let reuse = o.kind === "renewal"; // true = empresa que ja existia (nao e venda nova)

    const rollback = async () => {
      try {
        if (criado.userRow && userId) await db!.from("users").delete().eq("id", userId);
        if (criado.authUser && userId) await db!.auth.admin.deleteUser(userId);
        let tenantFicou = false;
        if (criado.tenant && tenantId) {
          await db!.from("app_settings").delete().eq("tenant_id", tenantId);
          const { error: dErr } = await db!.from("tenants").delete().eq("id", tenantId);
          if (dErr) {
            tenantFicou = true;
            console.error("[checkout] rollback: não removeu a empresa:", dErr.message);
            // Mantem tenant_id/created_user_id no pedido: a retentativa reaproveita o que ficou.
            await db!.from("checkout_orders").update({ tenant_id: tenantId, created_user_id: userId }).eq("id", o.id);
            await avisarEquipe("checkout_atencao", "warning", `Atenção no checkout: sobrou empresa incompleta (${o.empresa})`,
              `A liberação do pedido de ${o.nome} falhou e a empresa criada (${tenantId}) não pôde ser removida (${dErr.message}). O pedido foi mantido ligado a ela: tente confirmar de novo no painel.`,
              [{ label: "Cliente", value: o.nome }, { label: "E-mail", value: o.email }, { label: "Empresa (id)", value: String(tenantId) }], o.telefone);
          }
        }
        if (!tenantFicou && (criado.tenant || criado.authUser)) await db!.from("checkout_orders").update({ tenant_id: o.kind === "renewal" ? o.tenant_id : null, created_user_id: null }).eq("id", o.id);
      } catch (e: any) { console.error("[checkout] rollback:", e?.message); }
    };

    try {
      // 1) Empresa + acesso
      if (tenantId && o.kind !== "renewal") {
        const { data: ainda } = await db!.from("tenants").select("id").eq("id", tenantId).maybeSingle();
        if (!ainda) tenantId = null; // a empresa de uma tentativa anterior sumiu: recria
      }
      if (!tenantId) {
        const { data: existente } = await db!.from("users").select("*").ilike("email", likeEsc(o.email)).limit(1).maybeSingle();
        if (existente) {
          if (usuarioInativo(existente)) {
            await avisarEquipe("checkout_atencao", "warning", `Atenção no checkout: acesso desativado (${o.empresa})`,
              `${o.nome} (${o.empresa}) pagou, mas o e-mail ${o.email} pertence a um usuário desativado/excluído. A reativação deve ser feita por um administrador; o pedido segue pendente de liberação.`,
              [{ label: "Cliente", value: o.nome }, { label: "E-mail", value: o.email }, { label: "Plano / valor", value: `${o.plan_name} · ${brl(o.total_cents)}` }], o.telefone);
            throw new FulfillError("Este e-mail tem um acesso desativado. A reativação deve ser feita por um administrador; a equipe foi avisada.", 409);
          }
          if (existente.is_master || !existente.tenant_id) throw new FulfillError("Este e-mail pertence a um administrador do sistema. Use outro e-mail ou crie o acesso manualmente.", 409);
          tenantId = existente.tenant_id; reuse = true;
        } else {
          const { data: tenant, error: tErr } = await db!.from("tenants").insert({
            name: o.empresa, niche: "Geral", plan: o.plan_code, status: "Active", timezone: "America/Sao_Paulo", primary_color: "#F97316",
            modules: { crm: true, sdr: false, advDashboard: false, financeiro: true, marketing: false, educacao: false, clinica: false, produtividade: true, rh: false, bi: false, engajamento: false },
          }).select().maybeSingle();
          if (tErr || !tenant) throw new FulfillError("Erro ao criar a empresa.");
          tenantId = tenant.id; criado.tenant = true;
          await db!.from("checkout_orders").update({ tenant_id: tenantId }).eq("id", o.id); // recuperavel numa retentativa
        }
      }
      if (!tenantId) throw new FulfillError("Empresa não encontrada para este pedido.");

      if (!reuse) {
        const { data: u } = await db!.from("users").select("id").eq("tenant_id", tenantId).ilike("email", likeEsc(o.email)).limit(1).maybeSingle();
        if (u) userId = u.id;
        else {
          let authId: string | null = o.created_user_id || (await authIdByEmail(o.email));
          if (!authId) {
            const senha = randomBytes(18).toString("base64url");
            const c = await db!.auth.admin.createUser({ email: o.email, password: senha, email_confirm: true });
            if (!c.data?.user) throw new FulfillError("Não foi possível criar o acesso: o e-mail pode já ter um login no sistema.", 409);
            authId = c.data.user.id; criado.authUser = true;
          }
          userId = authId;
          await db!.from("checkout_orders").update({ created_user_id: authId }).eq("id", o.id);
          const { error: uErr } = await db!.from("users").insert({
            id: authId, tenant_id: tenantId, name: o.nome, email: o.email, role: "Admin", is_master: false, is_tenant_admin: true, active: true,
          });
          if (uErr) throw new FulfillError("Erro ao criar o perfil de acesso.");
          criado.userRow = true;
        }
        const { data: emp } = await db!.from("app_settings").select("tenant_id").eq("tenant_id", tenantId).eq("key", "empresa_dados").maybeSingle();
        if (!emp) await db!.from("app_settings").insert({ tenant_id: tenantId, key: "empresa_dados", value: { nome: o.empresa, cnpj: o.documento, email: o.email, telefone: o.telefone } });
      }

      // 2) Assinatura: plano (so quando preciso) + periodo pago. O periodo so e estendido uma vez por pedido.
      if (o.plan_id) {
        const { data: sub } = await db!.from("tenant_subscriptions").select("status,plan_id,current_period_end").eq("tenant_id", tenantId).maybeSingle();
        const precisaPlano = !reuse || !sub || sub.plan_id !== o.plan_id || ["canceled", "suspended"].includes(sub.status);
        if (precisaPlano) await provisionPlan(tenantId, o.plan_id, by || undefined);
        const { data: jaAplicado } = await db!.from("billing_events").select("id").eq("tenant_id", tenantId).eq("type", "payment_confirmed").contains("payload", { order: o.id }).limit(1).maybeSingle();
        if (!jaAplicado) {
          const { data: plan } = await db!.from("subscription_plans").select("billing_interval").eq("id", o.plan_id).maybeSingle();
          const atualFim = reuse && sub?.current_period_end && new Date(sub.current_period_end) > new Date() ? new Date(sub.current_period_end) : new Date();
          const { error: sErr } = await db!.from("tenant_subscriptions").update({
            status: "active", trial_ends_at: null, last_payment_at: agora, current_period_end: addPeriod(atualFim, plan?.billing_interval).toISOString(), suspended_at: null, updated_at: agora,
          }).eq("tenant_id", tenantId);
          if (sErr) throw new FulfillError("Erro ao ativar a assinatura.");
          await db!.from("billing_events").insert({ tenant_id: tenantId, type: "payment_confirmed", to_status: "active", amount_cents: o.total_cents, payload: { by, source: "checkout_pix", order: o.id } });
        }
      }

      else throw new FulfillError("Este pedido não tem plano associado. Não foi possível ativar a assinatura; confira o pedido.", 422);

      // 3) Concluido no banco: daqui em diante nada desfaz a venda (e-mail e agentes so geram aviso se falharem).
      await db!.from("checkout_orders").update({ tenant_id: tenantId, fulfilled_at: new Date().toISOString() }).eq("id", o.id);
      if (o.promo_id) {
        const { data: marcou } = await db!.from("checkout_orders").update({ promo_consumed_at: agora }).eq("id", o.id).is("promo_consumed_at", null).select("id").maybeSingle();
        if (marcou) {
          const { data: okUso, error: uErr } = await db!.rpc("checkout_promo_consume", { p_id: o.promo_id });
          if (uErr) console.error("[checkout] cupom:", uErr.message);
          else if (okUso === false) console.warn("[checkout] cupom esgotou entre o pedido e a confirmação; venda mantida:", o.promo_id);
        }
      }
      const vendedor = process.env.SPY_FORM_TENANT_ID || process.env.AXIS_FORM_TENANT_ID;
      if (o.lead_id && vendedor) await atualizarLeadPorId(db!, vendedor, o.lead_id, "ganho", `Checkout: pagamento de ${brl(o.total_cents)} confirmado (${o.plan_name}). ${reuse ? "Assinatura renovada/reativada." : "Empresa criada e acesso enviado."}`, o.total_cents / 100).catch((e: any) => console.error("[checkout] lead ganho:", e?.message));

      // 4) E-mail ao cliente e agentes n8n, em paralelo (cada um com seu proprio tratamento de erro).
      const enviarEmail = async (): Promise<boolean> => {
        try {
          let mail;
          if (!reuse) {
            // Acesso: link para o cliente definir a propria senha (nada de senha por e-mail). O link tem validade limitada.
            const link = await db!.auth.admin.generateLink({ type: "recovery", email: o.email, options: { redirectTo: `${publicAppUrl}/redefinir-senha` } });
            const url = link.data?.properties?.action_link;
            if (!url) return false;
            mail = notificationEmail({
              kind: "success", copyKey: "checkout_acesso", title: "Pagamento confirmado — seu acesso ao S.P.Y.",
              description: `Recebemos o pagamento de ${brl(o.total_cents)} (plano ${o.plan_name}). Defina sua senha para entrar.`,
              details: [{ label: "Empresa", value: o.empresa }, { label: "Plano", value: o.plan_name }, { label: "Valor", value: brl(o.total_cents) }, { label: "Validade do link", value: "limitada (cerca de 1 hora). Se expirar, use “Esqueci a senha” em " + publicAppUrl.replace(/^https?:\/\//, "") + "/login" }],
              primaryButton: { label: "Definir minha senha e entrar", url }, name: o.nome,
            });
          } else {
            mail = notificationEmail({
              kind: "success", copyKey: "checkout_renovacao", title: "Pagamento confirmado — assinatura em dia",
              description: `Recebemos o pagamento de ${brl(o.total_cents)} (plano ${o.plan_name}).`,
              details: [{ label: "Empresa", value: o.empresa }, { label: "Plano", value: o.plan_name }, { label: "Valor", value: brl(o.total_cents) }],
              primaryButton: { label: "Entrar no S.P.Y.", url: `${publicAppUrl}/login` }, name: o.nome,
            });
          }
          await sendPlatformEmail({ to: o.email, ...mail });
          return true;
        } catch (e: any) { console.error("[checkout] e-mail de acesso:", e?.message); return false; }
      };
      const [emailEnviado, agentes] = await Promise.all([
        enviarEmail(),
        reuse ? Promise.resolve({ ok: true, erro: null as string | null }) : acionarAgentes(o, tenantId),
      ]);
      await db!.from("checkout_orders").update({ acesso_email_ok: emailEnviado, agentes_ok: reuse ? null : agentes.ok, agentes_erro: agentes.erro }).eq("id", o.id);
      if (!agentes.ok) console.error("[checkout] agentes:", agentes.erro);

      const problemas: string[] = [];
      if (!emailEnviado) problemas.push(`O e-mail de acesso para ${o.email} NÃO foi enviado. Oriente o cliente a abrir a tela de login e usar “Esqueci a senha”.`);
      if (!agentes.ok) problemas.push(`Os agentes de implantação (n8n) não foram acionados: ${agentes.erro}. Acione manualmente.`);
      const info = [{ label: "Cliente", value: o.nome }, { label: "Empresa", value: o.empresa }, { label: "Plano / valor", value: `${o.plan_name} · ${brl(o.total_cents)}` }, { label: "E-mail", value: o.email }];
      if (problemas.length) {
        await avisarEquipe("checkout_atencao", "warning", `Atenção no checkout: ${o.empresa}`, `Venda confirmada, mas ${problemas.join(" ")}`, info, o.telefone);
      } else if (by === null) {
        await avisarEquipe("checkout_venda", "success", `Venda no checkout: ${o.empresa} — ${brl(o.total_cents)}`, `${o.nome} (${o.empresa}) enviou o comprovante de ${brl(o.total_cents)} e a venda foi liberada automaticamente. Confira o Pix no banco.`, info, o.telefone);
      }

      // Verificacao multi-tenant: a empresa existe, tem admin proprio, assinatura ativa e nenhum outro tenant foi tocado.
      const [tn, us, sb] = await Promise.all([
        db!.from("tenants").select("id").eq("id", tenantId).maybeSingle(),
        db!.from("users").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("email", o.email),
        db!.from("tenant_subscriptions").select("status").eq("tenant_id", tenantId).maybeSingle(),
      ]);
      const checks = { empresa: !!tn.data, acesso: (us.count ?? 0) >= 1, assinatura: sb.data?.status === "active", agentes: reuse ? true : agentes.ok, email: emailEnviado };
      res.json({ ok: true, tenantId, emailEnviado, checks, renovacao: reuse });
    } catch (e: any) {
      const msg = e instanceof FulfillError ? e.message : "Erro inesperado ao confirmar. Tente de novo.";
      console.error("[checkout] confirm:", e?.message);
      await rollback();
      await desfazer(msg);
      res.status(e instanceof FulfillError ? e.code : 500).json({ error: msg });
    }
  }

  /**
   * Abre (ou reaproveita) um pedido Pix. Cuida de: expirar vencidos, nao duplicar pedido aberto do mesmo e-mail,
   * limites anti-spam e limite de usos do cupom. `antes` roda so quando um pedido novo vai mesmo ser criado (ex.: lead no CRM).
   */
  type NovoPedido = {
    kind: "new" | "renewal"; tenantId: string | null; plan: any; planId: string; nome: string; telefone: string; email: string; documento: string; empresa: string;
    priceCents: number; setupCents: number; discountCents: number; totalCents: number; promo: any | null; ip: string | null;
    consent?: { version: string }; antes?: () => Promise<string | null>;
  };
  type Aberto = { token: string; totalCents: number; pixPayload: string; status: string; expiresAt: string };
  const dtoPedido = (p: any): Aberto => ({ token: p.token, totalCents: p.total_cents, pixPayload: p.pix_payload, status: p.status, expiresAt: p.expires_at });

  async function abrirPedido(n: NovoPedido, cfg: NonNullable<Awaited<ReturnType<typeof config>>>): Promise<{ ok: true; pedido: Aberto; novo: boolean } | { ok: false; status: number; error: string }> {
    const agora = new Date().toISOString();
    // Pix vencido que ninguem pagou deixa de ocupar a vaga (pedidos 'awaiting_confirmation' nunca expiram sozinhos).
    await db!.from("checkout_orders").update({ status: "expired" }).eq("email", n.email).eq("kind", n.kind).eq("status", "pending").lt("expires_at", agora);

    // Chamada anonima: so quem informa o MESMO documento do pedido existente e tratado como o mesmo solicitante.
    // Qualquer outra situacao devolve resposta neutra (sem token, sem Pix, sem confirmar que o pedido existe).
    const neutro = { ok: false as const, status: 409, error: "Não foi possível gerar o Pix agora. Confira os dados informados ou fale com a gente pelo WhatsApp." };

    const { data: aguardando } = await db!.from("checkout_orders").select("*").eq("email", n.email).eq("kind", n.kind).eq("status", "awaiting_confirmation")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (aguardando) return aguardando.documento === n.documento ? { ok: true, pedido: dtoPedido(aguardando), novo: false } : neutro;

    const { data: aberto } = await db!.from("checkout_orders").select("*").eq("email", n.email).eq("kind", n.kind).eq("status", "pending")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (aberto) {
      if (aberto.documento !== n.documento) return neutro; // nunca cancela/substitui o pedido de outro solicitante
      if (aberto.plan_code === n.plan.code && aberto.total_cents === n.totalCents) return { ok: true, pedido: dtoPedido(aberto), novo: false };
      await db!.from("checkout_orders").update({ status: "canceled" }).eq("id", aberto.id).eq("status", "pending"); // mesmo solicitante mudou de plano/valor
    }

    // Anti-spam: pedidos do mesmo IP+e-mail (24h) e por IP (1h). O limite por e-mail NAO e global: um terceiro nao bloqueia o e-mail alheio.
    const [porEmail, porIp] = await Promise.all([
      n.ip ? db!.from("checkout_orders").select("id", { count: "exact", head: true }).eq("email", n.email).eq("consent_ip", n.ip).gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString()) : Promise.resolve({ count: 0 }),
      n.ip ? db!.from("checkout_orders").select("id", { count: "exact", head: true }).eq("consent_ip", n.ip).gte("created_at", new Date(Date.now() - 3600_000).toISOString()) : Promise.resolve({ count: 0 }),
    ]);
    if ((porEmail.count ?? 0) >= 6 || (porIp.count ?? 0) >= 20) return { ok: false, status: 429, error: "Muitas tentativas em pouco tempo. Aguarde um pouco ou fale com a gente pelo WhatsApp." };

    // Cupom com limite: usos ja consumidos + pedidos que o seguram (pending ainda valido ou aguardando confirmacao) nao podem passar de max_uses.
    if (n.promo?.id && n.promo.max_uses != null) {
      const { count } = await db!.from("checkout_orders").select("id", { count: "exact", head: true }).eq("promo_id", n.promo.id)
        .or(`status.eq.awaiting_confirmation,and(status.eq.pending,expires_at.gt.${agora})`);
      if ((n.promo.uses || 0) + (count ?? 0) >= n.promo.max_uses) return { ok: false, status: 400, error: "Este cupom esgotou. Tente sem cupom ou fale com a gente." };
    }

    const leadId = n.antes ? await n.antes() : null;
    const token = randomBytes(18).toString("hex");
    const txid = `SPY${token.slice(0, 20).toUpperCase()}`;
    const pixPayload = pixBrCode({ key: cfg.pix_key, name: cfg.receiver_name, city: cfg.receiver_city, amountCents: n.totalCents, txid });
    const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
    const { error } = await db!.from("checkout_orders").insert({
      token, kind: n.kind, tenant_id: n.tenantId, plan_id: n.planId, plan_code: n.plan.code, plan_name: n.plan.name, nome: n.nome, telefone: n.telefone, email: n.email, documento: n.documento, empresa: n.empresa,
      price_cents: n.priceCents, setup_cents: n.setupCents, discount_cents: n.discountCents, total_cents: n.totalCents,
      promo_id: n.promo?.id ?? null, promo_code: n.promo?.code ?? null, txid, pix_payload: pixPayload, lead_id: leadId, expires_at: expiresAt,
      consent_at: n.consent ? agora : null, consent_ip: n.ip, consent_version: n.consent?.version ?? null,
    });
    if (error) {
      if (error.code === "23505") { // corrida: outro clique criou o pedido aberto neste instante
        const { data: outro } = await db!.from("checkout_orders").select("*").eq("email", n.email).eq("kind", n.kind).eq("status", "pending").limit(1).maybeSingle();
        if (outro) return outro.documento === n.documento ? { ok: true, pedido: dtoPedido(outro), novo: false } : neutro;
      }
      console.error("[checkout] order:", error.message);
      return { ok: false, status: 500, error: "Não foi possível gerar o Pix. Tente novamente." };
    }
    return { ok: true, pedido: { token, totalCents: n.totalCents, pixPayload, status: "pending", expiresAt }, novo: true };
  }

  // ── Publico ────────────────────────────────────────────────────────────────
  router.get("/plans", pub, async (_req, res) => {
    if (!db) return res.status(503).json({ error: "Indisponível." });
    const cfg = await config();
    const { data } = await db.from("subscription_plans")
      .select("code,name,price_cents,billing_interval,setup_price_cents,tagline,badge,features,highlight,sort_order")
      .eq("active", true).eq("show_on_site", true).order("sort_order").order("price_cents");
    const enabled = !!(cfg?.active && cfg.pix_key);
    if (cfg?.single_plan_code) {
      try { return res.json({ enabled, single: quoteJson(await finalQuote(cfg.single_plan_code)), plans: [] }); } catch { /* cai na lista */ }
    }
    const plans = [];
    for (const p of data || []) {
      try { plans.push({ ...quoteJson(await quoteFor((p as any).code)), badge: (p as any).badge ?? null, highlight: !!(p as any).highlight }); } catch { /* plano sem cotação */ }
    }
    res.json({ enabled, single: null, plans });
  });

  router.post("/quote", pub, async (req, res) => {
    try { res.json(quoteJson(await finalQuote(req.body?.planCode, req.body?.promoCode))); }
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
    if (b.consentimento !== true) return res.status(400).json({ error: "Para continuar, aceite o uso dos seus dados (política de privacidade)." });

    const cfg = await config();
    if (!cfg?.active || !cfg.pix_key) return res.status(503).json({ error: "O pagamento ainda não está disponível. Fale com a gente pelo WhatsApp." });

    let q: Quote;
    try { q = await finalQuote(b.planCode, b.promoCode); } catch (e: any) { return res.status(400).json({ error: e?.message || "Plano inválido." }); }
    if (q.totalCents < 100) return res.status(400).json({ error: "Valor inválido para pagamento via Pix." });

    // E-mail que ja tem acesso (cliente cancelado/suspenso voltando, ou segunda compra): o pedido e de RENOVACAO da empresa
    // que ja existe (um e-mail = uma empresa). Nada e revelado ao comprador: a resposta e igual a de um cliente novo.
    const { data: existente } = await db.from("users").select("*").ilike("email", likeEsc(email)).limit(1).maybeSingle();
    if (usuarioInativo(existente)) {
      await avisarEquipe("checkout_atencao", "warning", `Checkout: e-mail de usuário desativado (${empresa})`,
        `${nome} (${empresa}) tentou comprar com o e-mail ${email}, que pertence a um usuário desativado/excluído. Nenhum pedido foi criado; a reativação é feita só por um administrador.`,
        [{ label: "Cliente", value: nome }, { label: "E-mail", value: email }], telefone);
      return res.status(400).json({ error: "Não foi possível usar este e-mail no checkout. Fale com a gente pelo WhatsApp." });
    }
    if (existente && (existente.is_master || !existente.tenant_id)) return res.status(400).json({ error: "Não foi possível usar este e-mail no checkout. Fale com a gente pelo WhatsApp." });
    const kind = existente ? "renewal" : "new";

    const sellerTenant = process.env.SPY_FORM_TENANT_ID || process.env.AXIS_FORM_TENANT_ID;
    const r = await abrirPedido({
      kind, tenantId: existente?.tenant_id ?? null, plan: q.plan, planId: q.plan.id, nome, telefone, email, documento, empresa,
      priceCents: q.priceCents, setupCents: q.setupCents, discountCents: q.discountCents, totalCents: q.totalCents, promo: q.promo, ip: clientIp(req),
      consent: { version: String(b.politicaVersao || process.env.CHECKOUT_POLICY_VERSION || "2026-11").slice(0, 40) },
      // Lead no CRM de quem vende, ja na hora do cadastro (quem desistiu do Pix tambem vira lead para follow-up).
      antes: async () => {
        if (!sellerTenant) return null;
        try {
          // Mesmo telefone/e-mail ja no sistema = so atualiza o lead; novo entra na etapa "proposta enviada".
          return (await upsertLead(db, sellerTenant, {
            name: nome, email, phone: telefone, company: empresa, cnpj: documento, source: "Checkout S.P.Y.", priority: "Alta", scoreIA: 80,
            value: q.totalCents / 100, papel: "proposta",
            nota: `Checkout: plano ${q.plan.name}, total ${brl(q.totalCents)}${q.promo ? `, promoção ${q.promo.label || q.promo.code}` : ""}. Gerou o Pix mas ainda não enviou o comprovante: fazer follow-up.`,
          })).id;
        } catch (e: any) { console.error("[checkout] lead:", e?.message); return null; }
      },
    }, cfg);
    if ("error" in r) return res.status(r.status).json({ error: r.error });
    if (r.novo) {
      await avisarEquipe("novo_lead", "info", `Novo lead no checkout: ${nome}`, `${nome} (${empresa}) gerou o Pix de ${brl(q.totalCents)} no checkout${existente ? " (e-mail que já tem acesso: renovação/reativação)" : ""}.`,
        [{ label: "Nome do lead", value: nome }, { label: "Empresa", value: empresa }, { label: "Plano / valor", value: `${q.plan.name} · ${brl(q.totalCents)}` }], telefone,
        `${publicAppUrl}/app/admin?tab=plans&sub=checkout`);
    }
    res.json(r.pedido);
  });

  // Renovacao pelo proprio cliente logado: Pix do plano atual da empresa dele (sem cupom, sem implantacao).
  router.post("/renewal-order", pubWrite, requireUser, async (req: any, res) => {
    if (!db) return res.status(503).json({ error: "Indisponível." });
    const { data: me } = await db.from("users").select("name,email,tenant_id,is_master,is_tenant_admin,active").eq("id", req.user.id).maybeSingle();
    if (!me?.tenant_id || !EMAIL_RE.test(String(me.email || ""))) return res.status(403).json({ error: "Seu usuário não está ligado a uma empresa." });
    if (me.active === false || (!me.is_master && !me.is_tenant_admin)) return res.status(403).json({ error: "Somente o administrador da empresa pode renovar a assinatura." });
    const cfg = await config();
    if (!cfg?.active || !cfg.pix_key) return res.status(503).json({ error: "O pagamento ainda não está disponível. Fale com a gente pelo WhatsApp." });
    const [{ data: sub }, { data: tenant }, { data: emp }] = await Promise.all([
      db.from("tenant_subscriptions").select("gateway,plan:subscription_plans(*)").eq("tenant_id", me.tenant_id).maybeSingle(),
      db.from("tenants").select("name").eq("id", me.tenant_id).maybeSingle(),
      db.from("app_settings").select("value").eq("tenant_id", me.tenant_id).eq("key", "empresa_dados").maybeSingle(),
    ]);
    const gw = String((sub as any)?.gateway || "").toLowerCase();
    if (gw && gw !== "manual") return res.status(409).json({ error: "Sua assinatura é cobrada automaticamente. Não é necessário pagar por aqui; para alterar a cobrança, fale com a gente pelo WhatsApp." });
    const plan: any = Array.isArray((sub as any)?.plan) ? (sub as any).plan[0] : (sub as any)?.plan;
    if (!plan) return res.status(400).json({ error: "Sua empresa ainda não tem um plano para renovar. Fale com a gente pelo WhatsApp." });
    const total = Math.max(0, Number(plan.price_cents) || 0);
    if (total < 100) return res.status(400).json({ error: "O plano da sua empresa não é cobrado por Pix. Fale com a gente pelo WhatsApp." });
    const dados: any = emp?.value || {};
    const r = await abrirPedido({
      kind: "renewal", tenantId: me.tenant_id, plan, planId: plan.id, nome: String(me.name || "Cliente").slice(0, 120), telefone: String(dados.telefone || "").slice(0, 30),
      email: String(me.email).toLowerCase(), documento: String(dados.cnpj || "").replace(/\D/g, ""), empresa: String(tenant?.name || dados.nome || "Empresa").slice(0, 160),
      priceCents: total, setupCents: 0, discountCents: 0, totalCents: total, promo: null, ip: clientIp(req),
    }, cfg);
    if ("error" in r) return res.status(r.status).json({ error: r.error });
    res.json({ ...r.pedido, planName: plan.name, empresa: tenant?.name ?? null });
  });

  router.get("/order/:token", pub, async (req, res) => {
    if (!db) return res.status(503).json({ error: "Indisponível." });
    const { data } = await db.from("checkout_orders").select("status,total_cents,plan_name,pix_payload,expires_at,nome,email,kind,acesso_email_ok,empresa").eq("token", String(req.params.token).slice(0, 80)).maybeSingle();
    if (!data) return res.status(404).json({ error: "Pedido não encontrado." });
    // Só 'pending' expira sozinho; 'awaiting_confirmation' espera a conferência da equipe.
    const expirado = data.status === "pending" && new Date(data.expires_at).getTime() < Date.now();
    res.json({ status: expirado ? "expired" : data.status, totalCents: data.total_cents, planName: data.plan_name, pixPayload: data.pix_payload, nome: data.nome, email: data.email, kind: data.kind, emailEnviado: data.acesso_email_ok ?? null, empresa: data.empresa });
  });

  // "Já paguei": guarda o comprovante, move o pedido para 'awaiting_confirmation' e avisa a equipe para conferir o Pix e confirmar.
  // A empresa so e criada na confirmacao (/admin/orders/:id/confirm) — exceto com CHECKOUT_AUTO_FULFILL=true.
  router.post("/order/:token/paid", pubWrite, async (req, res) => {
    if (!db) return res.status(503).json({ error: "Indisponível." });
    const { data: o } = await db.from("checkout_orders").select("*").eq("token", String(req.params.token).slice(0, 80)).maybeSingle();
    if (!o) return res.status(404).json({ error: "Pedido não encontrado." });
    if (o.status === "paid" || o.status === "awaiting_confirmation") return res.json({ status: o.status });
    if (o.status === "pending" && new Date(o.expires_at).getTime() < Date.now()) {
      await db.from("checkout_orders").update({ status: "expired" }).eq("id", o.id).eq("status", "pending");
      return res.status(410).json({ error: "Este Pix expirou. Volte e gere um novo. Se você já pagou, fale com a gente pelo WhatsApp." });
    }
    if (o.status !== "pending") return res.status(409).json({ error: "Este pedido não está mais aberto." });

    // Comprovante obrigatorio (imagem ou PDF, ate 3 MB), guardado em bucket privado; so o super admin ve, por link temporario.
    const c = req.body?.comprovante;
    const tipos: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
    if (!c || typeof c.data !== "string" || !tipos[c.type]) return res.status(400).json({ error: "Anexe o comprovante do Pix (foto ou PDF)." });
    const bytes = Buffer.from(c.data, "base64");
    if (bytes.length < 500) return res.status(400).json({ error: "Arquivo inválido. Anexe o comprovante do Pix." });
    if (bytes.length > 3 * 1024 * 1024) return res.status(400).json({ error: "O comprovante precisa ter até 3 MB." });
    const magic = bytes.subarray(0, 4).toString("hex");
    const okMagic = (c.type === "application/pdf" && bytes.subarray(0, 4).toString() === "%PDF") || (c.type === "image/png" && magic === "89504e47") ||
      (c.type === "image/jpeg" && magic.startsWith("ffd8ff")) || (c.type === "image/webp" && bytes.subarray(0, 4).toString() === "RIFF");
    if (!okMagic) return res.status(400).json({ error: "O arquivo não parece ser uma imagem ou PDF válido." });
    const path = `${o.id}/${Date.now()}.${tipos[c.type]}`;
    const up = await db.storage.from("checkout-comprovantes").upload(path, bytes, { contentType: c.type, upsert: false });
    if (up.error) { console.error("[checkout] comprovante:", up.error.message); return res.status(500).json({ error: "Não foi possível salvar o comprovante. Tente novamente." }); }

    const { data: movido } = await db.from("checkout_orders").update({ status: "awaiting_confirmation", informed_paid_at: new Date().toISOString(), comprovante_path: path })
      .eq("id", o.id).eq("status", "pending").select("id").maybeSingle();
    if (!movido) return res.json({ status: "awaiting_confirmation" }); // outro envio ganhou a corrida

    const resumo = [{ label: "Cliente", value: o.nome }, { label: "Empresa", value: o.empresa }, { label: "Plano / valor", value: `${o.plan_name} · ${brl(o.total_cents)}` }, { label: "E-mail", value: o.email }];
    if (!AUTO_FULFILL()) {
      await avisarEquipe("checkout_comprovante", "warning", `Comprovante recebido — confira o Pix: ${o.empresa}`,
        `Comprovante recebido — confira o Pix de ${brl(o.total_cents)} de ${o.nome} (${o.empresa}) e confirme no painel (Planos › Checkout). O acesso só é liberado depois da sua confirmação.`, resumo, o.telefone);
      return res.json({ status: "awaiting_confirmation" });
    }

    // Modo automatico (opt-in): comprovante enviado = venda feita. Se algo impedir, o pedido segue aguardando confirmacao manual.
    const out: { body?: any } = {};
    const cap: any = { status: () => cap, json: (b: any) => { out.body = b; return cap; } };
    await fulfill({ ...o, comprovante_path: path, status: "awaiting_confirmation" }, null, cap);
    const vendido = out.body?.ok === true;
    if (!vendido) {
      await avisarEquipe("checkout_comprovante", "warning", `Comprovante recebido, liberar manualmente: ${o.empresa}`,
        `${o.nome} (${o.empresa}) enviou o comprovante de ${brl(o.total_cents)}, mas a liberação automática falhou (${String(out.body?.error || "erro")}). Confira o Pix e confirme em Planos › Checkout.`, resumo, o.telefone);
    }
    res.json({ status: vendido ? "paid" : "awaiting_confirmation" });
  });

  // ── Cron (protegido por CRON_SECRET; o dono mapeia em vercel.json — ver supabase/migrations/20261108_cron_billing.sql.example) ──
  const sha = (v: string) => createHash("sha256").update(v).digest();
  function cronAuth(req: any, res: Response, next: NextFunction) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return res.status(503).json({ error: "CRON_SECRET não configurado." });
    const h = String(req.headers["authorization"] || "");
    const got = h.startsWith("Bearer ") ? h.slice(7) : String(req.headers["x-cron-secret"] || "");
    if (!got || !timingSafeEqual(sha(got), sha(secret))) return res.status(401).json({ error: "Não autorizado." });
    next();
  }

  /** Avisos de vencimento: D-5 (faltam ate 5 dias), D0 (venceu ha menos de 3 dias) e D+3 (venceu ha 3 dias ou mais). Uma vez por tenant+tipo+vencimento. */
  async function enviarAvisosVencimento() {
    const DAY = 86_400_000;
    const now = Date.now();
    const de = new Date(now - 10 * DAY).toISOString();
    const ate = new Date(now + 5 * DAY).toISOString();
    const subs: any[] = [];
    const campos = "tenant_id,status,gateway,current_period_end,trial_ends_at,plan:subscription_plans(name,price_cents)";
    for (const [col, status] of [["current_period_end", ["active", "past_due"]], ["trial_ends_at", ["trial"]]] as const) {
      for (let from = 0; from < 5000; from += 1000) {
        const { data, error } = await db!.from("tenant_subscriptions").select(campos).in("status", status as unknown as string[]).gte(col, de).lte(col, ate).order("tenant_id").range(from, from + 999);
        if (error) throw new Error(error.message);
        subs.push(...(data || []));
        if ((data || []).length < 1000) break;
      }
    }
    // Cobranca automatica (gateway) cuida de si; aqui so as assinaturas manuais/Pix.
    const candidatos = subs.filter((s) => !s.gateway || s.gateway === "manual").map((s) => {
      const due = new Date(s.status === "trial" ? s.trial_ends_at : s.current_period_end).getTime();
      const diff = due - now;
      const kind = diff > 0 ? "d-5" : -diff < 3 * DAY ? "d0" : "d+3";
      return { s, due: new Date(due).toISOString(), kind };
    });
    let enviados = 0, jaEnviados = 0, semDestinatario = 0, falhas = 0;
    const inicio = Date.now();
    for (let i = 0; i < candidatos.length; i += 200) {
      const lote = candidatos.slice(i, i + 200);
      const ids = [...new Set(lote.map((c) => c.s.tenant_id))];
      const [{ data: feitos }, { data: admins }] = await Promise.all([
        db!.from("billing_notices").select("tenant_id,kind,period_end").in("tenant_id", ids),
        db!.from("users").select("tenant_id,email,name,created_at").in("tenant_id", ids).eq("is_tenant_admin", true).eq("active", true).order("created_at"),
      ]);
      const feito = new Set((feitos || []).map((f: any) => `${f.tenant_id}|${f.kind}|${new Date(f.period_end).getTime()}`));
      const admin = new Map<string, any>();
      for (const a of admins || []) if (!admin.has((a as any).tenant_id) && EMAIL_RE.test(String((a as any).email || ""))) admin.set((a as any).tenant_id, a);
      for (const c of lote) {
        if (Date.now() - inicio > 45_000) return { enviados, jaEnviados, semDestinatario, falhas, parcial: true };
        if (feito.has(`${c.s.tenant_id}|${c.kind}|${new Date(c.due).getTime()}`)) { jaEnviados++; continue; }
        const dest = admin.get(c.s.tenant_id);
        if (!dest) { semDestinatario++; continue; }
        // Reserva o aviso ANTES de enviar (chave unica = sem duplicar mesmo com duas execucoes ao mesmo tempo); se o envio falhar, libera.
        const { error: insErr } = await db!.from("billing_notices").insert({ tenant_id: c.s.tenant_id, kind: c.kind, period_end: c.due, to_email: dest.email });
        if (insErr) { if (insErr.code === "23505") jaEnviados++; else { falhas++; console.error("[checkout] billing_notices:", insErr.message); } continue; }
        const plano = Array.isArray(c.s.plan) ? c.s.plan[0] : c.s.plan;
        const venc = new Date(c.due).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
        const copy = c.kind === "d-5" ? "cobranca_vence_em_breve" : c.kind === "d0" ? "cobranca_vence_hoje" : "cobranca_em_atraso";
        const titulo = c.kind === "d-5" ? `Sua assinatura do S.P.Y. vence em ${venc}` : c.kind === "d0" ? "Sua assinatura do S.P.Y. vence hoje" : "Pagamento da assinatura do S.P.Y. em atraso";
        try {
          const mail = notificationEmail({
            kind: c.kind === "d+3" ? "warning" : "info", copyKey: copy, title: titulo, description: titulo,
            details: [...(plano?.name ? [{ label: "Plano", value: plano.name }] : []), ...(plano?.price_cents ? [{ label: "Valor", value: brl(plano.price_cents) }] : []), { label: "Vencimento", value: venc }],
            primaryButton: { label: "Renovar / pagar", url: `${publicAppUrl}/checkout?renovar=1` }, name: dest.name,
          });
          await sendPlatformEmail({ to: dest.email, ...mail });
          enviados++;
        } catch (e: any) {
          falhas++; console.error("[checkout] aviso de vencimento:", e?.message);
          await db!.from("billing_notices").delete().eq("tenant_id", c.s.tenant_id).eq("kind", c.kind).eq("period_end", c.due);
        }
      }
    }
    return { enviados, jaEnviados, semDestinatario, falhas, parcial: false };
  }

  router.all("/cron/renewal-notices", cronAuth, async (req, res) => {
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
    if (!db) return res.status(503).json({ error: "Indisponível." });
    try { res.json({ ok: true, ...(await enviarAvisosVencimento()) }); }
    catch (e: any) { console.error("[checkout] renewal-notices:", e?.message); res.status(500).json({ error: "Erro ao enviar os avisos de vencimento." }); }
  });

  // Regua de inadimplencia: mesmo efeito do billing_tick() agendado no banco (trial/ativo -> em atraso -> suspenso).
  router.all("/cron/billing-tick", cronAuth, async (req, res) => {
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
    if (!db) return res.status(503).json({ error: "Indisponível." });
    const { data, error } = await db.rpc("billing_tick");
    if (error) { console.error("[checkout] billing_tick:", error.message); return res.status(500).json({ error: "Erro ao executar a régua de cobrança." }); }
    res.json({ ok: true, changed: data });
  });

  // ── Administracao (super admin) ────────────────────────────────────────────
  router.get("/admin", requireUser, requireMaster, async (_req, res) => {
    if (!db) return res.status(503).json({ error: "Service role não configurada." });
    const [cfg, promos, orders] = await Promise.all([
      config(),
      db.from("checkout_promos").select("*").order("created_at", { ascending: false }),
      db.from("checkout_orders").select("id,status,plan_name,nome,empresa,email,telefone,documento,total_cents,discount_cents,promo_code,created_at,informed_paid_at,paid_at,error,tenant_id,comprovante_path,kind,fulfilled_at,agentes_ok,agentes_erro,acesso_email_ok")
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
      single_plan_code: String(b.singlePlanCode || "").trim().toLowerCase() || null,
      list_price_cents: Math.max(0, Math.round(Number(b.listSetupCents || 0) + Number(b.listMonthlyCents || 0)) || Math.round(Number(b.listPriceCents) || 0)),
      offer_cents: Number(b.offerCents) >= 100 ? Math.round(Number(b.offerCents)) : null,
      updated_at: new Date().toISOString(),
    };
    if (row.active && (!row.pix_key || !row.receiver_name || !row.receiver_city)) {
      return res.status(400).json({ error: "Para ativar, preencha a chave Pix, o nome e a cidade do recebedor." });
    }
    const novos = { list_setup_cents: Math.max(0, Math.round(Number(b.listSetupCents) || 0)) || null, list_monthly_cents: Math.max(0, Math.round(Number(b.listMonthlyCents) || 0)) || null };
    let { error } = await db.from("checkout_config").upsert({ ...row, ...novos }, { onConflict: "id" });
    // Banco ainda sem as colunas do detalhamento (SQL pendente): salva o resto normalmente.
    if (error && /list_setup_cents|list_monthly_cents/.test(error.message || "")) ({ error } = await db.from("checkout_config").upsert(row, { onConflict: "id" }));
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

  router.get("/admin/orders/:id/comprovante", requireUser, requireMaster, async (req, res) => {
    if (!db) return res.status(503).json({ error: "Service role não configurada." });
    const { data: o } = await db.from("checkout_orders").select("comprovante_path").eq("id", req.params.id).maybeSingle();
    if (!o?.comprovante_path) return res.status(404).json({ error: "Sem comprovante neste pedido." });
    const { data, error } = await db.storage.from("checkout-comprovantes").createSignedUrl(o.comprovante_path, 300);
    if (error || !data?.signedUrl) return res.status(500).json({ error: "Não foi possível abrir o comprovante." });
    res.json({ url: data.signedUrl });
  });

  router.post("/admin/orders/:id/cancel", requireUser, requireMaster, async (req, res) => {
    if (!db) return res.status(503).json({ error: "Service role não configurada." });
    const { error } = await db.from("checkout_orders").update({ status: "canceled" }).eq("id", req.params.id).neq("status", "paid");
    if (error) return res.status(400).json({ error: "Erro ao cancelar." });
    res.json({ ok: true });
  });

  /** Confirmacao pela equipe depois de conferir o Pix: e aqui que a empresa e criada (ou a assinatura renovada). Tambem retoma pedido 'paid' que travou no meio. */
  router.post("/admin/orders/:id/confirm", requireUser, requireMaster, async (req: any, res) => {
    if (!db) return res.status(503).json({ error: "Service role não configurada." });
    const { data: o } = await db.from("checkout_orders").select("*").eq("id", req.params.id).maybeSingle();
    if (!o) return res.status(404).json({ error: "Pedido não encontrado." });
    if (o.status === "paid") {
      if (o.fulfilled_at !== null) return res.json({ ok: true, jaConfirmado: true, tenantId: o.tenant_id });
      return fulfill(o, req.user.id, res, { recover: true }); // pago mas nao concluido: retoma de onde parou
    }
    if (o.status === "canceled") return res.status(409).json({ error: "Pedido cancelado." });
    return fulfill(o, req.user.id, res);
  });

  return router;
}
