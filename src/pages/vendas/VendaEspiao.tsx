/** Página de venda 1, "dossiê": texto em forma de história, visual escuro de investigação. */
import { ArrowRight, Check, X } from "lucide-react";
import { SpyEmblem } from "../landing/components/SpyEmblem";
import { rv } from "../landing/reveal";
import { Chamada, PaginaDeVenda, PERGUNTAS, Perguntas, PlanosDeVenda } from "./comum";

const BOTAO = "Quero o espião no meu time";

const DIA: [string, string, string][] = [
  ["09:12", "Um cliente pergunta o preço.", "Ele escreve no WhatsApp do vendedor. Só o vendedor vê."],
  ["09:40", "A resposta sai pelo celular.", "O vendedor segue o dia. Nada foi para o sistema."],
  ["15:30", "O cliente pede um prazo maior.", "A resposta fica para depois, junto com outras dez conversas."],
  ["Sexta", "Você pergunta como ficou aquele orçamento.", "Alguém precisa rolar a conversa para tentar lembrar."],
];

const DOSSIE: [string, string][] = [
  ["Contato", "Entrou no funil como lead"],
  ["O que pediu", "40 unidades, com entrega em Palmas"],
  ["Prazo", "Este mês"],
  ["Intenção de compra", "Alta"],
  ["Próxima ação", "Enviar o orçamento"],
];

export default function VendaEspiao() {
  return (
    <PaginaDeVenda tema="sv-espiao" cta="Quero o espião" titulo="S.P.Y. — Quem está anotando as suas vendas?"
      descricao="O Agente Secreto de Vendas acompanha o WhatsApp conectado de cada vendedor e leva a conversa para o funil.">
      <section className="sp-hero" aria-labelledby="sv-h1">
        <div className="sp-wrap sv-duas">
          <div>
            <p className="sv-carimbo">Dossiê da sua operação comercial</p>
            <h1 id="sv-h1" className="sv-h1">Sua equipe conversa o dia inteiro. <span className="sp-grad">Quem está anotando?</span></h1>
            <p className="sp-hero__sub sv-sub">
              O Agente Secreto de Vendas acompanha o WhatsApp conectado de cada vendedor e leva a conversa para o funil. O que o cliente disse deixa de morar só no celular de alguém.
            </p>
            <a href="#planos" className="sp-btn sp-btn--primary">{BOTAO}<ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" /></a>
          </div>
          <div className="sv-emblema"><SpyEmblem /></div>
        </div>
      </section>

      <section className="sp-section" aria-labelledby="sv-dia">
        <div className="sp-wrap sv-estreito">
          <h2 id="sv-dia" className="sp-h2" {...rv()}>Um dia comum, sem ninguém anotando.</h2>
          <p className="sp-lede" {...rv(1)}>Você já viu este filme. Ninguém fez nada de errado: a informação só ficou no lugar errado.</p>
          <ol className="sv-linha">
            {DIA.map(([hora, fato, depois], i) => (
              <li key={hora} {...rv(i)}><time>{hora}</time><div><strong>{fato}</strong><p>{depois}</p></div></li>
            ))}
          </ol>
          <p className="sv-legenda">Cena ilustrativa.</p>
        </div>
      </section>

      <section className="sp-section" aria-labelledby="sv-rel">
        <div className="sp-wrap sv-duas">
          <div {...rv()}>
            <h2 id="sv-rel" className="sp-h2">A mesma conversa, com o espião na equipe.</h2>
            <p className="sp-lede">A mensagem chega, e o time passa a enxergar quem pediu, o que pediu e o que fazer agora. Depois é só perguntar à Aurora quem ficou sem contato.</p>
          </div>
          <div className="sv-dossie" {...rv(1)}>
            <span className="sv-carimbo">Exemplo ilustrativo</span>
            <p className="sv-fala">“Vocês entregam em Palmas? Preciso de 40 unidades ainda este mês.”</p>
            <dl>{DOSSIE.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}</dl>
          </div>
        </div>
      </section>

      <section className="sp-section" aria-labelledby="sv-regras">
        <div className="sp-wrap">
          <h2 id="sv-regras" className="sp-h2" {...rv()}>As regras do agente.</h2>
          <div className="sv-colunas">
            <div className="sv-dossie" {...rv()}>
              <h3>O que ele faz</h3>
              <ul>{["Acompanha os números de WhatsApp que a empresa conecta", "Leva a conversa de venda para o funil", "Dá à Aurora o que ela precisa para apontar quem está sem resposta"].map((t) => (<li key={t}><Check size={18} aria-hidden="true" />{t}</li>))}</ul>
            </div>
            <div className="sv-dossie sv-dossie--nao" {...rv(1)}>
              <h3>O que ele não faz</h3>
              <ul>{["Não acompanha número que a empresa não conectou", "Não transforma gente da própria equipe em lead", "Não substitui o vendedor: quem fecha é o seu time"].map((t) => (<li key={t}><X size={18} aria-hidden="true" />{t}</li>))}</ul>
            </div>
          </div>
        </div>
      </section>

      <PlanosDeVenda titulo="Quantas pessoas entram na operação?" texto="Cada pessoa recebe o Agente Secreto de Vendas e a Aurora, com o CRM junto." botao={(n) => `Recrutar para ${n}`} />
      <Perguntas itens={[...PERGUNTAS.slice(3), ...PERGUNTAS.slice(0, 3)]} />
      <Chamada titulo="A próxima conversa já pode ser anotada." texto="Escolha o tamanho do time e faça o pedido pelo checkout." botao={BOTAO} />
    </PaginaDeVenda>
  );
}
