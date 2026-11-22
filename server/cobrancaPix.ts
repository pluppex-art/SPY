// Pix dinâmico da fatura pelo Mercado Pago + baixa automática quando o cliente paga.
// Fluxo: ao gerar o PDF de uma fatura em aberto, se a empresa tem o Mercado Pago conectado, criamos uma cobrança Pix ligada ao
// lançamento (external_reference "fin:<id>"). Quando o cliente paga, o Mercado Pago avisa o webhook assinado; o pagamento é
// SEMPRE conferido direto na API do Mercado Pago (o corpo do aviso não é confiável) e só então o lançamento vira Pago.
import axios from "axios";
import type express from "express";
import { assinar, conferirAssinatura } from "./agendamentoPuro.js";
import { round2 } from "../src/lib/dinheiro.js";

const MP = "https://api.mercadopago.com";
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

export const refDoLancamento = (id: string) => `fin:${id}`;
export const idDaRef = (ref: unknown): string | null => { const m = /^fin:([\w-]{6,80})$/.exec(texto(ref)); return m ? m[1] : null; };

/** Dia (AAAA-MM-DD) no horário de Brasília de um instante ISO; vazio se ilegível. */
export function diaBrasilia(iso: unknown): string {
  const t = Date.parse(texto(iso));
  return Number.isFinite(t) ? new Date(t - 3 * 3600_000).toISOString().slice(0, 10) : "";
}

/** Validade do Pix: até o dia seguinte ao vencimento, mas no mínimo 3 dias a partir de agora e no máximo 30 (limite do Mercado Pago). */
export function expiracaoPix(vencimentoISO: string, agora = Date.now()): string {
  const venc = Date.parse(`${vencimentoISO.slice(0, 10)}T23:59:59-03:00`) + 24 * 3600_000;
  const t = Math.min(Math.max(Number.isFinite(venc) ? venc : 0, agora + 3 * 24 * 3600_000), agora + 30 * 24 * 3600_000);
  return new Date(t - 3 * 3600_000).toISOString().replace("Z", "-03:00"); // horário de Brasília, como o Mercado Pago espera
}

export function corpoPagamentoPix(p: { valor: number; descricao: string; lancamentoId: string; emailPagador: string; nomePagador: string; vencimentoISO: string; urlNotificacao: string }) {
  const [nome, ...resto] = p.nomePagador.split(/\s+/).filter(Boolean);
  return {
    transaction_amount: round2(p.valor), description: p.descricao.slice(0, 200) || "Fatura", payment_method_id: "pix",
    external_reference: refDoLancamento(p.lancamentoId), date_of_expiration: expiracaoPix(p.vencimentoISO), notification_url: p.urlNotificacao,
    payer: { email: p.emailPagador, ...(nome ? { first_name: nome } : {}), ...(resto.length ? { last_name: resto.join(" ") } : {}) },
  };
}

export type DecisaoBaixa =
  | { acao: "baixar"; patch: { status: "Pago"; payment_method: "Pix"; data_pagamento: string } }
  | { acao: "ignorar"; motivo: string }
  | { acao: "divergente"; motivo: string };

/** O que fazer com um pagamento do Mercado Pago em relação ao lançamento. Nunca baixa a menos do que o devido. */
export function decidirBaixa(lancamento: any, pagamento: any, hojeISO: string): DecisaoBaixa {
  if (!lancamento) return { acao: "ignorar", motivo: "lançamento não encontrado" };
  if (pagamento?.status !== "approved") return { acao: "ignorar", motivo: `pagamento ${texto(pagamento?.status) || "sem status"}` };
  if (lancamento.type !== "Receber") return { acao: "ignorar", motivo: "não é uma receita" };
  if (lancamento.status === "Pago") return { acao: "ignorar", motivo: "já estava pago" };
  if (lancamento.status === "Cancelado") return { acao: "ignorar", motivo: "lançamento cancelado" };
  const devido = Number(lancamento.value) || 0, pago = Number(pagamento?.transaction_amount) || 0;
  if (pago + 0.01 < devido) return { acao: "divergente", motivo: `recebido R$ ${pago.toFixed(2)}, devido R$ ${devido.toFixed(2)}` };
  return { acao: "baixar", patch: { status: "Pago", payment_method: "Pix", data_pagamento: diaBrasilia(pagamento?.date_approved) || hojeISO } };
}

