import { useEffect, useRef } from "react";
import { Gauge, Map, Target, AlertTriangle, Brain, LineChart, Users, Unlink } from "lucide-react";

// Tabs da Central de Receita — pedido explícito do usuário: trocar as abas
// antigas do Dashboard (Comercial/Marketing/Retenção/BI, ver
// DashboardActionsTabs.tsx — mantidas intactas e com seu próprio tipo porque
// o Dashboard.tsx antigo, não roteado mas preservado por reversibilidade,
// ainda depende delas) pelas 5 novas telas da suíte, E trocar de conteúdo na
// MESMA página (sem navegar pra outra rota) — por isso é um componente de
// aba LOCAL à Central de Receita, não uma extensão do tab system antigo.
export type RevenueTabId = "central" | "mapaReceita" | "oportunidades" | "vazamentos" | "ruptura" | "aurora" | "previsao" | "vendedores";

// Ordem pedida: Mapa da Receita (principal), Previsão & Decisão, Vendedores, e o resto.
const TABS: { id: RevenueTabId; label: string; icon: typeof Gauge }[] = [
  { id: "mapaReceita", label: "Mapa da Receita", icon: Map },
  { id: "previsao", label: "Previsão & Decisão", icon: LineChart },
  { id: "vendedores", label: "Vendedores", icon: Users },
  { id: "central", label: "Central de Receita", icon: Gauge },
  { id: "oportunidades", label: "Oportunidades", icon: Target },
  { id: "vazamentos", label: "Vazamentos de Receita", icon: AlertTriangle },
  { id: "ruptura", label: "Ruptura", icon: Unlink },
  { id: "aurora", label: "Inteligência Aurora", icon: Brain },
];

export function RevenueTabs(props: { activeTab: RevenueTabId; onTabChange: (id: RevenueTabId) => void }) {
  const { activeTab, onTabChange } = props;
  const activeRef = useRef<HTMLButtonElement | null>(null);
  // Em telas estreitas a barra rola na horizontal: traz a aba ativa para a vista.
  useEffect(() => {
    const el = activeRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [activeTab]);
  return (
    <div className="flex flex-row md:flex-wrap overflow-x-auto md:overflow-visible scrollbar-none bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-panel)] md:rounded-[var(--radius-control)] p-1.5 md:p-1 w-full md:w-fit gap-1 shadow-sm">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          ref={activeTab === tab.id ? activeRef : undefined}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={`px-2.5 md:px-3.5 py-2 text-[11px] md:text-xs rounded-xl md:rounded-lg transition-all flex items-center gap-1.5 cursor-pointer border-none text-left whitespace-nowrap shrink-0 ${
            activeTab === tab.id
              ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] font-bold md:shadow-xs"
              : "bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
          }`}
        >
          <tab.icon className="w-3.5 h-3.5 shrink-0" /> <span className="leading-tight">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
