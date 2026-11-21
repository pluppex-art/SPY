// Prospecção por CNAE e cidade (empresas ativas da base aberta da Receita, via apipj.com.br).
// A chave fica só no servidor (APIPJ_KEY); o navegador nunca a vê. Cada empresa devolvida gasta 1 da cota mensal da conta.
import type express from "express";

const APIPJ = "https://apipj.com.br/v1/busca";
const IBGE = "https://servicodados.ibge.gov.br/api/v1/localidades/estados";
const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));
/** Teto por página: cada empresa custa 1 da cota, então a tela pede pouco e o usuário pede mais. */
export const LIMITE_PADRAO = 25;
export const LIMITE_MAXIMO = 100;

export type EmpresaProspeccao = {
  cnpj: string; nome: string; fantasia: string; cnae: string; cnaeDescricao: string;
  porte: string; abertura: string; endereco: string; cidade: string; uf: string; cep: string;
  email: string; telefone: string;
};

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

/** CNAE só com dígitos (aceita 47.81-4-00); null se não tiver 7 dígitos. */
export function normalizarCnae(v: unknown): string | null {
  const d = texto(v).replace(/\D/g, "");
  return d.length === 7 ? d : null;
}

/** Código IBGE do município: 7 dígitos; null se inválido. */
export function normalizarMunicipio(v: unknown): string | null {
  const d = texto(v).replace(/\D/g, "");
  return d.length === 7 ? d : null;
}

export function montarUrlBusca(p: { cnae: string; municipio: string; limite?: number; cursor?: string | null }): string {
  const q = new URLSearchParams({ cnae: p.cnae, municipio: p.municipio, formato: "simplificado" });
  const limite = Math.min(Math.max(Math.trunc(Number(p.limite) || LIMITE_PADRAO), 1), LIMITE_MAXIMO);
  q.set("limite", String(limite));
  if (p.cursor) q.set("cursor", p.cursor);
  return `${APIPJ}?${q.toString()}`;
}

/** Formato "simplificado" da apipj → o que a tela precisa. Campo ausente vira texto vazio (nunca inventado). */
export function normalizarEmpresa(r: any): EmpresaProspeccao {
  const ativ = Array.isArray(r?.atividade_principal) ? r.atividade_principal[0] : null;
  const rua = [texto(r?.logradouro), texto(r?.numero)].filter(Boolean).join(", ");
  const endereco = [rua, texto(r?.complemento), texto(r?.bairro)].filter(Boolean).join(" · ");
  return {
    cnpj: texto(r?.cnpj), nome: texto(r?.nome), fantasia: texto(r?.fantasia),
    cnae: texto(ativ?.code), cnaeDescricao: texto(ativ?.text),
    porte: texto(r?.porte), abertura: texto(r?.abertura),
    endereco, cidade: texto(r?.municipio), uf: texto(r?.uf), cep: texto(r?.cep),
    email: texto(r?.email).toLowerCase(), telefone: texto(r?.telefone),
  };
}

const MENSAGENS: Record<number, string> = {
  400: "Filtro inválido. Confira o CNAE e a cidade.",
  401: "A chave da apipj foi recusada. Avise o administrador.",
  429: "Limite da apipj atingido (por minuto ou do mês). Tente de novo em instantes.",
  503: "A busca da apipj está indisponível agora. Tente de novo mais tarde.",
};

type Deps = { requireUser: express.RequestHandler; limiter: express.RequestHandler };

export function registerProspeccaoCnaeRoutes(app: express.Express, { requireUser, limiter }: Deps) {
  const cidades = new Map<string, { id: string; nome: string }[]>();

  // Cidades de um estado (IBGE), para a pessoa escolher pelo nome em vez de decorar o código.
  app.get("/api/prospeccao/municipios", requireUser, limiter, async (req, res) => {
    const uf = texto(req.query.uf).toUpperCase();
    if (!UFS.has(uf)) return res.status(400).json({ error: "UF inválida." });
    try {
      let lista = cidades.get(uf);
      if (!lista) {
        const r = await fetch(`${IBGE}/${uf}/municipios?orderBy=nome`, { signal: AbortSignal.timeout(10_000) });
        if (!r.ok) return res.status(502).json({ error: "Não foi possível carregar as cidades agora." });
        const dados = (await r.json()) as { id: number; nome: string }[];
        lista = dados.map((m) => ({ id: String(m.id), nome: m.nome }));
        cidades.set(uf, lista);
      }
      res.setHeader("Cache-Control", "private, max-age=86400");
      return res.json({ municipios: lista });
    } catch (err: any) {
      console.error("[prospeccao/municipios]", err?.message);
      return res.status(502).json({ error: "Não foi possível carregar as cidades agora." });
    }
  });

  app.get("/api/prospeccao/cnae", requireUser, limiter, async (req, res) => {
    const chave = process.env.APIPJ_KEY;
    if (!chave) return res.status(503).json({ error: "Busca por CNAE ainda não configurada (falta a chave da apipj no servidor)." });
    const cnae = normalizarCnae(req.query.cnae);
    const municipio = normalizarMunicipio(req.query.municipio);
    if (!cnae) return res.status(400).json({ error: "Informe o CNAE com 7 dígitos (ex.: 47.81-4-00)." });
    if (!municipio) return res.status(400).json({ error: "Escolha a cidade." });
    const cursor = texto(req.query.cursor).slice(0, 512) || null;
    try {
      const r = await fetch(montarUrlBusca({ cnae, municipio, limite: Number(req.query.limite), cursor }), {
        headers: { Authorization: `Bearer ${chave}` }, signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) {
        console.error("[prospeccao/cnae] apipj", r.status);
        return res.status(r.status === 400 || r.status === 401 || r.status === 429 || r.status === 503 ? r.status : 502)
          .json({ error: MENSAGENS[r.status] ?? "A apipj não respondeu como esperado." });
      }
      const j: any = await r.json();
      return res.json({
        total: Number(j?.total) || 0,
        empresas: (Array.isArray(j?.resultados) ? j.resultados : []).map(normalizarEmpresa),
        proximoCursor: typeof j?.proximo_cursor === "string" ? j.proximo_cursor : null,
      });
    } catch (err: any) {
      console.error("[prospeccao/cnae]", err?.message);
      return res.status(502).json({ error: "Não foi possível consultar a apipj agora." });
    }
  });
}
