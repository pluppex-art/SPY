import { rv } from "../reveal";
import { Link } from "react-router-dom";
import { Check, Star, ArrowRight } from "lucide-react";
import { CREDITS_COPY } from "../plansData";
import { usePublicPlans } from "../../../lib/usePublicPlans";

export function PlansSection() {
  const { plans: PLANS, tokenTiers: TOKEN_TIERS } = usePublicPlans();
  return (
    <section id="planos" className="sp-section sp-band" aria-labelledby="sp-planos-title">
      <div className="sp-wrap">
        <h2 id="sp-planos-title" className="sp-h2" {...rv()}>
          Escolha o nível de autonomia da sua operação.
        </h2>
        <p className="sp-lede" {...rv(1)}>Encontra, entende e age sobre oportunidades de vendas. Valores mensais, mais a implantação de cada plano.</p>

        <div className="sp-plans">
          {PLANS.map((p, i) => (
            <div key={p.id} {...rv(i)}>
            <article className={`sp-plan${p.highlight ? " sp-plan--hl" : ""}`} aria-labelledby={`sp-plan-${p.id}`}>
              {p.badgeTop && (
                <span className="sp-plan__badge">
                  <Star size={14} strokeWidth={1.75} aria-hidden="true" />
                  {p.badgeTop.replace(/^★\s*/, "")}
                </span>
              )}
              <h3 id={`sp-plan-${p.id}`}>{p.name}</h3>
              <p className="sp-plan__tag">{p.tagline}</p>
              <div className="sp-price">
                <span>R$ </span>
                <strong>{p.monthlyPrice}</strong>
                <span> /mês</span>
                {p.setupPrice && (
                  <small>
                    Implantação: <b>{p.setupPrice}</b>
                  </small>
                )}
              </div>
              <p className="sp-plan__head">{p.featuresHeader}</p>
              <ul>
                {p.features.map((f) => (
                  <li key={f}>
                    <Check size={16} strokeWidth={2} aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link to="/f/spy" className={`sp-btn ${p.highlight ? "sp-btn--primary" : "sp-btn--outline"}`}>
                {p.ctaText}
                <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            </article>
            </div>
          ))}
        </div>

        <div className="sp-credits" {...rv()}>
          <div>
            <h3>{CREDITS_COPY.title}</h3>
            <p>{CREDITS_COPY.description}</p>
            <dl>
              {TOKEN_TIERS.map((t) => (
                <div key={t.credits}>
                  <dt>{t.credits}</dt>
                  <dd>{t.price}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h3>{CREDITS_COPY.extraUsage}</h3>
            <p>{CREDITS_COPY.disclaimer}</p>
          </div>
          <div>
            <h3>{CREDITS_COPY.controlTitle}</h3>
            <ul className="sp-credits__ctl">
              {CREDITS_COPY.controlItems.map((c) => (
                <li key={c.id}>
                  <h4>{c.title}</h4>
                  <p>{c.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
