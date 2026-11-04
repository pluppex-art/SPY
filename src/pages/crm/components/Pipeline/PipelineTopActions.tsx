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
    <div className="flex items-center gap-2 shrink-0 flex-wrap w-full md:w-auto">
      {/* Celular: o seletor Lista/Kanban vira uma barra de largura total no topo; os três botões
          abaixo dividem a linha em partes iguais. Desktop: tudo numa linha só, como antes. */}
      <div className="order-first md:order-none w-full md:w-auto flex items-center bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] overflow-hidden h-11 md:h-10">
        {(["lista", "kanban"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3.5 h-full text-[11px] md:text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer border-none ${
              view === v
                ? "bg-[var(--color-primary-blue)] !text-white font-bold shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {v === "lista" ? "Lista" : "Kanban"}
          </button>
        ))}
      </div>

      <Link to="/app/crm/agenda" className="flex-1 md:flex-none">
        <Button
          variant="outline"
          className="w-full font-bold text-[10px] uppercase tracking-wider gap-1.5 h-11 md:h-10 px-3 md:px-3.5"
        >
          <CalendarDays className="w-3.5 h-3.5 text-[var(--color-primary-blue)] shrink-0" />
          <span><span className="hidden md:inline">Agenda Comercial</span><span className="md:hidden">Agenda</span></span>
        </Button>
      </Link>

      {view === "kanban" && (
        <Button
          onClick={() => setShowAnalytics(!showAnalytics)}
          variant="subtle"
          className="flex-1 md:flex-none font-bold text-[10px] uppercase tracking-wider gap-1.5 h-11 md:h-10 px-3 md:px-3.5"
        >
          {showAnalytics ? "Ocultar" : "Performance"}
        </Button>
      )}

      <Button
        onClick={onNewLead}
        className="flex-1 md:flex-none font-bold text-[10px] uppercase tracking-wider gap-1.5 h-11 md:h-10 px-3 md:px-5 shadow-xs"
      >
        <Plus className="w-4 h-4 shrink-0" /> Novo Lead
      </Button>
    </div>
  );
}
