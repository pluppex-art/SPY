import { Plus } from "lucide-react";
import { Button } from "../../../../components/ui/button";

type Props = {
  view: "kanban" | "lista";
  setView: (v: "kanban" | "lista") => void;
  showAnalytics?: boolean;
  setShowAnalytics?: (v: boolean) => void;
  onNewLead: () => void;
};

export function PipelineTopActions({ view, setView, onNewLead }: Props) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-2 shrink-0 w-full md:w-auto">
      {/* Celular: "Novo Lead" é o botão grande e vem primeiro; Lista/Kanban fica pequeno logo abaixo.
          Desktop: uma linha só — seletor Lista/Kanban e depois Novo Lead. */}
      <Button
        onClick={onNewLead}
        className="order-1 md:order-2 w-full md:w-auto font-bold text-[11px] md:text-[10px] uppercase tracking-wider gap-1.5 h-12 md:h-10 px-5 shadow-xs"
      >
        <Plus className="w-4 h-4 shrink-0" /> Novo Lead
      </Button>

      <div className="order-2 md:order-1 self-center md:self-auto flex items-center bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] overflow-hidden h-8 md:h-10">
        {(["lista", "kanban"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`flex items-center justify-center gap-2 px-4 md:px-3.5 h-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer border-none ${
              view === v
                ? "bg-[var(--color-primary-blue)] !text-white font-bold shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {v === "lista" ? "Lista" : "Kanban"}
          </button>
        ))}
      </div>
    </div>
  );
}