type Deps = { supabaseService: any; segredo: string; appUrl: string };

export function criarCobrancaPix(deps: Deps) {
  const chave = `fatura-pix:${deps.segredo}`;
  const tokenMp = async (tenantId: string): Promise<string | null> => {
    const { data } = (await deps.supabaseService?.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "integracoes_payments").maybeSingle()) ?? { data: null };
    const t = data?.value?.mercadoPago?.accessToken;
    return typeof t === "string" && t.trim() ? t.trim() : null;
  };

  return {
    tokenMp,
    /** Pix copia e cola dinâmico da fatura (Mercado Pago). null = não dá (sem Mercado Pago, sem e-mail do pagador ou falha) e vale o Pix estático. */
    async criarPix(tenantId: string, l: { id: string; valor: number; descricao: string; vencimentoISO: string; emailPagador: string; nomePagador: string }): Promise<string | null> {
      if (!deps.segredo || !l.emailPagador || !(l.valor > 0)) return null;
      const token = await tokenMp(tenantId);
      if (!token) return null;
      try {
        const corpo = corpoPagamentoPix({ ...l, lancamentoId: l.id, urlNotificacao: `${deps.appUrl}/api/financeiro/mp-webhook/${tenantId}?t=${assinar(tenantId, chave)}` });
        // Mesma fatura e mesmo valor = mesma cobrança (o Mercado Pago devolve a que já existe), então abrir o PDF de novo não duplica.
        const { data } = await axios.post(`${MP}/v1/payments`, corpo, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Idempotency-Key": `fatura-${l.id}-${Math.round(l.valor * 100)}` }, timeout: 15000,
        });
        const qr = data?.point_of_interaction?.transaction_data?.qr_code;
        return typeof qr === "string" && qr.length > 20 ? qr : null;
      } catch (e: any) {
        console.error("[fatura-pix] Mercado Pago:", e?.response?.data?.message || e?.message);
        return null;
      }
    },
    registrar(app: express.Express) {
      const webhook: express.RequestHandler = async (req: any, res) => {
        res.status(200); // o Mercado Pago só precisa de um 200; o tratamento é interno
        try {
          const tenantId = texto(req.params.tenantId);
          if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !conferirAssinatura(tenantId, texto(req.query.t), chave)) return res.send("ok");
          const idPag = texto(req.query["data.id"] ?? req.query.id ?? req.body?.data?.id ?? req.body?.id);
          if (!/^\d{4,20}$/.test(idPag)) return res.send("ok");
          const token = await tokenMp(tenantId);
          if (!token) return res.send("ok");
          const { data: pag } = await axios.get(`${MP}/v1/payments/${idPag}`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }).catch(() => ({ data: null }));
          const lancId = idDaRef(pag?.external_reference);
          if (!pag || !lancId) return res.send("ok"); // não é de fatura (pode ser do agendamento)
          const { data: lanc } = await deps.supabaseService.from("finance_entries").select("id, type, status, value, tenant_id").eq("id", lancId).eq("tenant_id", tenantId).maybeSingle();
          const d = decidirBaixa(lanc, pag, new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10));
          if (d.acao === "divergente") { console.warn("[fatura-pix] pagamento divergente", JSON.stringify({ tenant: tenantId, lancamento: lancId, pagamento: idPag, motivo: d.motivo })); return res.send("ok"); }
          if (d.acao !== "baixar") return res.send("ok");
          const { error } = await deps.supabaseService.from("finance_entries").update(d.patch).eq("id", lancId).eq("tenant_id", tenantId).neq("status", "Pago");
          if (error) console.error("[fatura-pix] não foi possível baixar", JSON.stringify({ tenant: tenantId, lancamento: lancId, erro: error.message }));
          else console.info("[fatura-pix] baixa automática", JSON.stringify({ tenant: tenantId, lancamento: lancId, pagamento: idPag }));
          return res.send("ok");
        } catch (e: any) { console.error("[fatura-pix] webhook:", e?.message); return res.send("ok"); }
      };
      app.post("/api/financeiro/mp-webhook/:tenantId", webhook);
      app.get("/api/financeiro/mp-webhook/:tenantId", webhook);
    },
  };
}
