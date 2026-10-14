import { ProductShot } from "./ProductShot";
import { AuroraChat } from "./AuroraChat";
import { rv } from "../reveal";
import { MessageSquareText, UserRoundCheck, ClipboardCheck, Newspaper, ShieldCheck, Gauge } from "lucide-react";
import { AURORA_CAPS } from "../content";

const CAP_ICONS = [MessageSquareText, UserRoundCheck, ClipboardCheck, Newspaper, ShieldCheck, Gauge];

export function NeuralSection() {
  return (
    <section id="aurora" className="sp-section sp-aurora" aria-labelledby="sp-aurora-title">
      <div className="sp-wrap sp-aurora__grid">
        <div>
          <h2 id="sp-aurora-title" className="sp-h2" {...rv()}>
            Aurora, a assistente de IA que conhece o seu CRM.
          </h2>
          <p className="sp-lede" {...rv(1)}>
            A Aurora responde com os dados do seu ambiente: pipeline, reuniões, tarefas, financeiro, propostas, clientes e produtos. Pergunte em linguagem natural.
          </p>
          <ul className="sp-aurora__list">
            {AURORA_CAPS.map(([title, text], i) => {
              const Icon = CAP_ICONS[i];
              return (
              <li key={title} {...rv(i + 2)}>
                <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                <strong>{title}</strong>
                <span>{text}</span>
              </li>
              );
            })}
          </ul>
        </div>

        <div className="sp-aurora__visual">
          <ProductShot slot="aurora" alt="Tela da Aurora, assistente de IA do S.P.Y., respondendo perguntas sobre a operação" />
          <figure style={{ margin: 0 }} {...rv(1)}>
            <AuroraChat />
            <figcaption className="sp-caption">Exemplo ilustrativo de conversa. Agenda e tarefas aparecem quando o Google está conectado.</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
