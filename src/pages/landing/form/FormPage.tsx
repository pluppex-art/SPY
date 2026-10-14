import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { Logo } from "../../../components/ui/Logo";
import { LeadForm } from "./LeadForm";
import { NICHES } from "./formConfig";
import "../landing.css";

/** Página pública /f/:niche — mesmo visual claro/laranja da landing. */
export default function FormPage() {
  const { niche } = useParams();
  const cfg = NICHES[niche || ""] ?? NICHES.spy;
  const Icon = cfg.icon;

  return (
    <div className="sp-root sp-formpage">
      <header className="sp-header" data-scrolled="true">
        <div className="sp-wrap">
          <div className="sp-header__bar">
            <Link to="/landing" className="sp-brand" aria-label="S.P.Y. — voltar ao site">
              <Logo variant="full" color="orange" size={32} />
            </Link>
            <Link to="/landing" className="sp-link">
              <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" /> Voltar ao site
            </Link>
          </div>
        </div>
      </header>
      <main className="sp-wrap sp-formpage__grid">
        <div className="sp-formpage__intro">
          <span className="sp-formpage__icon" aria-hidden="true">
            <Icon size={28} strokeWidth={1.75} />
          </span>
          <h1>{cfg.title}</h1>
          <p>{cfg.intro}</p>
          <ul>
            {cfg.points.map((p) => (
              <li key={p}>
                <Check size={16} strokeWidth={2} aria-hidden="true" /> {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="sp-formpage__card">
          <LeadForm nicheKey={cfg.key} />
        </div>
      </main>
    </div>
  );
}
