// Modelos de recibo/fatura: o SPY traz um modelo padrão e cada empresa cria os seus (cor, logo, títulos, texto do recibo com
// variáveis, observações) e escolhe um como PRINCIPAL. É um modelo ESTRUTURADO (nada de HTML/código livre): tudo que chega do
// navegador passa por sanitizarModelo antes de ser guardado ou usado.

export type ModeloRecibo = {
  id: string; nome: string; cor: string; logo: string;
  tituloRecibo: string; tituloFatura: string;
  /** Texto do corpo, com variáveis {{cliente}}, {{valor}}, {{valor_extenso}}… (vazio = sem parágrafo). */
  abertura: string;
  observacoes: string;
  mostrar: { emitente: boolean; documentoCliente: boolean; detalhes: boolean; formaPagamento: boolean; assinatura: boolean; pix: boolean };
};

export const MODELO_PADRAO: ModeloRecibo = {
  id: "padrao", nome: "Padrão do SPY", cor: "#2563eb", logo: "", tituloRecibo: "RECIBO", tituloFatura: "FATURA",
  abertura: "", observacoes: "",
  mostrar: { emitente: true, documentoCliente: true, detalhes: true, formaPagamento: true, assinatura: false, pix: true },
};

export const VARIAVEIS = [
  "cliente", "cliente_documento", "valor", "valor_extenso", "descricao", "data_pagamento", "vencimento", "forma_pagamento",
  "emitente", "emitente_documento", "numero", "hoje",
] as const;

export const MAX_MODELOS = 20;
export const MAX_LOGO_BYTES = 250_000;

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\u0000/g, "").trim().slice(0, max) : "");
const bool = (v: unknown, padrao: boolean) => (typeof v === "boolean" ? v : padrao);

/** Logo só como imagem PNG/JPEG em data URL e de tamanho limitado; qualquer outra coisa vira "sem logo". */
export function logoValida(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s)) return "";
  return Math.floor((s.length * 3) / 4) <= MAX_LOGO_BYTES ? s : "";
}

export function sanitizarModelo(m: any, idFallback = "modelo"): ModeloRecibo {
  const id = texto(m?.id, 40).replace(/[^\w-]/g, "") || idFallback;
  const cor = /^#[0-9a-fA-F]{6}$/.test(texto(m?.cor, 7)) ? texto(m?.cor, 7) : MODELO_PADRAO.cor;
  const mo = m?.mostrar ?? {};
  const P = MODELO_PADRAO.mostrar;
  return {
    id, nome: texto(m?.nome, 60) || "Modelo sem nome", cor, logo: logoValida(m?.logo),
    tituloRecibo: texto(m?.tituloRecibo, 40) || "RECIBO", tituloFatura: texto(m?.tituloFatura, 40) || "FATURA",
    abertura: texto(m?.abertura, 800), observacoes: texto(m?.observacoes, 800),
    mostrar: { emitente: bool(mo.emitente, P.emitente), documentoCliente: bool(mo.documentoCliente, P.documentoCliente), detalhes: bool(mo.detalhes, P.detalhes), formaPagamento: bool(mo.formaPagamento, P.formaPagamento), assinatura: bool(mo.assinatura, P.assinatura), pix: bool(mo.pix, P.pix) },
  };
}

/** Lista de modelos + principal vindos do navegador → o que pode ser guardado (sem o padrão, que é fixo no código). */
export function sanitizarConfig(b: any): { modelos: ModeloRecibo[]; principalId: string } {
  const vistos = new Set<string>(["padrao"]);
  const modelos: ModeloRecibo[] = [];
  for (const [i, m] of (Array.isArray(b?.modelos) ? b.modelos : []).slice(0, MAX_MODELOS).entries()) {
    const s = sanitizarModelo(m, `modelo-${i + 1}`);
    if (vistos.has(s.id)) continue; // id repetido ou tentando passar por "padrao"
    vistos.add(s.id); modelos.push(s);
  }
  const principalId = texto(b?.principalId, 40);
  return { modelos, principalId: principalId === "padrao" || modelos.some((x) => x.id === principalId) ? principalId : "padrao" };
}

export function escolherModelo(cfg: { modelos?: unknown; principalId?: unknown } | null | undefined, pedidoId?: string | null): ModeloRecibo {
  const { modelos } = sanitizarConfig({ modelos: cfg?.modelos });
  const alvo = pedidoId || (typeof cfg?.principalId === "string" ? cfg.principalId : "padrao");
  return modelos.find((m) => m.id === alvo) ?? MODELO_PADRAO;
}

// ── Valor por extenso (português do Brasil), até R$ 999.999.999.999,99 ───────────────────────
const U = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const D = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const C = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate99(n: number): string { return n < 20 ? U[n] : D[Math.floor(n / 10)] + (n % 10 ? ` e ${U[n % 10]}` : ""); }
function ate999(n: number): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100), r = n % 100;
  return [c ? C[c] : "", r ? ate99(r) : ""].filter(Boolean).join(" e ");
}

export function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  const grupos: [number, string, string][] = [[Math.floor(n / 1e9) % 1000, "bilhão", "bilhões"], [Math.floor(n / 1e6) % 1000, "milhão", "milhões"], [Math.floor(n / 1e3) % 1000, "mil", "mil"], [n % 1000, "", ""]];
  const partes: { v: number; t: string }[] = [];
  for (const [v, s, p] of grupos) {
    if (!v) continue;
    const t = s === "mil" ? (v === 1 ? "mil" : `${ate999(v)} mil`) : s ? `${ate999(v)} ${v === 1 ? s : p}` : ate999(v);
    partes.push({ v, t });
  }
  return partes.reduce((acc, p, i) => {
    if (i === 0) return p.t;
    const ultimo = i === partes.length - 1;
    return acc + (ultimo ? (p.v < 100 || p.v % 100 === 0 ? " e " : " ") : ", ") + p.t;
  }, "");
}

export function valorPorExtenso(valor: number): string {
  const centavosTotal = Math.round(Math.abs(Number(valor) || 0) * 100);
  if (centavosTotal >= 1e14) return "";
  const reais = Math.floor(centavosTotal / 100), cent = centavosTotal % 100;
  const parteReais = reais
    ? `${inteiroPorExtenso(reais)}${reais % 1e6 === 0 ? " de" : ""} ${reais === 1 ? "real" : "reais"}`
    : "";
  const parteCent = cent ? `${inteiroPorExtenso(cent)} ${cent === 1 ? "centavo" : "centavos"}` : "";
  return [parteReais, parteCent].filter(Boolean).join(" e ") || "zero real";
}

/** Troca {{variavel}} pelo valor; variável desconhecida fica como foi escrita (para a pessoa notar o erro de digitação). */
export function aplicarVariaveis(modelo: string, dados: Record<string, string>): string {
  return modelo.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (inteiro, nome: string) => (Object.prototype.hasOwnProperty.call(dados, nome.toLowerCase()) ? dados[nome.toLowerCase()] : inteiro));
}
