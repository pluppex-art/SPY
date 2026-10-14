import { useEffect, useRef, useState } from "react";
import { LayoutGroup, motion, useInView, useReducedMotion } from "motion/react";
import { Check, Columns3, Sparkles, Wallet, LayoutDashboard, CalendarDays, Mail, BarChart3 } from "lucide-react";

const EASE = [0.23, 1, 0.32, 1] as const;
const STEP_MS = 1600;
const STAGES = ["Novo", "Em contato", "Proposta", "Fechado"];
const SUBS = ["Formulário do site", "Reunião na agenda", "Aguardando resposta", "Contrato assinado"];
const SIDE = [
  { icon: LayoutDashboard, label: "Visão Geral" },
  { icon: Columns3, label: "Leads & Pipeline", current: true },
  { icon: CalendarDays, label: "Agenda & Reuniões" },
  { icon: Wallet, label: "Gestão Financeira" },
  { icon: Mail, label: "Mensageria" },
  { icon: BarChart3, label: "Inteligência & BI" },
];
const STATIC = [
  { id: "a", col: 0, title: "Dúvida sobre planos", sub: "WhatsApp" },
  { id: "b", col: 1, title: "Retorno agendado", sub: "Reunião na agenda" },
  { id: "c", col: 2, title: "Proposta enviada", sub: "Aguardando resposta" },
];

/**
 * Demonstração ilustrativa (dados de exemplo): um lead percorre Novo → Em contato → Proposta → Fechado
 * e a fatura aparece no financeiro. Roda uma vez, 1 passo a cada 1,6 s, só quando visível e com a aba ativa.
 * Com reduced-motion mostra direto o estado final.
 */
export function PipelineDemo() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const [step, setStep] = useState(reduce ? 4 : 0);

  useEffect(() => {
    if (reduce) {
      setStep(4);
      return;
    }
    if (!inView || step >= 4) return;
    let t: number | undefined;
    const tick = () => {
      if (document.hidden) {
        t = window.setTimeout(tick, 500);
        return;
      }
      setStep((s) => Math.min(4, s + 1));
    };
    t = window.setTimeout(tick, step === 0 ? 1400 : STEP_MS);
    return () => window.clearTimeout(t);
  }, [inView, step, reduce]);

  const col = Math.min(step, 3);
  const items = [...STATIC.map((s) => ({ ...s, moving: false })), { id: "m", col, title: "Pedido de orçamento", sub: SUBS[col], moving: true }];
  const transition = reduce ? { duration: 0 } : { duration: 0.55, ease: EASE };

  return (
    <div className="sp-app" role="img" aria-label="Exemplo ilustrativo: um lead passa pelas etapas do pipeline e a fatura é gerada no financeiro." ref={ref}>
      <div className="sp-app__bar" aria-hidden="true">
        <Columns3 size={16} strokeWidth={1.75} />
        <strong>Leads & Pipeline</strong>
      </div>
      <div className="sp-app__body" aria-hidden="true">
        <ul className="sp-app__side">
          {SIDE.map(({ icon: Icon, label, current }) => (
            <li key={label} aria-current={current ? "true" : undefined}>
              <Icon size={16} strokeWidth={1.75} />
              {label}
            </li>
          ))}
        </ul>
        <LayoutGroup>
          <div className="sp-board">
            {STAGES.map((name, c) => {
              const here = items.filter((i) => i.col === c);
              return (
                <div className="sp-col" key={name}>
                  <h3>
                    {name}
                    <span>{here.length}</span>
                  </h3>
                  {here.map((l) => {
                    const won = l.moving && c === 3;
                    return (
                      <motion.div
                        key={l.id}
                        layout="position"
                        layoutId={`lead-${l.id}`}
                        transition={transition}
                        className={`sp-lead${won ? " sp-lead--won" : ""}${l.moving ? " sp-lead--moving" : ""}`}
                      >
                        <span>
                          {l.title}
                          <small>{l.sub}</small>
                        </span>
                        {won && <Check size={16} strokeWidth={2} />}
                      </motion.div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </LayoutGroup>
      </div>
      <div className="sp-invoice" data-on={step >= 4} aria-hidden="true">
        <Wallet size={18} strokeWidth={1.75} />
        Fatura gerada no financeiro
      </div>
      <div className="sp-app__foot" aria-hidden="true">
        <Sparkles size={16} strokeWidth={1.75} />
        <span>Aurora: pergunte sobre o pipeline, a agenda ou as tarefas da equipe.</span>
      </div>
    </div>
  );
}
