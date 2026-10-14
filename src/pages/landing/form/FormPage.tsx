import { useParams } from "react-router-dom";
import { Check } from "lucide-react";
import { SiteHeader } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";
import { useDocumentMeta } from "../useDocumentMeta";
import { LeadForm } from "./LeadForm";
import { NICHES } from "./formConfig";
import "../landing.css";

/** Página pública /f/:niche — mesmo visual claro/laranja da landing. */
export default function FormPage() {
  const { niche } = useParams();
  const cfg = NICHES[niche || ""] ?? NICHES.spy;
  const Icon = cfg.icon;
  useDocumentMeta(`${cfg.title} — S.P.Y.`, cfg.intro);

  return (
    <div className="sp-root sp-formpage">
      <a href="#conteudo" className="sp-skip">Ir para o conteúdo</a>
      <SiteHeader />
      <main id="conteudo" className="sp-wrap sp-formpage__grid">
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
      <SiteFooter />
    </div>
  );
}
