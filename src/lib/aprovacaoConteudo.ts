/**
 * Aprovação de conteúdo pelo cliente (link público, sem login).
 * O pedido fica em marketing_content.extras.aprovacao. Estas funções são usadas pela tela do Marketing e pelo servidor,
 * para os dois enxergarem a mesma regra de validade e a mesma "versão" do conteúdo.
 */
export type SituacaoAprovacao = "aguardando" | "aprovado" | "ajustes";

export interface RespostaAprovacao {
  decisao: "aprovado" | "ajustes";
  comentario: string;
  nome: string;
  em: string;
}

export interface Aprovacao {
  token: string;
  status: SituacaoAprovacao;
  enviadoEm: string;
  expiraEm: string;
  /** Última resposta do cliente ao envio atual. */
  resposta?: RespostaAprovacao;
  /** Versão do conteúdo que o cliente viu ao responder. */
  versaoRespondida?: string;
  historico: RespostaAprovacao[];
}

export const DIAS_VALIDADE_LINK = 60;
export const MAX_HISTORICO = 30;

export const ROTULO_APROVACAO: Record<SituacaoAprovacao, string> = {
  aguardando: "Aguardando cliente",
  aprovado: "Aprovado",
  ajustes: "Ajustes pedidos",
};

export const tokenValido = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{32,64}$/.test(t);

/** Token aleatório (192 bits) em base64url. Funciona no navegador e no Node. */
export function novoToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const ehResposta = (r: any): r is RespostaAprovacao => !!r && (r.decisao === "aprovado" || r.decisao === "ajustes") && typeof r.em === "string";

export function lerAprovacao(v: unknown): Aprovacao | undefined {
  const a = v as any;
  if (!a || typeof a !== "object" || !tokenValido(a.token)) return undefined;
  return {
    token: a.token,
    status: a.status === "aprovado" || a.status === "ajustes" ? a.status : "aguardando",
    enviadoEm: typeof a.enviadoEm === "string" ? a.enviadoEm : "",
    expiraEm: typeof a.expiraEm === "string" ? a.expiraEm : "",
    resposta: ehResposta(a.resposta) ? a.resposta : undefined,
    versaoRespondida: typeof a.versaoRespondida === "string" ? a.versaoRespondida : undefined,
    historico: Array.isArray(a.historico) ? a.historico.filter(ehResposta) : [],
  };
}

export const linkVencido = (a: Aprovacao, agora = Date.now()) => !(Date.parse(a.expiraEm) > agora);

/** Novo envio ao cliente: volta para "aguardando" e guarda o histórico das respostas anteriores. */
export function enviarParaAprovacao(token: string, anterior: Aprovacao | undefined, agora = new Date()): Aprovacao {
  return {
    token,
    status: "aguardando",
    enviadoEm: agora.toISOString(),
    expiraEm: new Date(agora.getTime() + DIAS_VALIDADE_LINK * 86_400_000).toISOString(),
    historico: anterior?.historico ?? [],
  };
}

export function responder(a: Aprovacao, resposta: RespostaAprovacao, versao: string): Aprovacao {
  return {
    ...a,
    status: resposta.decisao,
    resposta,
    versaoRespondida: versao,
    historico: [...a.historico, resposta].slice(-MAX_HISTORICO),
  };
}

/** O que o cliente aprova. Mudou qualquer um destes, a resposta antiga deixa de valer para o conteúdo atual. */
export interface ConteudoAprovavel {
  titulo?: unknown; descricao?: unknown; roteiro?: unknown; canal?: unknown; formato?: unknown; data?: unknown;
  hashtags?: unknown; links?: unknown; anexos?: unknown;
}

const texto = (v: unknown) => String(v ?? "").replace(/\r\n/g, "\n").trim();
const lista = (v: unknown) => (Array.isArray(v) ? v : []);

export function versaoDoConteudo(c: ConteudoAprovavel): string {
  const base = JSON.stringify([
    texto(c.titulo), texto(c.descricao), texto(c.roteiro), texto(c.canal), texto(c.formato), texto(c.data).slice(0, 10),
    lista(c.hashtags).map(texto),
    lista(c.links).map((l: any) => texto(l?.url ?? l)),
    lista(c.anexos).map((a: any) => texto(a?.url ?? a)),
  ]);
  // FNV-1a de 32 bits: basta para detectar mudança de conteúdo.
  let h = 0x811c9dc5;
  for (let i = 0; i < base.length; i++) { h ^= base.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export const alteradaDepoisDaResposta = (a: Aprovacao | undefined, versaoAtual: string) =>
  !!a?.versaoRespondida && a.status !== "aguardando" && a.versaoRespondida !== versaoAtual;

/** Só endereços http(s) viram link na página pública. */
export const urlSegura = (u: unknown): u is string => typeof u === "string" && /^https?:\/\/[^\s]+$/i.test(u);
