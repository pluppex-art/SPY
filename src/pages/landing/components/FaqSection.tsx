import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { CREDITS_COPY } from "../../lp/plansData";

const FAQ = [
  ["Os dados da minha empresa ficam separados das outras?", "Sim. O S.P.Y. é multiempresa: cada empresa tem o seu ambiente isolado, e o acesso respeita as permissões de cada usuário."],
  ["Preciso usar todos os módulos?", "Não. Além do CRM e do financeiro, cada empresa liga apenas os módulos do seu segmento: varejo, automotivo, energia solar, imobiliária, clínica ou educação."],
  ["Como funciona a implantação?", "Você começa pelo formulário, contando como vende hoje. A equipe configura o ambiente, liga os módulos e as integrações e libera o acesso da sua equipe. Cada plano tem um valor de implantação, informado na seção Planos."],
  ["O que são créditos de inteligência?", `${CREDITS_COPY.description} Também é possível usar a sua própria API (OpenAI, Google Gemini ou provedores compatíveis).`],
  ["Com o que o S.P.Y. se integra?", "Com WhatsApp, Google Agenda e Google Tarefas (leitura), além de automações via n8n e webhooks. Tudo é conectado pela Central de Integrações."],
  ["Existe fidelidade? Como é o suporte?", "Não há fidelidade: você cancela quando quiser. O suporte é humano, com acompanhamento ativo da equipe do S.P.Y."],
];

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="sp-section" aria-labelledby="sp-faq-title">
      <div className="sp-wrap">
        <h2 id="sp-faq-title" className="sp-h2">
          Perguntas frequentes.
        </h2>
        <div className="sp-faq">
          {FAQ.map(([q, a], i) => {
            const isOpen = open === i;
            return (
              <div className="sp-faq__item" key={q}>
                <h3 style={{ font: "inherit" }}>
                  <button
                    type="button"
                    className="sp-faq__q"
                    aria-expanded={isOpen}
                    aria-controls={`sp-faq-a-${i}`}
                    id={`sp-faq-q-${i}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    {q}
                    <ChevronDown size={20} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </h3>
                <div id={`sp-faq-a-${i}`} role="region" aria-labelledby={`sp-faq-q-${i}`} hidden={!isOpen}>
                  <p className="sp-faq__a">{a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
