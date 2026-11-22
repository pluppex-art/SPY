// Pix "copia e cola" / QR estático (BR Code, EMV QRCPS-MPM) para cobrar uma fatura. Sem serviço externo.
// A chave Pix é da empresa; o valor e o identificador vão dentro do código. Nada aqui consulta banco nenhum.
import { validarCnpj } from "./apisBrasil.js";

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function validarCpf(v: unknown): string | null {
  const d = texto(v).replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return null;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]) ? d : null;
}

export type ChavePix = { tipo: "cpf" | "cnpj" | "telefone" | "email" | "aleatoria"; chave: string };

/** Aceita CPF, CNPJ, telefone com +55, e-mail ou chave aleatória (UUID); devolve a chave no formato que o Pix usa, ou null. */
export function normalizarChavePix(v: unknown): ChavePix | null {
  const s = texto(v);
  if (!s) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return { tipo: "aleatoria", chave: s.toLowerCase() };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 77) return { tipo: "email", chave: s.toLowerCase() };
  if (s.startsWith("+")) { const d = s.replace(/\D/g, ""); return d.length >= 12 && d.length <= 13 ? { tipo: "telefone", chave: `+${d}` } : null; }
  const cpf = validarCpf(s); if (cpf) return { tipo: "cpf", chave: cpf };
  const cnpj = validarCnpj(s); if (cnpj) return { tipo: "cnpj", chave: cnpj };
  return null;
}

/** CRC16/CCITT-FALSE (poly 0x1021, início 0xFFFF), 4 dígitos hexadecimais maiúsculos. */
export function crc16(s: string): string {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const campo = (id: string, valor: string) => `${id}${String(valor.length).padStart(2, "0")}${valor}`;
/** O Pix só aceita ASCII sem acento: tira acentos e caracteres fora de letras, números, espaço e pontuação simples. */
export const semAcento = (v: string, max: number) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .,\-]/g, "").trim().toUpperCase().slice(0, max);

export function montarBrCode(p: { chave: string; nome: string; cidade: string; valor?: number; txid?: string }): string {
  const conta = campo("00", "br.gov.bcb.pix") + campo("01", p.chave);
  const txid = (p.txid || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const valor = Number(p.valor);
  const corpo =
    campo("00", "01") + campo("01", "11") + campo("26", conta) + campo("52", "0000") + campo("53", "986") +
    (Number.isFinite(valor) && valor > 0 ? campo("54", valor.toFixed(2)) : "") +
    campo("58", "BR") + campo("59", semAcento(p.nome, 25) || "RECEBEDOR") + campo("60", semAcento(p.cidade, 15) || "BRASIL") +
    campo("62", campo("05", txid));
  return `${corpo}6304${crc16(`${corpo}6304`)}`;
}
