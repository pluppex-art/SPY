/**
 * Validação e normalização dos valores gravados pelo nó "Salvar dados" do chatbot na implementação.
 * Usa os tipos/opções do MESMO formulário de CRM > Implementações (implementationForm.ts), então
 * campo novo lá vale aqui sem mudar nada.
 */
import { coerceFieldValue, type ImplField } from "../implementationForm.js";
import { isValidCnpj, onlyDigits } from "../brLookup.js";

export const norm = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_IDS = new Set(["resp_whatsapp", "whats_numero"]);
const EMAIL_IDS = new Set(["resp_email", "email_remetente"]);

/** Telefone BR → só dígitos com DDI (ex.: 5563999998888). Rejeita o que não parece telefone. */
export function normalizePhone(raw: string): string | null {
  let d = onlyDigits(raw);
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (d.length === 12 || d.length === 13) return d.startsWith("55") ? d : null;
  return null;
}

/** Faixa de colaboradores a partir de um número solto ("somos 30"). */
export function bandForCount(n: number): string {
  if (n <= 5) return "1–5";
  if (n <= 20) return "6–20";
  if (n <= 50) return "21–50";
  if (n <= 200) return "51–200";
  return "200+";
}

const bandMax = (band: string) => ({ "1–5": 5, "6–20": 20, "21–50": 50, "51–200": 200, "200+": Infinity } as Record<string, number>)[band] ?? Infinity;

export type ValidateResult = { ok: true; value: any } | { ok: false; reason: string };

/** Valida e normaliza UM valor para o campo. Vazio nunca chega aqui (o motor trata "limpar" à parte). */
export function validateField(field: ImplField, raw: unknown): ValidateResult {
  if (field.id === "faixa_colaboradores") {
    const n = Number(String(raw).replace(/\D/g, ""));
    if (/^\s*\d+\s*(pessoas|colaboradores|funcionarios|funcionários)?\s*$/i.test(String(raw)) && n > 0) return { ok: true, value: bandForCount(n) };
    const s = String(raw).replace(/[-–—]/g, "–").replace(/\s/g, "");
    const opt = field.options?.find((o) => norm(o) === norm(s) || norm(o).replace(/[^0-9+]/g, "") === norm(s).replace(/[^0-9+]/g, ""));
    if (opt) return { ok: true, value: opt };
  }
  const coerced = coerceFieldValue(field, raw);
  if (coerced.ok === false) return { ok: false, reason: coerced.reason };
  const v = coerced.value;
  if (v === undefined || typeof v !== "string") return { ok: true, value: v };

  if (field.id === "cnpj") {
    if (!isValidCnpj(v)) return { ok: false, reason: "Esse CNPJ não parece válido (14 dígitos com os dígitos verificadores corretos). Pode conferir?" };
    const d = onlyDigits(v);
    return { ok: true, value: `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` };
  }
  if (field.id === "cep") {
    const d = onlyDigits(v);
    if (d.length !== 8) return { ok: false, reason: "O CEP precisa ter 8 dígitos (ex.: 77000-000)." };
    return { ok: true, value: `${d.slice(0, 5)}-${d.slice(5)}` };
  }
  if (PHONE_IDS.has(field.id)) {
    const p = normalizePhone(v);
    return p ? { ok: true, value: p } : { ok: false, reason: "Esse telefone não parece válido. Informe com DDD (ex.: 63 99999-8888)." };
  }
  if (EMAIL_IDS.has(field.id)) {
    return EMAIL_RE.test(v) ? { ok: true, value: v.toLowerCase() } : { ok: false, reason: "Esse e-mail não parece válido (ex.: nome@empresa.com)." };
  }
  if (field.id === "tec_contato") {
    if (EMAIL_RE.test(v)) return { ok: true, value: v.toLowerCase() };
    const p = normalizePhone(v);
    return p ? { ok: true, value: p } : { ok: false, reason: "Informe um telefone com DDD ou um e-mail válido." };
  }
  if (field.id === "qtd_usuarios") {
    const m = /\d+/.exec(v);
    const n = m ? Number(m[0]) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > 5000) return { ok: false, reason: "Informe a quantidade de usuários como um número (ex.: 5)." };
    return { ok: true, value: String(n) };
  }
  if (field.id === "meta_mensal") {
    if (!/\d/.test(v)) return { ok: false, reason: "Informe a meta como valor (ex.: R$ 50.000)." };
  }
  if (field.id === "dominio") {
    const host = v.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return { ok: false, reason: "Esse domínio não parece válido (ex.: minhaempresa.com.br)." };
    return { ok: true, value: host };
  }
  if (field.id === "meta_pixel_id" || field.id === "meta_conta_id" || field.id === "maxdata_id") {
    if (/senha|token|password/i.test(v)) return { ok: false, reason: "Não registramos senha nem token aqui — só o identificador numérico." };
    if (!/\d/.test(v)) return { ok: false, reason: "Esse identificador costuma ser numérico. Pode conferir?" };
  }
  if (/(senha|password|token de acesso)\s*[:=]/i.test(v)) {
    return { ok: false, reason: "Não registramos senhas ou tokens no formulário. Acesso é concedido na própria plataforma." };
  }
  return { ok: true, value: v };
}
