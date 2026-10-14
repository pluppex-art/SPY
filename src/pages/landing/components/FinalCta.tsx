import { rv } from "../reveal";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export function FinalCta() {
  return (
    <section className="sp-section sp-cta" aria-labelledby="sp-cta-title">
      <div className="sp-wrap">
        <div {...rv()}>
          <h2 id="sp-cta-title">Vamos conversar sobre a sua operação?</h2>
          <p>Conte pelo formulário como a sua empresa vende hoje. A equipe do S.P.Y. retorna para combinar os próximos passos.</p>
        </div>
        <div className="sp-cta__actions" {...rv(1)}>
          <Link to="/f/spy" className="sp-btn sp-btn--light">
            Falar com a equipe
            <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
          </Link>
          <Link to="/login" className="sp-link">
            Acessar o sistema
          </Link>
        </div>
      </div>
    </section>
  );
}
