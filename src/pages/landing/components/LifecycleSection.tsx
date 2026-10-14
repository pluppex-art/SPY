import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { TabsBar } from "./TabsBar";
import { PipelineDemo } from "./PipelineDemo";
import { LIFECYCLE } from "../content";
import { rv } from "../reveal";

/** "Do lead ao dinheiro": passos clicáveis. Avança sozinho até a primeira interação (e nunca com reduced-motion). */
export function LifecycleSection() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(LIFECYCLE[0].id);
  const [touched, setTouched] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.5 });
  const idx = LIFECYCLE.findIndex((s) => s.id === active);
  const step = LIFECYCLE[idx];

  useEffect(() => {
    if (touched || reduce || !inView) return;
    const t = window.setTimeout(() => {
      if (!document.hidden) setActive(LIFECYCLE[(idx + 1) % LIFECYCLE.length].id);
    }, 4800);
    return () => window.clearTimeout(t);
  }, [idx, touched, reduce, inView]);

  const pick = (id: string, byUser: boolean) => {
    if (byUser) setTouched(true);
    setActive(id);
  };

  return (
    <section id="recursos" className="sp-section" aria-labelledby="sp-recursos-title">
      <div className="sp-wrap">
        <h2 id="sp-recursos-title" className="sp-h2" {...rv()}>
          Do lead ao dinheiro, sem sair do sistema.
        </h2>
        <p className="sp-lede" {...rv(1)}>
          Vendas e financeiro usam a mesma base. O que acontece no pipeline chega ao caixa sem digitar duas vezes. Clique em cada etapa para ver o que o S.P.Y. faz.
        </p>

        <div className="sp-life" ref={ref} {...rv(2)}>
          <div className="sp-life__steps">
            <TabsBar
              prefix="life"
              label="Etapas do ciclo comercial"
              className="sp-tabs--steps"
              active={active}
              onChange={pick}
              items={LIFECYCLE.map((s, i) => ({ id: s.id, label: s.label, icon: <span className="sp-tab__n" aria-hidden="true">{i + 1}</span> }))}
            />
            <div className="sp-life__bar" aria-hidden="true">
              <span style={{ transform: `scaleX(${(idx + 1) / LIFECYCLE.length})` }} />
            </div>
            <div role="tabpanel" id="life-panel" aria-labelledby={`life-tab-${step.id}`} className="sp-life__panel" key={step.id} data-anim="panel" tabIndex={0}>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <ul>
                {step.points.map((p) => (
                  <li key={p}>
                    <Check size={16} strokeWidth={2} aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="sp-life__demo">
            <PipelineDemo />
            <p className="sp-caption">Exemplo ilustrativo, com dados fictícios.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
