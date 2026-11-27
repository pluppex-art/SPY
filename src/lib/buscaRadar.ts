/** Pesquisa do Radar por CNAE (Receita) ou por tipo de empresa (Google Maps): uma consulta por cidade, juntando o que vier. */
export interface CidadeEscolhida { cidade: string; uf: string; /** código IBGE, exigido na busca por CNAE */ id?: string; /** continuação da busca por CNAE */ cursor?: string }
export interface FiltroRadar { modo: "cnae" | "mapa"; cnae?: string; tipo: string; cidades: CidadeEscolhida[]; /** por cidade */ quantidade: number }
export interface EmpresaDoRadar { empresa: string; endereco: string; avaliacao: string; contato: string; site: string; whatsapp: string; email?: string; cnpj?: string; razaoSocial?: string }
export interface ResultadoDaBusca { empresas: EmpresaDoRadar[]; restante: number | null; aviso: string | null; /** a mesma busca, para trazer as próximas empresas (só CNAE) */ mais: FiltroRadar | null }

type Api = (path: string, init?: RequestInit) => Promise<Response>;

export const chaveDaEmpresa = (e: EmpresaDoRadar) => e.cnpj || `${e.empresa}|${e.endereco}`;

export const descreverBusca = (f: FiltroRadar) => {
  const onde = f.cidades.length ? ` em ${f.cidades.map((c) => `${c.cidade}/${c.uf}`).join(", ")}` : "";
  return `${f.modo === "cnae" ? `CNAE ${f.cnae}` : f.tipo.trim() || "empresas"}${onde}`;
};

export async function pesquisarNoRadar(api: Api, filtro: FiltroRadar): Promise<ResultadoDaBusca> {
  const tipo = filtro.tipo.trim();
  const porCnae = filtro.modo === "cnae";
  const cnae = String(filtro.cnae ?? "").replace(/\D/g, "");
  if (porCnae && cnae.length !== 7) throw new Error("Escolha a atividade ou digite o CNAE com 7 dígitos.");
  if (porCnae && !filtro.cidades.length) throw new Error("Escolha pelo menos uma cidade.");
  if (!porCnae && !filtro.cidades.length && tipo.length < 3) throw new Error("Diga o tipo de empresa ou escolha uma cidade.");
  const consultas: { corpo: object; cidade?: CidadeEscolhida }[] = porCnae
    ? filtro.cidades.map((c) => ({ cidade: c, corpo: { cnae, municipio: c.id, ...(c.cursor ? { cursor: c.cursor } : {}) } }))
    : filtro.cidades.length ? filtro.cidades.map((c) => ({ corpo: { criterio: `${tipo || "empresas"} em ${c.cidade}/${c.uf}`, cidade: c.cidade, uf: c.uf } })) : [{ corpo: { criterio: tipo } }];
  const juntas = new Map<string, EmpresaDoRadar>();
  const continuar: CidadeEscolhida[] = [];
  let restante: number | null = null;
  let aviso: string | null = null;
  for (const consulta of consultas) {
    const r = await api(porCnae ? "/api/radar/cnae" : "/api/radar/pesquisar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...consulta.corpo, quantidade: filtro.quantidade }) });
    const j = await r.json().catch(() => ({}));
    if (typeof j.restante === "number") restante = j.restante;
    if (!r.ok) {
      aviso = j.error || "Não foi possível pesquisar agora.";
      if (!juntas.size) throw Object.assign(new Error(aviso!), { restante });
      break; // o que já veio das cidades anteriores não se perde
    }
    for (const e of (j.resultados ?? []) as EmpresaDoRadar[]) juntas.set(chaveDaEmpresa(e), e);
    if (consulta.cidade && j.proximoCursor) continuar.push({ ...consulta.cidade, cursor: j.proximoCursor });
  }
  return { empresas: [...juntas.values()], restante, aviso, mais: continuar.length && restante !== 0 ? { ...filtro, cidades: continuar } : null };
}
