// Cobrança recorrente no cartão pelo Asaas (mensalidade do S.P.Y.).
//  - O cartão é digitado SÓ na página do Asaas (checkout hospedado); o S.P.Y. nunca recebe os dados.
//  - A implantação e o primeiro mês continuam no Pix do checkout; a primeira cobrança no cartão é no fim do período pago.
//  - Sem fidelidade: o cliente cancela quando quiser e usa até o fim do que já pagou.
//  - Sem ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN no servidor, nada disso aparece.
// Como configurar: docs/asaas-recorrencia.md.

import axios from "axios";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cicloValido, itensGravados, precoDoCiclo, reprecificar, somaItens, type ItemVenda } from "../src/lib/catalogoSpy.js";

const sandbox = (env: NodeJS.ProcessEnv) => env.ASAAS_ENV === "sandbox";
export const asaasBase = (env: NodeJS.ProcessEnv = process.env) => (sandbox(env) ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3");

export interface AssinaturaAsaas { id: string; customer?: string | null; checkoutSession?: string | null; externalReference?: string | null; deleted?: boolean }
export interface AsaasApi {
  criarCheckout(corpo: Record<string, unknown>): Promise<{ id: string; link: string }>;
  assinatura(id: string): Promise<AssinaturaAsaas>;
  cancelar(id: string): Promise<void>;
  /** Vale também para a cobrança já gerada e ainda não paga. */
  atualizarValor(id: string, valorCents: number): Promise<void>;
}

/** null = recorrência desligada. Exige a chave E o token do webhook: sem o aviso do Asaas o pagamento não seria baixado. */
export function asaasDoAmbiente(env: NodeJS.ProcessEnv = process.env): AsaasApi | null {
  if (!env.ASAAS_API_KEY || !env.ASAAS_WEBHOOK_TOKEN) return null;
  const http = axios.create({ baseURL: asaasBase(env), timeout: 20_000, headers: { access_token: env.ASAAS_API_KEY, "Content-Type": "application/json", "User-Agent": "spy-crm" } });
  const caminho = (id: string) => `/subscriptions/${encodeURIComponent(id)}`;
  return {
    async criarCheckout(corpo) {
      const { data } = await http.post("/checkouts", corpo);
      const link = data?.link || `https://${sandbox(env) ? "sandbox." : ""}asaas.com/checkoutSession/show?id=${encodeURIComponent(String(data?.id))}`;
      if (!data?.id) throw new Error("Asaas não devolveu o checkout.");
      return { id: String(data.id), link: String(link) };
    },
    async assinatura(id) { return (await http.get(caminho(id))).data as AssinaturaAsaas; },
    async cancelar(id) { await http.delete(caminho(id)); },
    async atualizarValor(id, valorCents) { await http.put(caminho(id), { value: valorCents / 100, updatePendingPayments: true }); },
  };
}

/** Guarda, por empresa, os checkouts abertos para reconhecer a assinatura quando o aviso do Asaas chegar. */
const CHAVE = "recorrencia_checkout";
const LOGO = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="; // o Asaas pede uma imagem no item

export class ErroDeRecorrencia extends Error { constructor(msg: string, public status = 409) { super(msg); } }

const diaEmSaoPaulo = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export function createRecorrencia(deps: { db: SupabaseClient; asaas: AsaasApi | null; publicAppUrl: string; catalogo: () => Promise<ItemVenda[]> }) {
  const { db, asaas } = deps;

  async function carregar(tenantId: string) {
    const { data } = await db.from("tenant_subscriptions").select("status,gateway,gateway_subscription_id,ciclo,itens,current_period_end,trial_ends_at,plan:subscription_plans(*)").eq("tenant_id", tenantId).maybeSingle();
    const sub: any = data;
    const plan: any = Array.isArray(sub?.plan) ? sub.plan[0] : sub?.plan;
    return { sub, plan };
  }

  async function mensalidade(sub: any, plan: any) {
    const itens = reprecificar(itensGravados(sub.itens), await deps.catalogo());
    return precoDoCiclo(Math.max(0, Number(plan.price_cents) || 0), "monthly") + somaItens(itens, "monthly").recorrente;
  }

  /** O que a tela mostra: se existe, se está ligada, quanto e quando seria a primeira cobrança. */
  async function estado(tenantId: string) {
    const base = { disponivel: !!asaas, ativa: false, podeAtivar: false, motivo: null as string | null, valorCents: 0, primeiraCobranca: null as string | null };
    if (!asaas) return base;
    const { sub, plan } = await carregar(tenantId);
    if (!sub || !plan) return { ...base, motivo: "Sua empresa ainda não tem uma assinatura cadastrada. Fale com a gente." };
    const valorCents = await mensalidade(sub, plan);
    const gateway = String(sub.gateway || "manual").toLowerCase();
    if (gateway === "asaas" && sub.gateway_subscription_id) return { ...base, ativa: true, valorCents };
    const nao = (motivo: string) => ({ ...base, valorCents, motivo });
    if (gateway !== "manual") return nao("Sua cobrança é feita por outro meio. Fale com a gente para trocar.");
    if (cicloValido(sub.ciclo) === "yearly") return nao("A cobrança automática vale para o plano mensal. O seu é anual.");
    if (!["active", "trial", "past_due"].includes(sub.status)) return nao("Sua assinatura está suspensa ou cancelada. Renove primeiro.");
    if (valorCents < 100) return nao("Seu plano não tem mensalidade a cobrar.");
    const fim = new Date((sub.status === "trial" ? sub.trial_ends_at : sub.current_period_end) || 0).getTime();
    return { ...base, podeAtivar: true, valorCents, primeiraCobranca: diaEmSaoPaulo(new Date(Math.max(Date.now(), fim || 0))) };
  }

  /** Abre a página do Asaas para o cliente digitar o cartão. `voltar` é um caminho do próprio S.P.Y. */
  async function iniciar(tenantId: string, voltar: string): Promise<{ url: string }> {
    const e = await estado(tenantId);
    if (!asaas) throw new ErroDeRecorrencia("A cobrança automática ainda não está disponível.", 503);
    if (e.ativa) throw new ErroDeRecorrencia("A cobrança automática já está ligada.");
    if (!e.podeAtivar) throw new ErroDeRecorrencia(e.motivo || "Não foi possível ligar a cobrança automática.");
    const { plan } = await carregar(tenantId);
    const url = `${deps.publicAppUrl}${voltar}`;
    let criado: { id: string; link: string };
    try {
      criado = await asaas.criarCheckout({
        billingTypes: ["CREDIT_CARD"], chargeTypes: ["RECURRENT"], minutesToExpire: 60, externalReference: tenantId,
        callback: { successUrl: `${url}${voltar.includes("?") ? "&" : "?"}cartao=ok`, cancelUrl: url, expiredUrl: url },
        items: [{ name: "Assinatura S.P.Y.", description: `Mensalidade do plano de ${plan.name}`.slice(0, 150), quantity: 1, value: e.valorCents / 100, imageBase64: LOGO }],
        subscription: { cycle: "MONTHLY", nextDueDate: e.primeiraCobranca },
      });
    } catch (err: any) {
      console.error("[recorrencia] checkout:", err?.response?.data || err?.message);
      throw new ErroDeRecorrencia("Não foi possível abrir a página do cartão. Tente de novo ou fale com a gente.", 502);
    }
    const { data: antes } = await db.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", CHAVE).maybeSingle();
    const checkouts = [...(((antes as any)?.value?.checkouts as string[]) || []), criado.id].slice(-5);
    const { error } = await db.from("app_settings").upsert({ tenant_id: tenantId, key: CHAVE, value: { checkouts, em: new Date().toISOString() } }, { onConflict: "tenant_id,key" });
    if (error) throw new ErroDeRecorrencia("Não foi possível iniciar a cobrança automática.", 500);
    return { url: criado.link };
  }

  async function cancelar(tenantId: string, por: string) {
    if (!asaas) throw new ErroDeRecorrencia("A cobrança automática não está disponível. Fale com a gente.", 503);
    const { sub } = await carregar(tenantId);
    const id = sub?.gateway === "asaas" ? String(sub.gateway_subscription_id || "") : "";
    if (!id) throw new ErroDeRecorrencia("Não há cobrança automática ligada.");
    // Desliga aqui antes: o aviso de "assinatura removida" do Asaas não encontra mais a empresa e não bloqueia ninguém.
    const trocar = (gateway: string, gid: string | null) => db.from("tenant_subscriptions").update({ gateway, gateway_subscription_id: gid, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId);
    const { error } = await trocar("manual", null);
    if (error) throw new ErroDeRecorrencia("Não foi possível cancelar. Tente de novo.", 500);
    try { await asaas.cancelar(id); }
    catch (err: any) {
      console.error("[recorrencia] cancelar:", err?.response?.data || err?.message);
      await trocar("asaas", id);
      throw new ErroDeRecorrencia("O Asaas não confirmou o cancelamento. Tente de novo ou fale com a gente.", 502);
    }
    await db.from("billing_events").insert({ tenant_id: tenantId, type: "gateway_webhook", gateway_ref: `cancel:${id}`, payload: { action: "recorrencia_cancelada", by: por } });
  }

  /** Depois de uma compra: leva o novo valor para a cobrança automática. null = não há cobrança automática ligada. */
  async function atualizarValor(tenantId: string): Promise<{ ok: boolean; valorCents: number } | null> {
    const { sub, plan } = await carregar(tenantId);
    if (!sub || !plan || sub.gateway !== "asaas" || !sub.gateway_subscription_id) return null;
    const valorCents = await mensalidade(sub, plan);
    if (!asaas) return { ok: false, valorCents };
    try { await asaas.atualizarValor(String(sub.gateway_subscription_id), valorCents); return { ok: true, valorCents }; }
    catch (err: any) { console.error("[recorrencia] valor:", err?.response?.data || err?.message); return { ok: false, valorCents }; }
  }

  return { estado, iniciar, cancelar, atualizarValor };
}

/**
 * Aviso do Asaas sobre uma assinatura que o S.P.Y. ainda não conhece: se ela nasceu de um checkout nosso, liga à empresa.
 * Uma segunda assinatura para quem já tem uma é cancelada, para não cobrar em dobro. Erro de rede sobe (o Asaas reenvia).
 */
export async function vincularAssinaturaAsaas(db: SupabaseClient, asaas: AsaasApi, subId: string): Promise<boolean> {
  const a = await asaas.assinatura(subId);
  if (!a || a.deleted) return false;
  const { data: abertos } = await db.from("app_settings").select("tenant_id,value").eq("key", CHAVE);
  const dono: any = (abertos || []).find((r: any) => !!a.checkoutSession && r.value?.checkouts?.includes(a.checkoutSession))
    ?? (abertos || []).find((r: any) => r.tenant_id === a.externalReference);
  if (!dono) return false;
  const { data } = await db.from("tenant_subscriptions").select("gateway,gateway_subscription_id").eq("tenant_id", dono.tenant_id).maybeSingle();
  const sub: any = data;
  if (!sub) return false;
  if (sub.gateway === "asaas" && sub.gateway_subscription_id && sub.gateway_subscription_id !== subId) {
    console.error(`[recorrencia] segunda assinatura ${subId} para a empresa ${dono.tenant_id}: cancelando`);
    await asaas.cancelar(subId);
    return false;
  }
  const { error } = await db.from("tenant_subscriptions").update({ gateway: "asaas", gateway_subscription_id: subId, gateway_customer_id: a.customer ?? null, updated_at: new Date().toISOString() }).eq("tenant_id", dono.tenant_id);
  if (error) throw new Error(error.message);
  return true;
}
