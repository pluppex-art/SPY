import { Handshake, HeartHandshake, MessagesSquare, UsersRound } from "lucide-react";
import { OTHER_AGENTS } from "../content";
import { rv } from "../reveal";

const ICONS = { interno: UsersRound, julia: MessagesSquare, closer: Handshake, cs: HeartHandshake };

/** Apresentação curta dos agentes contratados à parte: o destaque da página continua nos quatro pilares. */
export function AgentsSection() {
  return (
    <section id="agentes" className="sp-outros" aria-labelledby="sp-outros-title">
      <div className="sp-wrap">
        <h2 id="sp-outros-title" {...rv()}>
          Outros agentes para a sua operação
        </h2>
        <p {...rv(1)}>O Agente Secreto de Vendas e a Aurora já vêm no plano. Estes você contrata à parte, quando precisar.</p>
        <ul>
          {OTHER_AGENTS.map((a, i) => {
            const Icon = ICONS[a.id];
            return (
              <li key={a.id} {...rv(i)}>
                <span className="sp-outros__icone">
                  <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <h3>{a.name}</h3>
                <p>{a.text}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
