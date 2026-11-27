/** Página de venda 2, "dinheiro parado": a conta com os números do visitante vem primeiro; frases curtas, visual claro. */
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { ProductShot } from "../landing/components/ProductShot";
import { rv } from "../landing/reveal";
import { valorParado } from "./conta";
import { Chamada, PaginaDeVenda, Perguntas, PlanosDeVenda } from "./comum";

const BOTAO = "Quero retomar essas vendas";
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Campo({ id, rotulo, sufixo, valor, mudar }: { id: string; rotulo: string; sufixo?: string; valor: string; mudar: (v: string) => void }) {
  return (
    <label className="sv-campo" htmlFor={id}>
      <span>{rotulo}</span>
      <span className="sv-campo__caixa">
        <input id={id} type="number" inputMode="decimal" min={0} value={valor} onChange={(e) => mudar(e.target.value)} />
        {sufixo && <em aria-hidden="true">{sufixo}</em>}
      </span>
    </label>
  );
}

const PASSOS: [string, string, string, string][] = [
  ["Capte", "A conversa entra no funil.", "O Agente Secreto de Vendas acompanha o WhatsApp conectado de cada vendedor.", "pipeline"],
  ["Enxergue", "Veja o que está esfriando.", "O CRM mostra os negócios parados e os que estão esquentando. A Aurora aponta quem ficou sem contato.", "dashboard"],
  ["Retome", "Cada retomada com dono.", "A retomada vira tarefa e compromisso na agenda. E você vê se o cliente abriu a proposta.", "tarefas"],
];

export default function VendaRecuperacao() {
  const [orcamentos, setOrcamentos] = useState("50");
  const [ticket, setTicket] = useState("1500");
  const [semRetorno, setSemRetorno] = useState("30");
  const parado = valorParado(Number(orcamentos), Number(ticket), Number(semRetorno));

  return (
    <PaginaDeVenda tema="sv-recupera" cta="Retomar vendas" titulo="S.P.Y. — Quanto está parado nos seus orçamentos?"
      descricao="Faça a conta com os seus números e veja como retomar orçamentos e negociações paradas.">
      <section className="sp-section sv-abre" aria-labelledby="sv-h1">
        <div className="sp-wrap sv-duas">
          <div>
            <h1 id="sv-h1" className="sv-h1">Quanto está parado nos orçamentos que <mark>ninguém retomou?</mark></h1>
            <p className="sp-lede">Você já fez o mais difícil. Atraiu o cliente e mandou o preço. Faça a conta do que ficou pelo caminho.</p>
          </div>
          <form className="sv-conta" onSubmit={(e) => e.preventDefault()} aria-label="Conta do valor parado">
            <Campo id="c-orc" rotulo="Orçamentos enviados por mês" valor={orcamentos} mudar={setOrcamentos} />
            <Campo id="c-ticket" rotulo="Valor médio de cada orçamento" sufixo="R$" valor={ticket} mudar={setTicket} />
            <Campo id="c-sem" rotulo="Quantos ficam sem retorno" sufixo="%" valor={semRetorno} mudar={setSemRetorno} />
            <div className="sv-conta__resultado" role="status" aria-live="polite">
              <span>Parado por mês</span>
              <strong>{brl(parado.mes)}</strong>
              <span>{brl(parado.ano)} em 12 meses</span>
            </div>
            <a href="#planos" className="sp-btn sp-btn--primary">{BOTAO}<ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" /></a>
            <small>Soma das propostas sem retorno, com os seus números. Não é promessa de venda.</small>
          </form>
        </div>
      </section>

      {PASSOS.map(([verbo, titulo, texto, tela], i) => (
        <section key={verbo} className="sp-section sv-passo" aria-label={verbo}>
          <div className={`sp-wrap sv-duas${i % 2 ? " sv-duas--invertida" : ""}`}>
            <div {...rv()}>
              <span className="sv-numero">{i + 1}</span>
              <p className="sv-verbo">{verbo}.</p>
              <h2 className="sp-h2">{titulo}</h2>
              <p className="sp-lede">{texto}</p>
            </div>
            <div {...rv(1)}><ProductShot slot={tela} alt={`Tela do S.P.Y.: ${titulo}`} /></div>
          </div>
        </section>
      ))}

      <PlanosDeVenda titulo="Quem vai retomar com você?" texto="Escolha pelo número de pessoas que vendem. Cada uma recebe o Agente Secreto de Vendas e a Aurora." botao={(n) => `Retomar com ${n}`} />
      <Perguntas />
      <Chamada titulo="O próximo orçamento não precisa sumir." texto="Comece pelo time que você tem hoje." botao={BOTAO} />
    </PaginaDeVenda>
  );
}
