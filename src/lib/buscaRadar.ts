/** Pesquisa do Radar por tipo de empresa e cidades: faz uma consulta por cidade e junta o que vier. */
export interface CidadeEscolhida { cidade: string; uf: string }
export interface FiltroRadar { tipo: string; cidades: CidadeEscolhida[]; /** por cidade */ quantidade: number }
export interface EmpresaDoRadar { empresa: string; endereco: string; avaliacao: string; contato: string; site: string; whatsapp: string; email?: string }
export interface ResultadoDaBusca { empresas: EmpresaDoRadar[]; restante: number | null; aviso: string | null }

type Api = (path: string, init?: RequestInit) => Promise<Response>;

export const descreverBusca = (f: FiltroRadar) => `${f.tipo.trim() || "empresas"}${f.cidades.length ? ` em ${f.cidades.map((c) => `${c.cidade}/${c.uf}`).join(", ")}` : ""}`;

export async function pesquisarNoRadar(api: Api, filtro: FiltroRadar): Promise<ResultadoDaBusca> {
  const tipo = filtro.tipo.trim();
  if (!filtro.cidades.length && tipo.length < 3) throw new Error("Diga o tipo de empresa ou escolha uma cidade.");
  const consultas = filtro.cidades.length ? filtro.cidades.map((c) => ({ criterio: `${tipo || "empresas"} em ${c.cidade}/${c.uf}`, cidade: c.cidade, uf: c.uf })) : [{ criterio: tipo }];
  const juntas = new Map<string, EmpresaDoRadar>();
  let restante: number | null = null;
  let aviso: string | null = null;
  for (const consulta of consultas) {
    const r = await api("/api/radar/pesquisar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...consulta, quantidade: filtro.quantidade }) });
    const j = await r.json().catch(() => ({}));
    if (typeof j.restante === "number") restante = j.restante;
    if (!r.ok) {
      aviso = j.error || "Não foi possível pesquisar agora.";
      if (!juntas.size) throw Object.assign(new Error(aviso!), { restante });
      break; // o que já veio das cidades anteriores não se perde
    }
    for (const e of (j.resultados ?? []) as EmpresaDoRadar[]) juntas.set(`${e.empresa}|${e.endereco}`, e);
  }
  return { empresas: [...juntas.values()], restante, aviso };
}
