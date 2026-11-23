import { useState } from "react";
import { Card } from "../../../components/ui/card";
import { PageContainer } from "../../../components/PageContainer";
import { Field, inputCls, selectCls } from "../../finance/components/ModalKit";
import { Button } from "../../../components/ui/button";
import { Zap, Plus } from "lucide-react";
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
    <PageContainer
      title="Gatilhos de Lead Score IA"
      description="Crie regras para o sistema mover o lead de etapa sozinho conforme a nota dele (Lead Score IA). Assim, quem esquenta vai direto para o funil de SDR e quem esfria sai da frente."
    >
      <div className="grid gap-4 lg:grid-cols-5 items-start pb-12">
        {/* Regras ativas */}
        <Card className="lg:col-span-3 overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] flex items-center justify-between gap-2">
            <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider inline-flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Regras ativas</h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]">{leadScoreTriggers.length} regra(s)</span>
          </div>
          {leadScoreTriggers.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-bold text-[var(--color-text-primary)]">Nenhuma regra ainda</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Crie a primeira ao lado: por exemplo, "nota maior ou igual a 75 vai para Reunião Agendada".</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--color-border-subtle)] list-none p-0 m-0">
              {leadScoreTriggers.map((trigger) => (
                <li key={trigger.id} className="px-4 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0 text-sm text-[var(--color-text-primary)] leading-relaxed">
                    Quando a nota do lead for{" "}
                    <strong>{trigger.condition === "greater" ? "maior ou igual a" : "menor ou igual a"}</strong>{" "}
                    <span className="font-mono font-black text-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 px-1.5 py-0.5 rounded">{trigger.scoreThreshold}</span>,
                    mover para <strong className="text-[var(--color-primary-blue)]">{sdrStagesMap[trigger.targetStageId] || trigger.targetStageId}</strong>.
                  </div>
                  <Button variant="ghost" size="xs" onClick={() => handleDelete(trigger.id)} className="text-danger hover:bg-danger/10 shrink-0">Remover</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Nova regra */}
        <Card className="lg:col-span-2 p-5 space-y-4">
          <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider inline-flex items-center gap-1.5"><Plus className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Nova regra</h3>
          <Field label="Condição da nota">
            <select value={condition} onChange={(e: any) => setCondition(e.target.value)} className={selectCls()}>
              <option value="greater">Maior ou igual a (≥)</option>
              <option value="less">Menor ou igual a (≤)</option>
            </select>
          </Field>
          <Field label="Nota (0 a 100)">
            <input type="number" min="0" max="100" value={scoreThreshold} onChange={(e) => setScoreThreshold(Number(e.target.value))} className={inputCls()} />
          </Field>
          <Field label="Mover para a coluna">
            <select value={targetStageId} onChange={(e) => setTargetStageId(e.target.value)} className={selectCls()}>
              {Object.entries(DEFAULT_SDR_STAGES).map(([id, label]) => (<option key={id} value={id}>{label}</option>))}
            </select>
          </Field>
          <Button onClick={handleAddTrigger} className="h-9 px-4 text-xs font-bold gap-1.5 w-full"><Plus className="w-3.5 h-3.5" /> Adicionar gatilho</Button>
        </Card>
      </div>
    </PageContainer>
  );
}
