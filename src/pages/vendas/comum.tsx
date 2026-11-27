/**
 * Peças comuns das páginas de venda (/vendas/...). Usam o visual da landing institucional (classes sp-) e levam ao
 * checkout. Regra de conteúdo: só recurso confirmado no produto; exemplos sempre rotulados; sem número inventado.
 */
import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronDown, Star } from "lucide-react";
import { usePublicPlans } from "../../lib/usePublicPlans";
import { useDocumentMeta } from "../landing/useDocumentMeta";
import { useRevealOnScroll } from "../landing/useRevealOnScroll";
import { rv } from "../landing/reveal";
import "../landing/landing.css";
import "../landing/landing-polish.css";
import "./vendas.css";

export function PaginaDeVenda({ tema, titulo, descricao, cta, children }: { tema: string; titulo: string; descricao: string; cta: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useRevealOnScroll(root);
  useDocumentMeta(titulo, descricao);
  return (
    <div className={`sp-root sv ${tema}`} ref={root}>
      <a href="#conteudo" className="sp-skip">Ir para o conteúdo</a>
      {/* Página de venda não tem menu: logo, um caminho para quem já é cliente e o botão. */}
      <header className="sp-header sv-topo">
        <div className="sp-wrap sv-topo__barra">
          <Link to="/landing" className="sp-brand" aria-label="S.P.Y. — conhecer a plataforma">
            <img className="sp-brand__img" src="/logo-topbar.webp" alt="S.P.Y. SOA" width={720} height={320} decoding="async" />
          </Link>
          <a href="#planos" className="sp-btn sp-btn--primary sp-btn--sm">{cta}</a>
        </div>
      </header>
      <main id="conteudo">{children}</main>
      <footer className="sv-rodape">
        <div className="sp-wrap">
          <nav aria-label="Rodapé">
            <Link to="/landing">Conhecer a plataforma</Link>
            <Link to="/contato">Contato</Link>
            <Link to="/termos">Termos de uso</Link>
            <Link to="/privacidade">Privacidade</Link>
            <Link to="/login">Já sou cliente</Link>
          </nav>
          <p>© {new Date().getFullYear()} S.P.Y. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}

/** Planos vindos do cadastro (os mesmos do checkout); cada botão abre o checkout com o plano marcado. */
export function PlanosDeVenda({ titulo, texto, botao, tema }: { titulo: string; texto: string; botao: (nome: string) => string; /** cor que o checkout deve usar */ tema?: "amarelo" }) {
  const { plans } = usePublicPlans();
  return (
    <section id="planos" className="sp-section" aria-labelledby="sv-planos-titulo">
      <div className="sp-wrap">
        <h2 id="sv-planos-titulo" className="sp-h2" {...rv()}>{titulo}</h2>
        <p className="sp-lede" {...rv(1)}>{texto}</p>
        <div className="sp-plans">
          {plans.map((p, i) => (
            <div key={p.id} {...rv(i)}>
              <article className={`sp-plan${p.highlight ? " sp-plan--hl" : ""}`}>
                {p.badgeTop && (
                  <span className="sp-plan__badge"><Star size={14} strokeWidth={1.75} aria-hidden="true" />{p.badgeTop.replace(/^★\s*/, "")}</span>
                )}
                <h3>{p.name}</h3>
                <p className="sp-plan__tag">{p.tagline}</p>
                <div className="sp-price">
                  <span>R$ </span><strong>{p.monthlyPrice}</strong><span> /mês</span>
                  {p.setupPrice && <small>Implantação, paga uma vez: <b>{p.setupPrice}</b></small>}
                </div>
                <ul>
                  {p.features.map((f) => (<li key={f}><Check size={16} strokeWidth={2} aria-hidden="true" />{f}</li>))}
                </ul>
                <Link to={`/checkout?plano=${p.id}${tema ? `&tema=${tema}` : ""}`} className={`sp-btn ${p.highlight ? "sp-btn--primary" : "sp-btn--outline"}`}>
                  {botao(p.name)}<ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
                </Link>
              </article>
            </div>
          ))}
        </div>
        <p className="sp-plans-note">Mais de 10 pessoas? <Link to="/contato" className="sp-link">Peça uma proposta Enterprise</Link></p>
      </div>
    </section>
  );
}

export type Pergunta = [pergunta: string, resposta: string];

export const PERGUNTAS: Pergunta[] = [
  ["O que vem em cada usuário?", "O Agente Secreto de Vendas e a Aurora, com CRM, agenda, tarefas, catálogo, propostas e contratos."],
  ["Como funciona o pagamento?", "Por Pix, no checkout. A primeira cobrança soma a mensalidade e a implantação, que é paga uma vez. O acesso é liberado depois da confirmação do pagamento."],
  ["O que está na implantação?", "Configuração do ambiente e do funil, integrações, importação de dados, ajuste da Aurora e dos agentes, conexão do WhatsApp de cada usuário, treinamento e acompanhamento por 30 dias."],
  ["O que o Agente Secreto consegue ler?", "As conversas dos números de WhatsApp que a empresa conecta. A empresa deve avisar a equipe e tratar os dados conforme a LGPD."],
];

export function Perguntas({ itens = PERGUNTAS }: { itens?: Pergunta[] }) {
  const [aberta, setAberta] = useState<number | null>(0);
  return (
    <section className="sp-section sv-perguntas" aria-labelledby="sv-faq-titulo">
      <div className="sp-wrap">
        <h2 id="sv-faq-titulo" className="sp-h2" {...rv()}>Antes de decidir.</h2>
        <div className="sp-faq">
          {itens.map(([q, a], i) => (
            <div className="sp-faq__item" key={q}>
              <h3 style={{ font: "inherit" }}>
                <button type="button" className="sp-faq__q" aria-expanded={aberta === i} aria-controls={`sv-r-${i}`} onClick={() => setAberta(aberta === i ? null : i)}>
                  {q}<ChevronDown size={20} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </h3>
              <div className="sp-faq__panel" data-open={aberta === i} id={`sv-r-${i}`}>
                <div><p className="sp-faq__a">{a}</p></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Chamada({ titulo, texto, botao }: { titulo: string; texto: string; botao: string }) {
  return (
    <section className="sp-section sv-chamada">
      <div className="sp-wrap">
        <h2 {...rv()}>{titulo}</h2>
        <p {...rv(1)}>{texto}</p>
        <a href="#planos" className="sp-btn sp-btn--primary" {...rv(2)}>{botao}<ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" /></a>
      </div>
    </section>
  );
}
