import React, { useEffect, useMemo, useState } from "react";
import { Bug, X } from "lucide-react";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { useDevProjects } from "../hooks/useDevProjects";
import { useData } from "../../../contexts/DataContext";
import { useDevConfig, pick, DEV_SEVERIDADES } from "../../../lib/modules/devConfig";

export type NovaIssuePayload = {
  title: string;
  description: string;
  severity: "crítico" | "alto" | "médio" | "baixo";
  project: string;
  assignee: string;
  labels: string[];
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: NovaIssuePayload) => void;
};

const SEVERITIES: { value: NovaIssuePayload["severity"]; label: string; color: string }[] = [
  { value: "crítico", label: "Crítico", color: "bg-red-500/15 text-red-400 border-red-500/40" },
  { value: "alto", label: "Alto", color: "bg-orange-500/15 text-orange-400 border-orange-500/40" },
  { value: "médio", label: "Médio", color: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
  { value: "baixo", label: "Baixo", color: "bg-slate-500/15 text-slate-400 border-slate-500/40" },
];


const lbl = "text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider";
const inp = "w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-4 py-2.5 text-xs text-[var(--color-text-primary)] focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/20 transition-all placeholder-[var(--color-text-faint)]";

export function NovaIssueDevModal({ isOpen, onClose, onSave }: Props) {
  const { projects } = useDevProjects();
  const { issues: cfg } = useDevConfig();
  const sevPadrao = pick(cfg.severidadePadrao, DEV_SEVERIDADES, "médio") as NovaIssuePayload["severity"];
  const LABEL_SUGGESTIONS = cfg.labelsSugeridas;
  const { colaboradores } = useData();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<NovaIssuePayload["severity"]>(sevPadrao);
  const [project, setProject] = useState("");
  const [assignee, setAssignee] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [customLabel, setCustomLabel] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(""); setDescription(""); setSeverity(sevPadrao); setProject(""); setAssignee(""); setLabels([]); setCustomLabel(""); setLoading(false);
  }, [isOpen, sevPadrao]);

  const canSubmit = useMemo(() => !loading && Boolean(title.trim()), [loading, title]);

  const toggleLabel = (l: string) =>
    setLabels(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);

  const addCustomLabel = () => {
    const v = customLabel.trim().toLowerCase();
    if (v && !labels.includes(v)) setLabels(prev => [...prev, v]);
    setCustomLabel("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      onSave({ title: title.trim(), description: description.trim(), severity, project, assignee: assignee.trim(), labels });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-2xl"
      title={
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-600/10 border border-red-500/20 flex items-center justify-center mt-0.5">
            <Bug className="w-4 h-4 text-red-400" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-black text-white">Novo Issue / Bug</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Rastreamento de problemas</div>
          </div>
        </div>
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white" disabled={loading}>Cancelar</Button>
          <Button type="submit" form="nova-issue-dev-form" className="bg-red-600/80 hover:bg-red-600 text-white font-bold px-6" disabled={!canSubmit}>
            {loading ? "Registrando..." : "Registrar Issue"}
          </Button>
        </>
      }
    >
      <form id="nova-issue-dev-form" onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className={lbl}>Título do Issue *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className={inp} placeholder="Ex.: Timeout na requisição de checkout" required />
        </div>

        <div className="space-y-2">
          <label className={lbl}>Descrição / Reprodução</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
            className={`${inp} resize-none`} placeholder="Descreva como reproduzir o problema, contexto e impacto..." />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className={lbl}>Severidade</label>
            <div className="grid grid-cols-2 gap-1.5">
              {SEVERITIES.map(s => (
                <button key={s.value} type="button" onClick={() => setSeverity(s.value)}
                  className={`py-2 rounded-xl text-[10px] font-black border transition-all ${severity === s.value ? s.color : "bg-white/[0.02] text-slate-500 border-white/5 hover:bg-white/[0.05]"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className={lbl}>Projeto</label>
              <select value={project} onChange={e => setProject(e.target.value)} className={inp}>
                <option value="">Selecione...</option>
                {projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className={lbl}>Responsável</label>
              <input
                list="nova-issue-dev-assignee-options"
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
                className={inp}
                placeholder="Sigla ou nome"
              />
              <datalist id="nova-issue-dev-assignee-options">
                {colaboradores.map((c: any) => <option key={c.id} value={c.nome} />)}
              </datalist>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className={lbl}>Labels</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {LABEL_SUGGESTIONS.map(l => (
              <button key={l} type="button" onClick={() => toggleLabel(l)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${labels.includes(l)
                  ? "bg-indigo-600/20 text-indigo-400 border-indigo-500/40"
                  : "bg-white/[0.02] text-slate-500 border-white/5 hover:bg-white/[0.05]"}`}>
                {labels.includes(l) && "✓ "}{l}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={customLabel} onChange={e => setCustomLabel(e.target.value)}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addCustomLabel())}
              className={`${inp} flex-1`} placeholder="Label personalizada (Enter para adicionar)" />
            <Button type="button" onClick={addCustomLabel} variant="ghost" className="border border-white/10 text-slate-400 hover:text-white px-3">+</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
