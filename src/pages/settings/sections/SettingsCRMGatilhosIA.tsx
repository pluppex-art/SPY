import { useState } from "react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Zap, Plus, ArrowRight, ShieldCheck, Sparkles, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useData } from "../../../contexts/DataContext";
import { LeadScoreTrigger } from "../../../types";
import { confirmDialog } from "../../../components/ui/confirm-dialog";

const DEFAULT_SDR_STAGES: Record<string, string> = {
  "sdr-1": "Novos Leads (Inbound)",
  "sdr-2": "Tentando Contato",
  "sdr-3": "Contato Realizado / Qualificação",
  "sdr-4": "Reunião Agendada",
  "sdr-5": "Desqualificado / Sem Interesse",
};

export function ConfigCRMGatilhosIA() {
  const { leadScoreTriggers, setLeadScoreTriggers } = useData();

  const [condition, setCondition] = useState<"greater" | "less">("greater");
  const [scoreThreshold, setScoreThreshold] = useState<number>(75);
  const [targetStageId, setTargetStageId] = useState<string>("sdr-1");
  const [autoMessage, setAutoMessage] = useState(false);

  const handleAddTrigger = () => {
    if (!targetStageId) {
      toast.error("Selecione a etapa de destino.");
      return;
    }

    const newTrigger: LeadScoreTrigger = {
      id: Date.now().toString(),
      condition,
      scoreThreshold,
      targetStageId,
      autoMessage,
    };

    setLeadScoreTriggers([...leadScoreTriggers, newTrigger]);
    toast.success("Regra de gatilho adicionada!");
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog({
      title: "Excluir gatilho",
      description: "Excluir esta regra de gatilho de lead score? Essa ação não pode ser desfeita.",
    }))) return;
    setLeadScoreTriggers(leadScoreTriggers.filter((t) => t.id !== id));
    toast.info("Regra de gatilho removida.");
  };

  const sdrStagesMap = DEFAULT_SDR_STAGES;

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
          Gatilhos de Lead Score IA <Zap className="w-5 h-5 text-[var(--color-primary-blue)] fill-[var(--color-primary-blue)]/10" />
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Configure regras automatizadas baseadas no Lead Score para mover os leads imediatamente para etapas do funil SDR.
        </p>
      </div>

      {/* Rules list */}
      <Card className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] overflow-hidden shadow-sm">
        <div className="p-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] flex justify-between items-center">
          <h3 className="text-xs font-black text-[var(--color-primary-blue)] uppercase tracking-wider font-mono">Gatilhos Ativos no SDR</h3>
          <span className="text-[10px] bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border border-[var(--color-primary-blue)]/20 px-2.5 py-0.5 rounded-full font-bold">
            Motor de IA Operacional
          </span>
        </div>

        <div className="divide-y divide-[var(--color-border-subtle)]">
          {leadScoreTriggers.length === 0 ? (
            <div className="p-8 text-center text-[var(--color-text-muted)] text-sm italic">
              Nenhuma regra de automação de lead score cadastrada. Crie uma abaixo.
            </div>
          ) : (
            leadScoreTriggers.map((trigger) => (
              <div key={trigger.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-[var(--color-text-primary)]">Regra de Automação</h4>
                  <p className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5 flex-wrap">
                    Se <span className="font-mono text-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 px-1 rounded border border-[var(--color-primary-blue)]/20 font-bold">Lead Score</span> for <strong>{trigger.condition === 'greater' ? 'Maior ou Igual a' : 'Menor ou Igual a'}</strong> <strong className="text-[var(--color-text-primary)] font-mono">{trigger.scoreThreshold}</strong>,
                    mover de forma autônoma para a coluna <strong className="text-[var(--color-primary-blue)]">{sdrStagesMap[trigger.targetStageId] || trigger.targetStageId}</strong>.
                  </p>
                </div>

                <div className="flex items-center gap-2 self-end md:self-auto">
                  <Button 
                    variant="ghost"
                    size="xs"
                    onClick={() => handleDelete(trigger.id)}
                    className="text-danger hover:bg-danger/10"
                  >
                    Remover
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Add trigger form */}
      <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <h3 className="text-base font-bold text-[var(--color-text-primary)] mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-[var(--color-primary-blue)]" /> Criar Novo Gatilho por Inteligência Artificial
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1.5 block">Condição de Score</label>
            <select
              value={condition}
              onChange={(e: any) => setCondition(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none"
            >
              <option value="greater">Maior ou Igual a (≥)</option>
              <option value="less">Menor ou Igual a (≤)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1.5 block">Pontuação (0 a 100)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={scoreThreshold}
              onChange={(e) => setScoreThreshold(Number(e.target.value))}
              className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1.5 block">Mover para Coluna</label>
            <select
              value={targetStageId}
              onChange={(e) => setTargetStageId(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none"
            >
              {Object.entries(DEFAULT_SDR_STAGES).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Button onClick={handleAddTrigger} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
          <Plus className="w-3.5 h-3.5" /> Adicionar Gatilho
        </Button>
      </Card>
    </div>
  );
}
