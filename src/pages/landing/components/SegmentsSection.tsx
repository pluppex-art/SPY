import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Stethoscope, Car, Building2, ShoppingCart, Sun, GraduationCap } from "lucide-react";
import { TabsBar } from "./TabsBar";
import { SEGMENTS } from "../content";
import { rv } from "../reveal";

const ICONS: Record<string, ReactNode> = {
  clinica: <Stethoscope size={18} strokeWidth={1.75} aria-hidden="true" />,
  automotivo: <Car size={18} strokeWidth={1.75} aria-hidden="true" />,
  imobiliaria: <Building2 size={18} strokeWidth={1.75} aria-hidden="true" />,
  varejo: <ShoppingCart size={18} strokeWidth={1.75} aria-hidden="true" />,
  solar: <Sun size={18} strokeWidth={1.75} aria-hidden="true" />,
  educacao: <GraduationCap size={18} strokeWidth={1.75} aria-hidden="true" />,
};

export function SegmentsSection() {
  const [id, setId] = useState(SEGMENTS[0].id);
  const seg = SEGMENTS.find((s) => s.id === id)!;

  return (
    <section id="nichos" className="sp-section sp-band" aria-labelledby="sp-nichos-title">
      <div className="sp-wrap">
        <h2 id="sp-nichos-title" className="sp-h2" {...rv()}>
          Módulos prontos para o seu segmento.
        </h2>
        <p className="sp-lede" {...rv(1)}>
          Além do CRM e do financeiro, cada empresa liga os módulos do seu nicho. Escolha um segmento para ver os módulos e um exemplo de uso.
        </p>

        <div {...rv(2)}>
          <TabsBar
            prefix="seg"
            label="Segmentos"
            className="sp-tabs--chips"
            active={id}
            onChange={setId}
            items={SEGMENTS.map((s) => ({ id: s.id, label: s.name, icon: ICONS[s.id] }))}
          />
        </div>

        <div role="tabpanel" id="seg-panel" aria-labelledby={`seg-tab-${id}`} className="sp-seg" key={id}>
          <div className="sp-seg__col" data-anim="panel">
            <h3>Módulos de {seg.name.toLowerCase()}</h3>
            <ul className="sp-seg__mods">
              {seg.modules.map((m, i) => (
                <li key={m} style={{ ["--d" as string]: `${i * 40}ms` }}>
                  {m}
                </li>
              ))}
            </ul>
          </div>
          <div className="sp-seg__col" data-anim="panel">
            <h3>{seg.scenarioTitle}</h3>
            <ol className="sp-seg__steps">
              {seg.scenario.map((s, i) => (
                <li key={s} style={{ ["--d" as string]: `${i * 60}ms` }}>
                  {s}
                </li>
              ))}
            </ol>
            <p className="sp-caption">Exemplo ilustrativo de uso, montado com recursos do produto.</p>
            <Link to={seg.form} className="sp-btn sp-btn--primary" style={{ marginTop: 16 }}>
              Falar sobre {seg.name.toLowerCase()}
              <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
