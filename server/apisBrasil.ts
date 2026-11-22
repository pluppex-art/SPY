// Dados do Brasil para o SPY, a Aurora e os agentes: CNPJ, CEP, taxas do Banco Central e cálculos trabalhistas (ContaCLT).
// Sempre pelo servidor (o navegador é barrado pela CSP e as fontes podem cair): cada consulta tem fonte reserva e cache.
// Fontes sem chave. Referência: docs/apis-brasil.md.
import type express from "express";

type Deps = { requireUser: express.RequestHandler; limiter: express.RequestHandler };

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const soDigitos = (v: unknown) => texto(v).replace(/\D/g, "");

// ── Cache simples em memória (por instância) ────────────────────────────────────────────────────
const cache = new Map<string, { ate: number; valor: unknown }>();
async function comCache<T>(chave: string, ttlMs: number, buscar: () => Promise<T>): Promise<T> {
  const hit = cache.get(chave);
  if (hit && hit.ate > Date.now()) return hit.valor as T;
  const valor = await buscar();
  cache.set(chave, { ate: Date.now() + ttlMs, valor });
  if (cache.size > 500) for (const [k, v] of cache) if (v.ate < Date.now()) cache.delete(k);
  return valor;
}

async function getJson(url: string, ms = 10_000): Promise<{ status: number; json: any }> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { Accept: "application/json" } });
  let json: any = null;
  try { json = await r.json(); } catch { /* corpo vazio */ }
  return { status: r.status, json };
}

// ── CNPJ ────────────────────────────────────────────────────────────────────────────────────────
export type EmpresaCnpj = {
  cnpj: string; razaoSocial: string; fantasia: string; situacao: string; cnae: string; cnaeDescricao: string;
  porte: string; endereco: string; cidade: string; uf: string; cep: string; email: string; telefone: string; fonte: string;
};

