import { Gauge, Zap, Megaphone, HeartHandshake, BarChart3 } from "lucide-react";

type TabId = "executivo" | "comercial" | "marketing" | "sucesso" | "bi";

export function DashboardActionsTabs(props: {
  activeTab: TabId;
  onTabChange: (id: TabId) => void;
}) {
  const { activeTab, onTabChange } = props;

  return (
    <div className="flex bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] p-1 w-fit gap-1 shadow-sm">
      {[
        { id: "executivo" as const, label: "Central de Receita", icon: Gauge },
        { id: "comercial" as const, label: "Comercial", icon: Zap },
        { id: "marketing" as const, label: "Marketing", icon: Megaphone },
        { id: "sucesso" as const, label: "Retenção", icon: HeartHandshake },
        { id: "bi" as const, label: "BI", icon: BarChart3 },
      ].map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={`px-4 py-2 text-xs rounded-lg transition-all flex items-center gap-1.5 cursor-pointer border-none ${
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
