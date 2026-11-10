import { Award } from "lucide-react";

/** Selo do nível de fidelidade do cliente (Bronze/Prata/Ouro...). Cor vem da configuração da empresa. */
export function FidelidadeBadge({ nivel, cor, compras, janela }: { nivel: string; cor: string; compras?: number; janela?: string }) {
  return (
    <span
      title={compras !== undefined ? `${compras} compra(s) ${janela ?? ""}`.trim() : nivel}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide whitespace-nowrap align-middle"
      style={{ color: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${cor} 35%, transparent)` }}
    >
      <Award className="w-3 h-3" aria-hidden="true" /> {nivel}
    </span>
  );
}
