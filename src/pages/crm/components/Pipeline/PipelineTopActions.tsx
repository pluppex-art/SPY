import { Plus } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { ViewToggle } from "../../../../components/ui/view-toggle";
import { BotaoCompartilharLeads } from "../../../../components/ImportadorPlanilha";

type Props = {
  view: "kanban" | "lista";
  setView: (v: "kanban" | "lista") => void;
  showAnalytics?: boolean;
  setShowAnalytics?: (v: boolean) => void;
  onNewLead: () => void;
  /** Leads que estão na tela (com os filtros aplicados) — é o que o "Exportar" baixa. */
  leadsExport: any[];
};

export function PipelineTopActions({ view, setView, onNewLead, leadsExport }: Props) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-2 shrink-0 w-full md:w-auto">
      {/* Celular: "Novo Lead" é o botão grande e vem primeiro; Lista/Kanban fica pequeno logo abaixo.
          Desktop: uma linha só — seletor Lista/Kanban e depois Novo Lead. */}
      <BotaoCompartilharLeads leads={leadsExport} className="order-2 md:order-1 w-full md:w-auto md:h-10 text-[11px] md:text-[10px] uppercase tracking-wider" />
      <Button
        onClick={onNewLead}
        className="order-1 md:order-2 w-full md:w-auto font-bold text-[11px] md:text-[10px] uppercase tracking-wider gap-1.5 h-12 md:h-10 px-5 shadow-xs"
      >
        <Plus className="w-4 h-4 shrink-0" /> Novo Lead
      </Button>

      <ViewToggle
        className="order-2 md:order-1"
        value={view}
        onChange={setView}
        options={[{ id: "lista", label: "Lista" }, { id: "kanban", label: "Kanban" }]}
      />
    </div>
  );
}
