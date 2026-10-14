import { ArrowDown, X, Check } from "lucide-react";
import { PROBLEM_PAINS, PROBLEM_WITHOUT, PROBLEM_WITH } from "../content";
import { rv } from "../reveal";

export function ProblemSection() {
  return (
    <section id="problema" className="sp-section" aria-labelledby="sp-problema-title">
      <div className="sp-wrap">
        <h2 id="sp-problema-title" className="sp-h2" {...rv()}>
          Sua empresa já recebe oportunidades. O problema é o que acontece depois.
        </h2>
        <p className="sp-lede" {...rv(1)}>
          Um lead chega pelo WhatsApp, alguém responde, o cliente demonstra interesse e a conversa para. O follow-up não acontece e a oportunidade que poderia virar receita desaparece. O problema não é necessariamente a falta de leads: é a falta de operação sobre eles.
        </p>

        <div className="sp-prob">
          <div className="sp-prob__col" {...rv(2)}>
            <h3>Sem operação</h3>
            <ol>
              {PROBLEM_WITHOUT.map((t, i) => (
                <li key={t}>
                  <X size={16} strokeWidth={2} aria-hidden="true" />
                  {t}
                  {i < PROBLEM_WITHOUT.length - 1 && <ArrowDown className="sp-prob__arrow" size={14} strokeWidth={1.75} aria-hidden="true" />}
                </li>
              ))}
            </ol>
          </div>
          <div className="sp-prob__col sp-prob__col--good" {...rv(3)}>
            <h3>Com o S.P.Y.</h3>
            <ol>
              {PROBLEM_WITH.map((t, i) => (
                <li key={t}>
                  <Check size={16} strokeWidth={2} aria-hidden="true" />
                  {t}
                  {i < PROBLEM_WITH.length - 1 && <ArrowDown className="sp-prob__arrow" size={14} strokeWidth={1.75} aria-hidden="true" />}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <ul className="sp-pains" aria-label="Sinais de que falta operação" {...rv(2)}>
          {PROBLEM_PAINS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
