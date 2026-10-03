import { Gauge, Map, Target, AlertTriangle, Brain, LineChart } from "lucide-react";

// Tabs da Central de Receita — pedido explícito do usuário: trocar as abas
// antigas do Dashboard (Comercial/Marketing/Retenção/BI, ver
// DashboardActionsTabs.tsx — mantidas intactas e com seu próprio tipo porque
// o Dashboard.tsx antigo, não roteado mas preservado por reversibilidade,
// ainda depende delas) pelas 5 novas telas da suíte, E trocar de conteúdo na
// MESMA página (sem navegar pra outra rota) — por isso é um componente de
// aba LOCAL à Central de Receita, não uma extensão do tab system antigo.
export type RevenueTabId = "central" | "mapaReceita" | "oportunidades" | "vazamentos" | "aurora" | "previsao";

const TABS: { id: RevenueTabId; label: string; icon: typeof Gauge }[] = [
  { id: "central", label: "Central de Receita", icon: Gauge },
  { id: "mapaReceita", label: "Mapa da Receita", icon: Map },
  { id: "oportunidades", label: "Oportunidades", icon: Target },
  { id: "vazamentos", label: "Vazamentos de Receita", icon: AlertTriangle },
  { id: "aurora", label: "Inteligência Aurora", icon: Brain },
  { id: "previsao", label: "Previsão & Decisão", icon: LineChart },
];

export function RevenueTabs(props: { activeTab: RevenueTabId; onTabChange: (id: RevenueTabId) => void }) {
  const { activeTab, onTabChange } = props;
  return (
    <div className="flex flex-wrap bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] p-1 w-fit gap-1 shadow-sm">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={`px-3.5 py-2 text-xs rounded-lg transition-all flex items-center gap-1.5 cursor-pointer border-none ${
            activeTab === tab.id
              ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] font-bold shadow-xs"
              : "bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
          }`}
        >
          <tab.icon className="w-3.5 h-3.5" /> {tab.label}
        </button>
      ))}
    </div>
  );
}
