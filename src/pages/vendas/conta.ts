// Contas e endereço do vídeo das páginas de venda (sem React, para poder testar).

const limpo = (n: number, max = Number.MAX_SAFE_INTEGER) => (Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0);

/** Valor das propostas que ficaram sem retorno: orçamentos x valor médio x percentual. */
export function valorParado(orcamentosPorMes: number, valorMedio: number, percentualSemRetorno: number) {
  const mes = limpo(orcamentosPorMes) * limpo(valorMedio) * (limpo(percentualSemRetorno, 100) / 100);
  return { mes, ano: mes * 12 };
}

export type Video = { tipo: "quadro" | "arquivo"; url: string } | null;

/** Aceita link do YouTube, do Vimeo ou arquivo .mp4/.webm em https. Qualquer outra coisa não é exibida. */
export function videoDaPagina(endereco: string): Video {
  let u: URL;
  try { u = new URL(String(endereco || "").trim()); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^(www|m)\./, "");
  if (host === "youtu.be" || host === "youtube.com") {
    const id = host === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v") || u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] || "";
    return /^[\w-]{11}$/.test(id) ? { tipo: "quadro", url: `https://www.youtube-nocookie.com/embed/${id}?rel=0` } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = u.pathname.match(/(\d{6,})/)?.[1];
    return id ? { tipo: "quadro", url: `https://player.vimeo.com/video/${id}` } : null;
  }
  return /\.(mp4|webm)$/i.test(u.pathname) ? { tipo: "arquivo", url: u.href } : null;
}
