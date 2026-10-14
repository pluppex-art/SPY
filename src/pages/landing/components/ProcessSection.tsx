import { rv } from "../reveal";
import { START_STEPS as STEPS } from "../content";
export function ProcessSection() {
  return (
    <section id="implantacao" className="sp-section" aria-labelledby="sp-impl-title">
      <div className="sp-wrap">
        <h2 id="sp-impl-title" className="sp-h2" {...rv()}>
          Do primeiro acesso à operação conectada.
        </h2>
        <p className="sp-lede" {...rv(1)}>Um processo acompanhado, em cinco etapas. O prazo depende do tamanho e do segmento da operação.</p>
        <ol className="sp-steps">
          {STEPS.map(([title, text], i) => (
            <li key={title} {...rv(i)}>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
