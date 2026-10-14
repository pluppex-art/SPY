import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { InstitutionalShell } from "./InstitutionalPage";
import { LeadForm } from "../form/LeadForm";
import { SEGMENT_OPTIONS } from "../form/formConfig";
import { useDocumentMeta } from "../useDocumentMeta";

const AFTER = [
  "A equipe do S.P.Y. lê as suas respostas e entende o seu segmento.",
  "Entramos em contato pelo WhatsApp ou e-mail informados para conversar sobre a sua operação.",
  "Se fizer sentido, combinamos a implantação e os módulos do seu segmento.",
];

export default function Contato() {
  useDocumentMeta("Contato — S.P.Y.", "Fale com a equipe do S.P.Y.: conte como a sua empresa vende hoje e combine a implantação, com os módulos do seu segmento.");
  return (
    <InstitutionalShell>
      <div className="sp-wrap sp-contactpage">
        <div>
          <h1 className="sp-h2" style={{ maxWidth: "16ch" }}>Fale com a equipe do S.P.Y.</h1>
          <p className="sp-lede">Conte em poucos passos como a sua empresa vende hoje. Leva poucos minutos e não tem compromisso.</p>

          <div className="sp-after sp-other">
            <h2>O que acontece depois do envio</h2>
            <ol>
              {AFTER.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          </div>

          <div className="sp-other">
            <h2>Prefere começar pelo seu segmento?</h2>
            <p>Cada formulário abaixo já vem com o segmento preenchido.</p>
            <div className="sp-chips">
              {SEGMENT_OPTIONS.filter((s) => s.id !== "outro").map(({ id, label, icon: Icon }) => (
                <Link key={id} to={`/f/${id}`}>
                  <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                  {label}
                </Link>
              ))}
            </div>
            <p style={{ marginTop: 16 }}>
              <Link to="/privacidade" className="sp-link">
                Como tratamos os seus dados <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            </p>
          </div>
        </div>
        <div className="sp-contactpage__card">
          <LeadForm nicheKey="spy" />
        </div>
      </div>
    </InstitutionalShell>
  );
}
