import { AURORA_AGENTS, EXAMPLE_ANALYSIS, EXAMPLE_MESSAGE } from "../content";
import { rv } from "../reveal";

export function AuroraAgents() {
  return (
    <div className="sp-agents">
      <h3 {...rv()}>Os agentes da Aurora</h3>
      <p {...rv(1)}>Cada empresa escolhe quais agentes deixar ligados.</p>
      <ul>
        {AURORA_AGENTS.map((a, i) => (
          <li key={a.name} {...rv(i % 6)}>
            <strong>{a.name}</strong>
            {a.role !== a.name.replace(/^Agente (de |)/, "") && <span className="sp-agents__role">{a.role}</span>}
            <span>{a.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OpportunityExample() {
  return (
    <div className="sp-example">
      <h3 {...rv()}>Uma conversa pode esconder uma oportunidade.</h3>
      <div className="sp-example__grid">
        <figure style={{ margin: 0 }} {...rv(1)}>
          <p className="sp-example__who">Cliente em potencial</p>
          <blockquote>{EXAMPLE_MESSAGE}</blockquote>
        </figure>
        <dl {...rv(2)}>
          {EXAMPLE_ANALYSIS.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="sp-caption">Exemplo ilustrativo. Sugestões geradas por IA podem conter imprecisões e pedem revisão humana.</p>
    </div>
  );
}
