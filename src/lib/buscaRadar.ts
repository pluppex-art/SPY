/** Pesquisa do Radar por CNAE (Receita) ou por tipo de empresa (Google Maps): uma consulta por atividade e cidade, juntando o que vier. */
export interface CidadeEscolhida { cidade: string; uf: string; /** código IBGE, exigido na busca por CNAE */ id?: string }
/** Uma consulta por CNAE que ainda tem mais empresas. */
export interface Continuacao { cnae: string; municipio: string; cursor: string }
export interface FiltroRadar { modo: "cnae" | "mapa"; cnaes?: string[]; tipo: string; cidades: CidadeEscolhida[]; /** por atividade em cada cidade */ quantidade: number; continuar?: Continuacao[] }
export interface EmpresaDoRadar { empresa: string; endereco: string; avaliacao: string; contato: string; site: string; whatsapp: string; email?: string; cnpj?: string; razaoSocial?: string }
export interface ResultadoDaBusca { empresas: EmpresaDoRadar[]; restante: number | null; aviso: string | null; /** a mesma busca, para trazer as próximas empresas (só CNAE) */ mais: FiltroRadar | null }

type Api = (path: string, init?: RequestInit) => Promise<Response>;

/** Atividades mais procuradas; qualquer outra entra digitando o código. */
export const ATIVIDADES: [string, string][] = [
  ["5611201", "Restaurantes"], ["9313100", "Academias"], ["8630504", "Clínicas odontológicas"], ["8630503", "Consultórios médicos"],
  ["6920601", "Escritórios de contabilidade"], ["4744099", "Materiais de construção"], ["6821801", "Imobiliárias (compra e venda)"],
  ["4520001", "Oficinas mecânicas"], ["4789004", "Pet shops"], ["9602501", "Salões de beleza"], ["4781400", "Lojas de roupas"],
  ["4771701", "Farmácias"], ["4712100", "Mercados e mercearias"],
];
export const MAX_ATIVIDADES = 5;
/** 5611201 → 56.11-2-01, também enquanto digita. */
export const mascaraCnae = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 7); return [d.slice(0, 2), d.length > 2 ? `.${d.slice(2, 4)}` : "", d.length > 4 ? `-${d.slice(4, 5)}` : "", d.length > 5 ? `-${d.slice(5)}` : ""].join(""); };
export const nomeDaAtividade = (cnae: string) => ATIVIDADES.find(([c]) => c === cnae)?.[1] ?? `CNAE ${mascaraCnae(cnae)}`;

export const chaveDaEmpresa = (e: EmpresaDoRadar) => e.cnpj || `${e.empresa}|${e.endereco}`;

export const descreverBusca = (f: FiltroRadar) => {
  const onde = f.cidades.length ? ` em ${f.cidades.map((c) => `${c.cidade}/${c.uf}`).join(", ")}` : "";
  return `${f.modo === "cnae" ? (f.cnaes ?? []).map(nomeDaAtividade).join(", ") : f.tipo.trim() || "empresas"}${onde}`;
};

export interface OpcoesDaBusca {
  /** Chamado a cada resposta, com tudo o que já veio. */
  aoAvancar?: (empresas: EmpresaDoRadar[], restante: number | null) => void;
  /** Começo (quantos segundos) e fim (null) de uma espera pela liberação da consulta. */
  aoEsperar?: (segundos: number | null) => void;
  /** Para a busca, guardando o que já veio. */
  sinal?: AbortSignal;
  esperar?: (ms: number, sinal?: AbortSignal) => Promise<void>;
}

const dormir = (ms: number, sinal?: AbortSignal) => new Promise<void>((ok) => {
  if (sinal?.aborted) return ok();
  const fim = () => { clearTimeout(t); sinal?.removeEventListener("abort", fim); ok(); };
  const t = setTimeout(fim, ms);
  sinal?.addEventListener("abort", fim);
});
/** Esperas seguidas sem receber nada antes de desistir. */
const MAX_ESPERAS = 6;

export async function pesquisarNoRadar(api: Api, filtro: FiltroRadar, opcoes: OpcoesDaBusca = {}): Promise<ResultadoDaBusca> {
  const { aoAvancar, aoEsperar, sinal, esperar = dormir } = opcoes;
  const tipo = filtro.tipo.trim();
  const porCnae = filtro.modo === "cnae";
  const cnaes = [...new Set((filtro.cnaes ?? []).map((c) => c.replace(/\D/g, "")))];
  if (porCnae && (!cnaes.length || cnaes.some((c) => c.length !== 7))) throw new Error("Escolha pelo menos uma atividade (o CNAE tem 7 dígitos).");
  if (porCnae && !filtro.cidades.length) throw new Error("Escolha pelo menos uma cidade.");
  if (!porCnae && !filtro.cidades.length && tipo.length < 3) throw new Error("Diga o tipo de empresa ou escolha uma cidade.");

  const juntas = new Map<string, EmpresaDoRadar>();
  const continuar: Continuacao[] = [];
  let restante: number | null = null;
  let aviso: string | null = null;
  const pedir = async (rota: string, corpo: object) => {
    const r = await api(rota, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (typeof j.restante === "number") restante = j.restante;
    return { r, j };
  };
  const guardar = (lista: EmpresaDoRadar[]) => { for (const e of lista) juntas.set(chaveDaEmpresa(e), e); aoAvancar?.([...juntas.values()], restante); };
  const recusar = (mensagem?: string) => {
    aviso = mensagem || "Não foi possível pesquisar agora.";
    if (!juntas.size) throw Object.assign(new Error(aviso), { restante }); // o que já veio não se perde
  };

  if (porCnae) {
    // Cada atividade em cada cidade (ou só as que ficaram por continuar).
    const fila = filtro.continuar ?? cnaes.flatMap((cnae) => filtro.cidades.map((c) => ({ cnae, municipio: c.id!, cursor: "" })));
    let parar = false;
    for (const q of fila) {
      let cursor = q.cursor, falta = filtro.quantidade, esperas = 0, esgotada = false;
      while (!parar && !sinal?.aborted && falta > 0) {
        const { r, j } = await pedir("/api/radar/cnae", { cnae: q.cnae, municipio: q.municipio, quantidade: falta, ...(cursor ? { cursor } : {}) });
        if (r.status === 429 && j.aguardar && esperas < MAX_ESPERAS) {
          esperas++; aoEsperar?.(j.aguardar);
          await esperar((j.aguardar + 1) * 1000, sinal);
          aoEsperar?.(null);
          continue;
        }
        if (!r.ok) { parar = true; recusar(j.error); break; }
        const vieram: EmpresaDoRadar[] = j.resultados ?? [];
        esperas = 0; falta -= vieram.length; cursor = j.proximoCursor || ""; guardar(vieram);
        if (!cursor) { esgotada = true; break; }
        if (!vieram.length) break;
        if (restante === 0) parar = true;
      }
      if (!esgotada) continuar.push({ ...q, cursor });
    }
  } else {
    const consultas = filtro.cidades.length ? filtro.cidades.map((c) => ({ criterio: `${tipo || "empresas"} em ${c.cidade}/${c.uf}`, cidade: c.cidade, uf: c.uf })) : [{ criterio: tipo }];
    for (const consulta of consultas) {
      if (sinal?.aborted) break;
      const { r, j } = await pedir("/api/radar/pesquisar", { ...consulta, quantidade: filtro.quantidade });
      if (!r.ok) { recusar(j.error); break; }
      guardar(j.resultados ?? []);
    }
  }
  return { empresas: [...juntas.values()], restante, aviso, mais: continuar.length && restante !== 0 ? { ...filtro, continuar } : null };
}
