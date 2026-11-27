import { Link } from "react-router-dom";
import { COMPLEMENTS } from "../content";
import { rv } from "../reveal";

/** Faixa pequena com os módulos que complementam os pilares: o destaque da página é dos quatro pilares. */
export function ComplementSection() {
  return (
    <section id="complementares" className="sp-compl" aria-labelledby="sp-compl-title">
      <div className="sp-wrap">
        <div className="sp-compl__box" {...rv()}>
          <div>
            <h2 id="sp-compl-title">Módulos que complementam</h2>
            <p>Contratados à parte, só se fizerem sentido para a sua operação.</p>
          </div>
          <ul aria-label="Módulos por área">
            {COMPLEMENTS.areas.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <ul aria-label="Módulos por segmento">
            <li className="sp-compl__rotulo">Por segmento:</li>
            {COMPLEMENTS.segments.map((s) => (
              <li key={s.name}>
                <Link to={s.form}>{s.name}</Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
