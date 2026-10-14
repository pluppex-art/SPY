import { ShieldCheck, PlugZap, Blocks, CalendarX2 } from "lucide-react";

const ITEMS = [
  [ShieldCheck, "Ambiente isolado por empresa"],
  [PlugZap, "Integra com WhatsApp e Google Agenda"],
  [Blocks, "Módulos por segmento"],
  [CalendarX2, "Sem fidelidade"],
] as const;

export function TrustRow() {
  return (
    <div className="sp-trust">
      <div className="sp-wrap">
        <ul aria-label="Pontos de confiança">
          {ITEMS.map(([Icon, text]) => (
            <li key={text}>
              <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
