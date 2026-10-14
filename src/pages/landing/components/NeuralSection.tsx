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
          <h2 id="sp-aurora-title" className="sp-h2">
            Aurora, a assistente de IA que conhece o seu CRM.
          </h2>
          <p className="sp-lede">
            Ela consulta os dados do seu ambiente e respeita as permissões de quem pergunta. Você escolhe quais agentes
            ficam ligados em cada empresa.
          </p>
          <ul className="sp-aurora__list">
            {CAPS.map(([Icon, title, text]) => (
              <li key={title}>
                <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                <strong>{title}</strong>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <figure style={{ margin: 0 }}>
          <div className="sp-chat" role="img" aria-label="Exemplo ilustrativo de conversa com a Aurora">
            <div className="sp-chat__head" aria-hidden="true">
              <img src="/avatar-ia.png" alt="" width={40} height={40} loading="lazy" />
              <div>
                <strong>Aurora</strong>
                <small>Assistente de IA do S.P.Y.</small>
              </div>
            </div>
            <div className="sp-bubble sp-bubble--user" aria-hidden="true">
              Quais são meus compromissos amanhã?
            </div>
            <div className="sp-bubble sp-bubble--ai" aria-hidden="true">
              Consulto a sua agenda do Google Calendar conectada e listo horário, local e link da reunião.
              <small>Usa só os dados do seu usuário.</small>
            </div>
            <div className="sp-bubble sp-bubble--user" aria-hidden="true">
              Quais tarefas estão atrasadas?
            </div>
          </div>
          <figcaption className="sp-caption">Exemplo ilustrativo. Agenda e tarefas aparecem quando o Google está conectado.</figcaption>
        </figure>
      </div>
    </section>
  );
}
