import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { LeadForm } from "../form/LeadForm";
import { rv } from "../reveal";

export function ContactSection() {
  return (
    <section id="contato" className="sp-section sp-contact" aria-labelledby="sp-cta-title">
      <div className="sp-wrap sp-contact__grid">
        <div {...rv()}>
          <h2 id="sp-cta-title" className="sp-h2">
            Vamos conversar sobre a sua operação?
          </h2>
          <p className="sp-lede">Conte em poucos passos como a sua empresa vende hoje. A equipe do S.P.Y. retorna para combinar a implantação.</p>
          <ul className="sp-contact__points">
            {["Sem compromisso: você decide o próximo passo", "Módulos do seu segmento", "Acompanhamento humano na implantação"].map((t) => (
              <li key={t}>
                <Check size={16} strokeWidth={2} aria-hidden="true" /> {t}
              </li>
            ))}
          </ul>
          <Link to="/f/spy" className="sp-link">
            Abrir o formulário em tela cheia <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
        <div className="sp-contact__card" {...rv(1)}>
          <LeadForm nicheKey="spy" compact />
        </div>
      </div>
    </section>
  );
}