export function validarCnpj(v: unknown): string | null {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return null;
  const dv = (base: string) => {
    let soma = 0, peso = base.length - 7;
    for (const c of base) { soma += Number(c) * peso--; if (peso < 2) peso = 9; }
    const r = soma % 11; return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(d.slice(0, 12));
  return d1 === Number(d[12]) && dv(d.slice(0, 13)) === Number(d[13]) ? d : null;
}

export function deBrasilApi(j: any): EmpresaCnpj {
  const rua = [texto(j?.descricao_tipo_de_logradouro), texto(j?.logradouro)].filter(Boolean).join(" ");
  const numero = texto(j?.numero) && texto(j?.numero) !== "S/N" ? texto(j?.numero) : "";
  return {
    cnpj: soDigitos(j?.cnpj), razaoSocial: texto(j?.razao_social), fantasia: texto(j?.nome_fantasia),
    situacao: texto(j?.descricao_situacao_cadastral), cnae: String(j?.cnae_fiscal ?? ""), cnaeDescricao: texto(j?.cnae_fiscal_descricao),
    porte: texto(j?.porte), endereco: [[rua, numero].filter(Boolean).join(", "), texto(j?.complemento), texto(j?.bairro)].filter(Boolean).join(" · "),
    cidade: texto(j?.municipio), uf: texto(j?.uf), cep: soDigitos(j?.cep), email: texto(j?.email).toLowerCase(),
    telefone: texto(j?.ddd_telefone_1), fonte: "brasilapi",
  };
}

export function deReceitaWs(j: any): EmpresaCnpj {
  const ativ = Array.isArray(j?.atividade_principal) ? j.atividade_principal[0] : null;
  const numero = texto(j?.numero) && texto(j?.numero) !== "SN" ? texto(j?.numero) : "";
  return {
    cnpj: soDigitos(j?.cnpj), razaoSocial: texto(j?.nome), fantasia: texto(j?.fantasia), situacao: texto(j?.situacao),
    cnae: soDigitos(ativ?.code), cnaeDescricao: texto(ativ?.text), porte: texto(j?.porte),
    endereco: [[texto(j?.logradouro), numero].filter(Boolean).join(", "), texto(j?.complemento), texto(j?.bairro)].filter(Boolean).join(" · "),
    cidade: texto(j?.municipio), uf: texto(j?.uf), cep: soDigitos(j?.cep), email: texto(j?.email).toLowerCase(),
    telefone: texto(j?.telefone), fonte: "receitaws",
  };
}

async function consultarCnpj(cnpj: string): Promise<EmpresaCnpj | "nao_encontrado" | null> {
  let naoEncontrado = false;
  try {
    const a = await getJson(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (a.status === 200 && a.json) return deBrasilApi(a.json);
    if (a.status === 404) naoEncontrado = true;
  } catch { /* cai para a reserva */ }
  try {
    const b = await getJson(`https://www.receitaws.com.br/v1/cnpj/${cnpj}`);
    if (b.status === 200 && b.json && b.json.status !== "ERROR") return deReceitaWs(b.json);
    if (b.json?.status === "ERROR" && /inv[aá]lido|n[aã]o encontrad/i.test(texto(b.json?.message))) naoEncontrado = true;
  } catch { /* sem reserva */ }
  return naoEncontrado ? "nao_encontrado" : null;
}

// ── CEP ─────────────────────────────────────────────────────────────────────────────────────────
export type EnderecoCep = { cep: string; logradouro: string; bairro: string; cidade: string; uf: string; ibge: string; latitude: string; longitude: string; fonte: string };

export function deBrasilApiCep(j: any): EnderecoCep {
  return {
    cep: soDigitos(j?.cep), logradouro: texto(j?.street), bairro: texto(j?.neighborhood), cidade: texto(j?.city), uf: texto(j?.state),
    ibge: texto(j?.ibge?.city), latitude: texto(j?.location?.coordinates?.latitude), longitude: texto(j?.location?.coordinates?.longitude), fonte: "brasilapi",
  };
}
export function deViaCep(j: any): EnderecoCep {
  return { cep: soDigitos(j?.cep), logradouro: texto(j?.logradouro), bairro: texto(j?.bairro), cidade: texto(j?.localidade), uf: texto(j?.uf), ibge: texto(j?.ibge), latitude: "", longitude: "", fonte: "viacep" };
}

async function consultarCep(cep: string): Promise<EnderecoCep | "nao_encontrado" | null> {
  let naoEncontrado = false;
  try {
    const a = await getJson(`https://brasilapi.com.br/api/cep/v2/${cep}`);
    if (a.status === 200 && a.json) return deBrasilApiCep(a.json);
    if (a.status === 404) naoEncontrado = true;
  } catch { /* reserva */ }
  try {
    const b = await getJson(`https://viacep.com.br/ws/${cep}/json/`);
    if (b.status === 200 && b.json && !b.json.erro) return deViaCep(b.json);
    if (b.json?.erro) naoEncontrado = true;
  } catch { /* sem reserva */ }
  return naoEncontrado ? "nao_encontrado" : null;
}

// ── Taxas (Banco Central, SGS) ──────────────────────────────────────────────────────────────────
// 432 Selic meta (% a.a.) · 433 IPCA do mês (%) · 12 CDI diário (% a.d.) · 1 dólar venda (R$)
export const SERIES_BCB = { selic: 432, ipca: 433, cdi: 12, dolar: 1 } as const;
export type Taxa = { valor: number; data: string };

/** O SGS devolve `valor` em texto e a data como DD/MM/AAAA. */
export function lerSerieBcb(j: any): Taxa | null {
  const u = Array.isArray(j) ? j[j.length - 1] : null;
  const valor = Number(u?.valor);
  if (!u || !Number.isFinite(valor)) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto(u.data));
  return { valor, data: m ? `${m[3]}-${m[2]}-${m[1]}` : texto(u.data) };
}

// ── Trabalhista (ContaCLT) ──────────────────────────────────────────────────────────────────────
// Só as rotas e parâmetros conhecidos passam (nada de URL livre do usuário).
export const CALCULOS_CLT: Record<string, string[]> = {
  "salario-liquido": ["salario", "dependentes", "pensao"],
  inss: ["salario", "categoria"],
  irrf: ["salario", "dependentes", "pensao"],
  "seguro-desemprego": ["salario1", "salario2", "salario3", "solicitacao", "meses"],
  "saque-aniversario": ["saldo"],
  "das-mei": ["atividade", "mes_abertura", "faturamento"],
  "empregada-domestica": ["salario", "dependentes", "filhos", "vale_transporte"],
  tabelas: [],
};

export function montarUrlClt(calculo: string, query: Record<string, unknown>): string | null {
  const permitidos = CALCULOS_CLT[calculo];
  if (!permitidos) return null;
  const q = new URLSearchParams();
  for (const k of permitidos) {
    const v = texto(query[k]);
    if (v && v.length <= 40 && /^[\w.,\-/]+$/.test(v)) q.set(k, v);
  }
  const qs = q.toString();
  return `https://contaclt.com/api/v1/${calculo}${qs ? `?${qs}` : ""}`;
}

export function registerApisBrasilRoutes(app: express.Express, { requireUser, limiter }: Deps) {
  app.get("/api/br/cnpj/:cnpj", requireUser, limiter, async (req, res) => {
    const cnpj = validarCnpj(req.params.cnpj);
    if (!cnpj) return res.status(400).json({ error: "CNPJ inválido. Confira os dígitos." });
    const r = await comCache(`cnpj:${cnpj}`, 6 * 3600_000, () => consultarCnpj(cnpj));
    if (r === "nao_encontrado") return res.status(404).json({ error: "CNPJ não encontrado na Receita." });
    if (!r) { cache.delete(`cnpj:${cnpj}`); return res.status(502).json({ error: "As fontes de CNPJ estão indisponíveis agora. Tente de novo." }); }
    return res.json(r);
  });

  app.get("/api/br/cep/:cep", requireUser, limiter, async (req, res) => {
    const cep = soDigitos(req.params.cep);
    if (cep.length !== 8) return res.status(400).json({ error: "CEP precisa ter 8 dígitos." });
    const r = await comCache(`cep:${cep}`, 24 * 3600_000, () => consultarCep(cep));
    if (r === "nao_encontrado") return res.status(404).json({ error: "CEP não encontrado." });
    if (!r) { cache.delete(`cep:${cep}`); return res.status(502).json({ error: "As fontes de CEP estão indisponíveis agora. Tente de novo." }); }
    return res.json(r);
  });

  app.get("/api/br/taxas", requireUser, limiter, async (_req, res) => {
    try {
      const out = await comCache("taxas", 3600_000, async () => {
        const nomes = Object.keys(SERIES_BCB) as (keyof typeof SERIES_BCB)[];
        const lidas = await Promise.all(nomes.map(async (n) => {
          const { status, json } = await getJson(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${SERIES_BCB[n]}/dados/ultimos/1?formato=json`);
          return [n, status === 200 ? lerSerieBcb(json) : null] as const;
        }));
        const t = Object.fromEntries(lidas.filter(([, v]) => v)) as Record<string, Taxa>;
        if (!Object.keys(t).length) throw new Error("sem dados");
        return { ...t, fonte: "Banco Central do Brasil (SGS)" };
      });
      return res.json(out);
    } catch (err: any) {
      console.error("[br/taxas]", err?.message);
      return res.status(502).json({ error: "Não foi possível consultar o Banco Central agora." });
    }
  });

  app.get("/api/br/trabalhista/:calculo", requireUser, limiter, async (req, res) => {
    const url = montarUrlClt(req.params.calculo, req.query as Record<string, unknown>);
    if (!url) return res.status(404).json({ error: "Cálculo não disponível.", disponiveis: Object.keys(CALCULOS_CLT) });
    try {
      const r = await comCache(`clt:${url}`, 3600_000, async () => getJson(url));
      if (r.status !== 200 || !r.json) { cache.delete(`clt:${url}`); return res.status(r.status === 400 ? 400 : 502).json({ error: r.json?.message || "Não foi possível calcular agora." }); }
      return res.json({ ...r.json, fonte: "ContaCLT (https://contaclt.com/)" });
    } catch (err: any) {
      console.error("[br/trabalhista]", err?.message);
      return res.status(502).json({ error: "Não foi possível calcular agora." });
    }
  });
}
