/** Página de venda 4, direta ao preço: planos na abertura, comparação lado a lado, pouco texto. */
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { rv } from "../landing/reveal";
import { Chamada, PaginaDeVenda, Perguntas, PlanosDeVenda } from "./comum";

const BOTAO = "Assinar agora";

const COMPARA: [string, string, string][] = [
  ["O que o cliente disse", "No celular de cada vendedor", "No funil, junto do cliente"],
  ["Quem está sem resposta", "Depende de alguém lembrar", "A Aurora aponta"],
  ["Negócio esfriando", "Descoberto tarde", "Aparece no painel do CRM"],
  ["Proposta", "Arquivo enviado", "Link com aceite online e aviso de visualização"],
  ["Retomada", "Anotação solta", "Tarefa e compromisso na agenda"],
  ["Números para decidir", "Planilha montada à mão", "Painel e relatórios"],
];

const A_PARTE: [string, string][] = [
  ["Radar", "Busca empresas e acompanha grupos cadastrados."],
  ["Agente Secreto Interno", "Transforma as mensagens dos grupos da equipe em tarefas."],
  ["Júlia", "Vendedora de IA que atende e qualifica quem chega."],
  ["Financeiro", "Contas, cobranças, fluxo de caixa e DRE."],
  ["Marketing", "Campanhas, conteúdo, landing pages e formulários."],
  ["Módulo do seu segmento", "Imobiliária, automotivo, varejo, solar, clínica ou educação."],
];

export default function VendaDireta() {
  return (
    <PaginaDeVenda tema="sv-direta" cta={BOTAO} titulo="S.P.Y. — Planos por tamanho de equipe"
      descricao="Planos de 3, 5 e 10 usuários, com Agente Secreto de Vendas, Aurora e CRM em cada um.">
      <section className="sv-faixa" aria-labelledby="sv-h1">
        <div className="sp-wrap">
          <h1 id="sv-h1" className="sv-h1">Escolha o tamanho do time. Comece.</h1>
          <p className="sp-lede">Agente Secreto de Vendas, Aurora e CRM para cada pessoa. Preço na tela, sem precisar pedir orçamento.</p>
        </div>
      </section>

      <PlanosDeVenda titulo="Planos" texto="Mensalidade por equipe, mais a implantação paga uma vez." botao={() => BOTAO} />

      <section className="sp-section sp-band" aria-labelledby="sv-compara">
        <div className="sp-wrap">
          <h2 id="sv-compara" className="sp-h2" {...rv()}>Como é hoje e como fica.</h2>
          <div className="sv-tabela" {...rv(1)}>
            <table>
              <thead><tr><th scope="col">Situação</th><th scope="col">Planilha e conversa solta</th><th scope="col">Com o S.P.Y.</th></tr></thead>
              <tbody>{COMPARA.map(([s, antes, depois]) => (<tr key={s}><th scope="row">{s}</th><td>{antes}</td><td>{depois}</td></tr>))}</tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="sp-section" aria-labelledby="sv-extra">
        <div className="sp-wrap">
          <h2 id="sv-extra" className="sp-h2" {...rv()}>Some quando precisar.</h2>
          <p className="sp-lede" {...rv(1)}>Contratados à parte, com a nossa equipe.</p>
          <ul className="sv-extras">{A_PARTE.map(([n, t], i) => (<li key={n} {...rv(i)}><h3>{n}</h3><p>{t}</p></li>))}</ul>
          <Link to="/contato" className="sp-link">Falar sobre os adicionais <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" /></Link>
        </div>
      </section>

      <Perguntas />
      <Chamada titulo="Preço visto, decisão tomada." texto="Preencha os dados, escolha o plano e pague por Pix." botao={BOTAO} />
    </PaginaDeVenda>
  );
}
