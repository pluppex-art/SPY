import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { rv } from "../reveal";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = (n: number, d = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });

function NumberField({ id, label, hint, value, onChange, min = 0, max, step = 1, suffix }: { id: string; label: string; hint?: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  return (
    <div className="sp-field">
      <label htmlFor={id}>{label}</label>
      <div className="sp-numfield">
        <input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} />
        {suffix && <span aria-hidden="true">{suffix}</span>}
      </div>
      {hint && <p className="sp-field__hint">{hint}</p>}
    </div>
  );
}

/** Simulador com os números do próprio visitante. A hipótese de ganho é editável e começa neutra; não é promessa de resultado. */
export function RoiSimulator() {
  const [leads, setLeads] = useState(250);
  const [ticket, setTicket] = useState(2500);
  const [conv, setConv] = useState(8);
  const [gain, setGain] = useState(10);

  const L = Number.isFinite(leads) ? Math.max(0, leads) : 0;
  const T = Number.isFinite(ticket) ? Math.max(0, ticket) : 0;
  const C = Number.isFinite(conv) ? Math.min(100, Math.max(0, conv)) : 0;
  const G = Number.isFinite(gain) ? Math.max(0, gain) : 0;

  const dealsNow = (L * C) / 100;
  const revenueNow = dealsNow * T;
  const dealsExtra = dealsNow * (G / 100);
  const extraMonth = dealsExtra * T;

  return (
    <section id="simulador" className="sp-section sp-band" aria-labelledby="sp-sim-title">
      <div className="sp-wrap">
        <h2 id="sp-sim-title" className="sp-h2" {...rv()}>
          Quanto vale acompanhar cada lead de perto?
        </h2>
        <p className="sp-lede" {...rv(1)}>
          Informe os números da sua operação e veja uma conta simples. A hipótese de ganho é sua: você escolhe quanto acredita que a conversão pode subir.
        </p>

        <div className="sp-sim" {...rv(2)}>
          <form className="sp-sim__in" onSubmit={(e) => e.preventDefault()} aria-label="Dados da simulação">
            <NumberField id="sim-leads" label="Leads recebidos por mês" value={leads} onChange={setLeads} max={100000} />
            <NumberField id="sim-ticket" label="Ticket médio por venda" value={ticket} onChange={setTicket} step={50} suffix="R$" />
            <NumberField id="sim-conv" label="Conversão atual de lead em venda" value={conv} onChange={setConv} max={100} step={0.5} suffix="%" />
            <NumberField id="sim-gain" label="Hipótese: aumento relativo na conversão" hint="Valor editável e sem base em estatística. Com 10%, uma conversão de 8% iria a 8,8%." value={gain} onChange={setGain} max={200} step={1} suffix="%" />
          </form>
          <div className="sp-sim__out" role="status" aria-live="polite">
            <p className="sp-sim__label">Receita mensal estimada hoje</p>
            <p className="sp-sim__num">{brl(revenueNow)}</p>
            <p className="sp-sim__small">{num(dealsNow)} vendas por mês</p>
            <hr />
            <p className="sp-sim__label">Com a sua hipótese de {num(G, 0)}% a mais</p>
            <p className="sp-sim__num sp-sim__num--hl">+ {brl(extraMonth)} por mês</p>
            <p className="sp-sim__small">{num(dealsExtra)} vendas a mais por mês · {brl(extraMonth * 12)} por ano</p>
            <p className="sp-sim__note">Simulação com os seus números. Não é promessa de resultado.</p>
            <a href="#contato" className="sp-link">
              Conversar sobre a minha operação <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
