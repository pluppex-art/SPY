import { ProductShot, shotUrl } from "./ProductShot";
import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  LayoutDashboard,
  Columns3,
  CalendarDays,
  Wallet,
  Mail,
  BarChart3,
  Sparkles,
} from "lucide-react";

const EASE = [0.23, 1, 0.32, 1] as const;

const SIDE = [
  { icon: LayoutDashboard, label: "Visão Geral" },
  { icon: Columns3, label: "Leads & Pipeline", current: true },
  { icon: CalendarDays, label: "Agenda & Reuniões" },
  { icon: Wallet, label: "Gestão Financeira" },
  { icon: Mail, label: "Mensageria" },
  { icon: BarChart3, label: "Inteligência & BI" },
];

const COLUMNS = [
  { name: "Novo", leads: [["Pedido de orçamento", "Formulário do site"], ["Dúvida sobre planos", "WhatsApp"]] },
  { name: "Em contato", leads: [["Retorno agendado", "Reunião na agenda"]] },
  { name: "Proposta", leads: [["Proposta enviada", "Aguardando resposta"]] },
  { name: "Fechado", leads: [["Contrato assinado", "Fatura gerada no financeiro"]], won: true },
];

export function HeroSection() {
  const reduce = useReducedMotion();

  const item = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, ease: EASE, delay: i * 0.06 },
        };

  return (
    <section className="sp-hero" aria-labelledby="sp-hero-title">
      <div className="sp-wrap sp-hero__grid">
        <div>
          <motion.h1 id="sp-hero-title" {...item(0)}>
            Do lead ao financeiro, em um só sistema.
          </motion.h1>
          <motion.p className="sp-hero__sub" {...item(1)}>
            O S.P.Y. é o CRM e ERP para pequenas e médias empresas: pipeline de vendas, propostas, contratos,
            contas a pagar e a receber, e a Aurora, assistente de IA que trabalha com os dados da sua operação.
          </motion.p>
          <motion.div className="sp-hero__actions" {...item(2)}>
            <Link to="/f/spy" className="sp-btn sp-btn--primary">
              Implantar o S.P.Y.
              <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
            </Link>
            <Link to="/login" className="sp-link">
              Já sou cliente: acessar
            </Link>
          </motion.div>
          <motion.p className="sp-hero__note" {...item(3)}>
            Cada empresa tem seu ambiente isolado, com os módulos do seu segmento.
          </motion.p>
        </div>

        <motion.figure
          style={{ margin: 0 }}
          {...(reduce
            ? {}
            : {
                initial: { opacity: 0, y: 20 },
                animate: { opacity: 1, y: 0 },
                transition: { duration: 0.6, ease: EASE, delay: 0.2 },
              })}
        >
          <ProductShot
            slot="pipeline"
            eager
            alt="Tela de Leads e Pipeline do S.P.Y."
            fallback={
              <div className="sp-app" role="img" aria-label="Exemplo ilustrativo da tela de Leads e Pipeline do S.P.Y.">
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
              <div className="sp-board">
                {COLUMNS.map((c) => (
                  <div className="sp-col" key={c.name}>
                    <h3>
                      {c.name}
                      <span>{c.leads.length}</span>
                    </h3>
                    {c.leads.map(([t, s]) => (
                      <div key={t} className={`sp-lead${c.won ? " sp-lead--won" : ""}`}>
                        <span>
                          {t}
                          <small>{s}</small>
                        </span>
                        {c.won && <Check size={16} strokeWidth={2} />}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="sp-app__foot" aria-hidden="true">
              <Sparkles size={16} strokeWidth={1.75} />
              <span>Aurora: pergunte sobre o pipeline, a agenda ou as tarefas da equipe.</span>
            </div>
          </div>
            }
          />
          {!shotUrl("pipeline") && <figcaption className="sp-caption">Ilustração com dados de exemplo.</figcaption>}
        </motion.figure>
      </div>
    </section>
  );
}
