import React, { useEffect, useMemo, useState } from "react";
import { Kanban } from "lucide-react";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { useData } from "../../../contexts/DataContext";
import { useDevConfig, pick, DEV_TIPOS_TAREFA, DEV_PRIORIDADES, DEV_COLUNAS_TAREFA } from "../../../lib/modules/devConfig";

export type TarefaSprintPayload = {
  title: string;
  type: "feature" | "bug" | "chore" | "refactor";
  priority: "crítica" | "alta" | "média" | "baixa";
  points: number;
  assignee: string;
  column: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: TarefaSprintPayload) => void;
  defaultColumn?: string;
};

const TYPES: { value: TarefaSprintPayload["type"]; label: string; color: string }[] = [
  { value: "feature", label: "Feature", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  { value: "bug", label: "Bug", color: "bg-red-500/15 text-red-400 border-red-500/30" },
  { value: "chore", label: "Chore", color: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  { value: "refactor", label: "Refactor", color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
];

const PRIORITIES: { value: TarefaSprintPayload["priority"]; label: string; color: string }[] = [
  { value: "crítica", label: "Crítica", color: "text-red-400" },
  { value: "alta", label: "Alta", color: "text-orange-400" },
  { value: "média", label: "Média", color: "text-amber-400" },
  { value: "baixa", label: "Baixa", color: "text-slate-400" },
];

const COLUMNS = ["Backlog", "A Fazer", "Em Progresso", "Em Review", "Concluído"];

const label = "text-[10px] font-bold text-slate-400 uppercase tracking-wider";
const input = "w-full bg-[var(--color-surface)] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder-slate-600";

export function NovaTarefaSprintModal({ isOpen, onClose, onSave, defaultColumn }: Props) {
  const { sprint: cfg } = useDevConfig();
  const tipoPadrao = pick(cfg.tipoPadrao, DEV_TIPOS_TAREFA, "feature") as TarefaSprintPayload["type"];
  const prioPadrao = pick(cfg.prioridadePadrao, DEV_PRIORIDADES, "média") as TarefaSprintPayload["priority"];
  const colPadrao = defaultColumn ?? pick(cfg.colunaPadrao, DEV_COLUNAS_TAREFA, "Backlog");
  const pontosMax = Math.max(1, Number(cfg.pontosMaximo) || 21);
  const pontosPadrao = Math.min(pontosMax, Math.max(1, Number(cfg.pontosPadrao) || 1));
  const { colaboradores } = useData();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TarefaSprintPayload["type"]>(tipoPadrao);
  const [priority, setPriority] = useState<TarefaSprintPayload["priority"]>(prioPadrao);
  const [points, setPoints] = useState(pontosPadrao);
  const [assignee, setAssignee] = useState("");
  const [column, setColumn] = useState(colPadrao);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(""); setType(tipoPadrao); setPriority(prioPadrao); setPoints(pontosPadrao); setAssignee(""); setColumn(colPadrao); setLoading(false);
  }, [isOpen, colPadrao, tipoPadrao, prioPadrao, pontosPadrao]);

  const canSubmit = useMemo(() => !loading && Boolean(title.trim()), [loading, title]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      onSave({ title: title.trim(), type, priority, points, assignee: assignee.trim(), column });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-xl"
      title={
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mt-0.5">
            <Kanban className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-black text-white">Nova Tarefa</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Sprint / Kanban</div>
          </div>
        </div>
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white" disabled={loading}>Cancelar</Button>
          <Button type="submit" form="nova-tarefa-sprint-form" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6" disabled={!canSubmit}>
            {loading ? "Adicionando..." : "Adicionar ao Sprint"}
          </Button>
        </>
      }
    >
      <form id="nova-tarefa-sprint-form" onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className={label}>Título da Tarefa *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className={input} placeholder="Ex.: Implementar autenticação OAuth2" required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className={label}>Tipo</label>
            <div className="flex flex-col gap-1.5">
              {TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => setType(t.value)}
                  className={`px-3 py-2 rounded-xl text-[10px] font-black border transition-all text-left ${type === t.value ? t.color : "bg-white/[0.02] text-slate-500 border-white/5 hover:bg-white/[0.05]"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className={label}>Prioridade</label>
            <div className="flex flex-col gap-1.5">
              {PRIORITIES.map(p => (
                <button key={p.value} type="button" onClick={() => setPriority(p.value)}
                  className={`px-3 py-2 rounded-xl text-[10px] font-black border transition-all text-left ${priority === p.value
                    ? `bg-white/5 border-white/20 ${p.color}`
                    : "bg-white/[0.02] text-slate-500 border-white/5 hover:bg-white/[0.05]"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className={label}>Story Points</label>
            <input type="number" min={1} max={pontosMax} value={points} onChange={e => setPoints(Number(e.target.value))} className={input} />
          </div>
          <div className="space-y-2">
            <label className={label}>Coluna Destino</label>
            <select value={column} onChange={e => setColumn(e.target.value)} className={input}>
              {COLUMNS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className={label}>Responsável</label>
          <input
            list="nova-tarefa-sprint-assignee-options"
            value={assignee}
            onChange={e => setAssignee(e.target.value)}
            className={input}
            placeholder="Nome ou sigla do dev (ex.: G.H.)"
          />
          <datalist id="nova-tarefa-sprint-assignee-options">
            {colaboradores.map((c: any) => <option key={c.id} value={c.nome} />)}
          </datalist>
        </div>
      </form>
    </Modal>
  );
}
