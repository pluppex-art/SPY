import { ProductShot } from "./ProductShot";
import { AuroraChat } from "./AuroraChat";
import { rv } from "../reveal";
import { MessageSquareText, ClipboardCheck, Headphones, UserRoundCheck, ShieldCheck, Route } from "lucide-react";

const CAPS = [
  [MessageSquareText, "Chat com a sua operação", "Pergunte em linguagem natural sobre agenda, tarefas e pipeline."],
  [UserRoundCheck, "Copiloto do lead", "Apoio ao vendedor na qualificação e na próxima ação de cada lead."],
  [ClipboardCheck, "Auditoria de pipeline e performance", "Revisa o funil e o desempenho do time e aponta o que merece atenção."],
  [Headphones, "Análise de calls", "Apoio na leitura das ligações comerciais."],
  [Route, "Rodízio de leads de formulário", "Distribuição automática entre os vendedores, via automação com n8n."],
  [ShieldCheck, "Auditoria de configurações", "Confere o ambiente do tenant e sugere ajustes."],
] as const;

export function NeuralSection() {
  return (
    <section id="aurora" className="sp-section sp-aurora" aria-labelledby="sp-aurora-title">
      <div className="sp-wrap sp-aurora__grid">
        <div>
          <h2 id="sp-aurora-title" className="sp-h2" {...rv()}>
            Aurora, a assistente de IA que conhece o seu CRM.
          </h2>
          <p className="sp-lede" {...rv(1)}>
            Ela consulta os dados do seu ambiente e respeita as permissões de quem pergunta. Você escolhe quais agentes
            ficam ligados em cada empresa.
          </p>
          <ul className="sp-aurora__list">
            {CAPS.map(([Icon, title, text], i) => (
              <li key={title} {...rv(i + 2)}>
                <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                <strong>{title}</strong>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <ProductShot
          slot="aurora"
          alt="Conversa com a Aurora, assistente de IA do S.P.Y."
          fallback={
            <figure style={{ margin: 0 }} {...rv(1)}>
              <AuroraChat />
              <figcaption className="sp-caption">Exemplo ilustrativo. Agenda e tarefas aparecem quando o Google está conectado.</figcaption>
            </figure>
          }
        />
      </div>
    </section>
  );
}
