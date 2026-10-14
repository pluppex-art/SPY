import { PlugZap, ShieldCheck } from "lucide-react";
import { INTEGRATIONS, SECURITY } from "../content";
import { rv } from "../reveal";

export function TrustSecuritySection() {
  return (
    <section id="integracoes" className="sp-section" aria-labelledby="sp-int-title">
      <div className="sp-wrap">
        <h2 id="sp-int-title" className="sp-h2" {...rv()}>
          Conecta com o que você já usa. Protege o que é seu.
        </h2>
        <div className="sp-two">
          <div {...rv(1)}>
            <h3>
              <PlugZap size={22} strokeWidth={1.75} aria-hidden="true" /> Integrações
            </h3>
            <ul>
              {INTEGRATIONS.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
          <div {...rv(2)}>
            <h3>
              <ShieldCheck size={22} strokeWidth={1.75} aria-hidden="true" /> Segurança
            </h3>
            <ul>
              {SECURITY.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
