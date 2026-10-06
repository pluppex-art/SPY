import { Plus, CalendarDays, List, Columns3, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../../../../components/ui/button";

type Props = {
  view: "kanban" | "lista";
  setView: (v: "kanban" | "lista") => void;
  showAnalytics: boolean;
  setShowAnalytics: (v: boolean) => void;
  onNewLead: () => void;
};

export function PipelineTopActions({
  view,
  setView,
  showAnalytics,
  setShowAnalytics,
  onNewLead,
}: Props) {
  return (
    <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
      <Link to="/app/crm/agenda">
        <Button
          variant="outline"
          className="font-bold text-[11px] uppercase tracking-wider gap-2 h-11 px-4 rounded-xl"
        >
          <CalendarDays className="w-4 h-4 text-[var(--color-text-muted)]" />
          Agenda Comercial
        </Button>
      </Link>

      <div className="flex items-center gap-1 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-xl p-1 h-11">
        {(["lista", "kanban"] as const).map((v) => {
          const Icon = v === "lista" ? List : Columns3;
          return (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`flex items-center gap-2 px-3.5 h-full rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer border-none ${
                view === v
                  ? "bg-[var(--color-primary-blue)] !text-white shadow-sm"
                  : "bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              <Icon className="w-4 h-4" />
              {v === "lista" ? "Lista" : "Kanban"}
            </button>
          );
        })}
      </div>

      {view === "kanban" && (
        <Button
          onClick={() => setShowAnalytics(!showAnalytics)}
          variant="outline"
          className={`font-bold text-[11px] uppercase tracking-wider gap-2 h-11 px-4 rounded-xl ${showAnalytics ? "border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]" : ""}`}
        >
          <BarChart3 className="w-4 h-4" />
          {showAnalytics ? "Ocultar" : "Performance"}
        </Button>
      )}

      <Button
        onClick={onNewLead}
        className="font-bold text-[12px] uppercase tracking-wider gap-2 h-11 px-6 rounded-xl shadow-sm"
      >
        <Plus className="w-4 h-4" /> Novo Lead
      </Button>
    </div>
  );
}
