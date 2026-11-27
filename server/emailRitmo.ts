/** Ritmo do disparo de marketing e o que fazer quando um envio não sai. Funções puras, sem banco. */

/** Teto padrão por hora no SMTP próprio da empresa: hospedagem compartilhada segura ou bloqueia rajadas. */
export const POR_HORA_PADRAO = 200;

export function lerPorHora(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 5_000) : POR_HORA_PADRAO;
}

export type TipoDeFalha = "limite" | "temporaria" | "definitiva";

/**
 * Só vale tentar de novo quando a mensagem com certeza NÃO saiu: o servidor recusou por ora (4xx ou limite de envio) ou a
 * conexão nem abriu. Um tempo esgotado no meio da entrega fica como falha, para a pessoa não receber duas vezes.
 */
export function tipoDeFalha(e: unknown): TipoDeFalha {
  const erro = e as { message?: unknown; responseCode?: unknown; code?: unknown } | null;
  const msg = String(erro?.message ?? e ?? "");
  if (/exceeded[^\n]{0,80}(per hour|hourly|limit|allow)|max(imum)? (e-?mails|defers)|rate.?limit|too many (e-?mails|messages|connections)|sending limit/i.test(msg)) return "limite";
  const codigo = Number(erro?.responseCode) || Number(/(?:^|:\s)(4\d\d)[ -]/.exec(msg)?.[1]);
  if (codigo >= 400 && codigo < 500) return "temporaria";
  if (/^(connection timeout|greeting never received)$/i.test(msg.trim()) || erro?.code === "EDNS" || /\b(ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH)\b/.test(msg)) return "temporaria";
  return "definitiva";
}

const MAXIMO = { temporaria: 3, limite: 6 } as const;
const MARCA = /^Tentativa (\d+) de \d+/;

/**
 * Se o envio deve voltar para a fila, devolve quando e o texto que aparece na lista de destinatários (que também guarda
 * quantas tentativas já foram). `null` = marcar como falha.
 */
export function novaTentativa(e: unknown, erroAnterior: unknown, agora: number = Date.now()): { tipo: "limite" | "temporaria"; depois: string; texto: string } | null {
  const tipo = tipoDeFalha(e);
  if (tipo === "definitiva") return null;
  const n = (Number(MARCA.exec(String(erroAnterior ?? ""))?.[1]) || 0) + 1;
  if (n >= MAXIMO[tipo]) return null;
  const minutos = tipo === "limite" ? 60 : n === 1 ? 5 : 30;
  const motivo = String((e as any)?.message ?? e).slice(0, 200);
  return { tipo, depois: new Date(agora + minutos * 60_000).toISOString(), texto: `Tentativa ${n} de ${MAXIMO[tipo]} não saiu (${motivo}). Vai tentar de novo.` };
}

/** Reenvios apagam a data do envio anterior: o que tinha saído na última hora continua contando no ritmo. */
export function somarNaHora(audiences: unknown[], agora: number = Date.now()): number {
  let n = 0;
  for (const a of audiences) {
    const lista = (a as any)?.reenvios;
    if (Array.isArray(lista)) for (const r of lista) if (agora - Date.parse(r?.quando) < 3600_000) n += Number(r?.naHora) || 0;
  }
  return n;
}
