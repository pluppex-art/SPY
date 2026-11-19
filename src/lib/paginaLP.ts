/** Conteúdo de uma landing page criada dentro do sistema (guardado em marketing_landing_pages.conteudo). */
import { CAMPOS_PADRAO, normalizarCampos, type CampoForm } from "./formularioCampos";

export interface ConteudoLP {
  titulo: string;
  subtitulo: string;
  bullets: string[];
  imagem: string;
  cta: string;
  cor: string;
  campos: CampoForm[];
  mensagemSucesso: string;
  rodape: string;
}

export const CONTEUDO_LP_PADRAO: ConteudoLP = {
  titulo: "Receba uma proposta sem compromisso",
  subtitulo: "Deixe seus dados e retornamos o mais rápido possível.",
  bullets: ["Atendimento rápido e personalizado", "Sem compromisso", "Resposta em até 1 dia útil"],
  imagem: "",
  cta: "Quero receber contato",
  cor: "#2563EB",
  campos: CAMPOS_PADRAO,
  mensagemSucesso: "Recebemos suas informações! Em breve entraremos em contato.",
  rodape: "",
};

const texto = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

/** Lê o conteúdo vindo do banco/editor com limites e valores seguros (cor só em #RRGGBB, imagem só https). */
export function normalizarConteudoLP(raw: any): ConteudoLP {
  const base = CONTEUDO_LP_PADRAO;
  const campos = normalizarCampos(raw?.campos);
  const imagem = texto(raw?.imagem, 600);
  const cor = texto(raw?.cor, 7);
  return {
    titulo: texto(raw?.titulo, 140) || base.titulo,
    subtitulo: texto(raw?.subtitulo, 300),
    bullets: Array.isArray(raw?.bullets) ? raw.bullets.map((b: unknown) => texto(b, 120)).filter(Boolean).slice(0, 8) : base.bullets,
    imagem: /^https:\/\//i.test(imagem) ? imagem : "",
    cta: texto(raw?.cta, 40) || base.cta,
    cor: /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : base.cor,
    campos: campos.length ? campos : base.campos,
    mensagemSucesso: texto(raw?.mensagemSucesso, 300) || base.mensagemSucesso,
    rodape: texto(raw?.rodape, 300),
  };
}
