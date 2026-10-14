import { Check } from "lucide-react";
import { ProductShot } from "./ProductShot";
import { FINANCE_GROUPS } from "../content";
import { rv } from "../reveal";

export function FinanceSection() {
  return (
    <section id="financeiro" className="sp-section" aria-labelledby="sp-fin-title">
      <div className="sp-wrap">
        <h2 id="sp-fin-title" className="sp-h2" {...rv()}>
          Um financeiro completo, ligado às vendas.
        </h2>
        <p className="sp-lede" {...rv(1)}>
          Contas a pagar e a receber, fluxo de caixa, DRE e conciliação de extrato. Cada venda aceita já nasce no contas a receber.
        </p>

        <div className="sp-fin" >
          <div className="sp-fin__groups">
            {FINANCE_GROUPS.map((g, i) => (
              <div key={g.title} {...rv(i)}>
                <h3>{g.title}</h3>
                <ul>
                  {g.items.map((it) => (
                    <li key={it}>
                      <Check size={16} strokeWidth={2} aria-hidden="true" />
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div {...rv(1)} className="sp-fin__shot">
            <ProductShot slot="financeiro" alt="Painel financeiro do S.P.Y. com saldo, receitas, despesas e fluxo de caixa" />
          </div>
        </div>
      </div>
    </section>
  );
}
