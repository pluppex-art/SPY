import { useState } from "react";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Zap, ArrowRight, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Workflow { title: string; trigger: string; action: string; active: boolean; }

interface SystemWorkflowsSectionProps {
  onAddWorkflow: (wf: Workflow) => void;
}

export function SystemWorkflowsSection({ initialWorkflows }: { initialWorkflows?: Workflow[] }) {
  const [systemWorkflows, setSystemWorkflows] = useState<Workflow[]>(initialWorkflows ?? []);

  const toggleSystemWf = (idx: number) => {
    const updated = [...systemWorkflows];
    updated[idx].active = !updated[idx].active;
    setSystemWorkflows(updated);
    toast.info(`Fluxo ${updated[idx].active ? 'ativado' : 'desativado'} com sucesso.`);
  };

  if (systemWorkflows.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="border-b border-white/5 pb-2">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Zap className="text-blue-500 w-5 h-5" /> Automações Gerais do Sistema
        </h2>
        <p className="text-slate-500 text-xs mt-1">Configure fluxos lineares internos baseados em estágios de Vendas comercial.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {systemWorkflows.map((wf, i) => (
          <Card key={i} className={`p-6 border-white/5 bg-[var(--color-surface-elevated)]/80 backdrop-blur-xl relative overflow-hidden group transition-all ${!wf.active && 'opacity-60'}`}>
            <div className="flex justify-between items-start mb-6">
              <div className={`p-3 rounded-xl ${wf.active ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                <Zap className="w-5 h-5" />
              </div>
              <div className={`h-2 w-2 rounded-full ${wf.active ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-slate-600'}`} />
            </div>
            <h3 className="font-bold text-lg mb-4">{wf.title}</h3>
            <div className="space-y-3">
              <div className="bg-[var(--color-surface)] p-3 rounded-lg border border-white/5">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Quando (Gatilho)</span>
                <span className="text-sm font-medium text-slate-300">{wf.trigger}</span>
              </div>
              <div className="flex justify-center"><ArrowRight className="w-4 h-4 text-slate-600" /></div>
              <div className="bg-[var(--color-surface)] p-3 rounded-lg border border-white/5">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Então (Ação)</span>
                <span className="text-sm font-medium text-slate-300">{wf.action}</span>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-white/5 flex gap-2">
              <Button onClick={() => toggleSystemWf(i)} size="sm" variant="outline"
                className={`w-full bg-[var(--color-surface)] border-white/10 text-slate-300 text-xs font-bold ${wf.active ? 'hover:text-amber-400 hover:border-amber-500/20' : 'hover:text-emerald-400 hover:border-emerald-500/20'}`}>
                {wf.active ? "Pausar Fluxo" : "Ativar Fluxo"}
              </Button>
              <button
                onClick={() => { setSystemWorkflows(systemWorkflows.filter((_, idx) => idx !== i)); toast.error("Fluxo removido."); }}
                className="p-2 rounded-lg bg-slate-800 hover:bg-red-500/10 text-slate-500 hover:text-red-400 border border-transparent hover:border-red-500/20 transition-all cursor-pointer shrink-0" title="Excluir Fluxo">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
