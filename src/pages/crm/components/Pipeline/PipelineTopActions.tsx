import { Plus, CalendarDays } from "lucide-react";
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
    <div className="flex items-center gap-2 shrink-0 flex-wrap">
      <Link to="/app/crm/agenda">
        <Button
          variant="outline"
          className="font-bold text-[10px] uppercase tracking-wider gap-1.5 h-10 px-3.5"
        >
          <CalendarDays className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" />
          Agenda Comercial
        </Button>
      </Link>

      <div className="flex items-center bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] overflow-hidden h-10">
        {(["lista", "kanban"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`flex items-center gap-2 px-3.5 h-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer border-none ${
              view === v
                ? "bg-[var(--color-primary-blue)] !text-white font-bold shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {v === "lista" ? "Lista" : "Kanban"}
          </button>
        ))}
      </div>

      {view === "kanban" && (
        <Button
          onClick={() => setShowAnalytics(!showAnalytics)}
          variant="subtle"
          className="font-bold text-[10px] uppercase tracking-wider gap-1.5 h-10 px-3.5"
        >
          {showAnalytics ? "Ocultar" : "Performance"}
        </Button>
      )}

      <Button
        onClick={onNewLead}
        className="font-bold text-[10px] uppercase tracking-wider gap-1.5 h-10 px-5 shadow-xs"
      >
        <Plus className="w-4 h-4" /> Novo Lead
      </Button>
    </div>
  );
}
