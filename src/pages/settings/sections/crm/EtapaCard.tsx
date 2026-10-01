import { useState } from "react";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { StageConfig, CORES_LISTA, ETAPA_CORES } from "./funisTypes";

interface EtapaCardProps {
  stage: StageConfig;
  idx: number;
  corInfo: { dot: string; top: string };
  dragHandleProps?: any;
  onRename: (nome: string) => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<StageConfig>) => void;
  onColorChange: (cor: string) => void;
}

export function EtapaCard({ stage, idx, corInfo, dragHandleProps, onRename, onDelete, onUpdate, onColorChange }: EtapaCardProps) {
  const [editing, setEditing] = useState(false);
  const [nome, setNome] = useState(stage.nome);
  const [showPicker, setShowPicker] = useState(false);

  const save = () => {
    if (nome.trim()) onRename(nome.trim());
    else setNome(stage.nome);
    setEditing(false);
  };

  return (
    <div
      className="flex-shrink-0 w-[200px] rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface)] flex flex-col relative"
      style={{ borderTop: `4px solid ${corInfo.top}` }}
    >
      <div className="p-3 flex-1">
        <div className="flex items-center justify-between mb-2">
          <span {...(dragHandleProps ?? {})} className="cursor-grab active:cursor-grabbing p-0.5 rounded text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] transition-colors">
            <GripVertical className="w-4 h-4" />
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setEditing(true)} className="p-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] transition-colors rounded">
              <Pencil className="w-3 h-3" />
            </button>
            <button onClick={onDelete} className="p-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-danger hover:bg-danger/10 hover:border-danger/25 transition-colors rounded">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-shrink-0 z-20">
            <button
              onClick={() => setShowPicker(v => !v)}
              className="w-3 h-3 rounded-full transition-all hover:ring-2 hover:ring-[var(--color-text-primary)]/30"
              style={{ backgroundColor: corInfo.dot }}
            />
            {showPicker && (
              <div className="absolute top-5 left-0 z-[100] p-2 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-xl shadow-2xl grid grid-cols-5 gap-1.5 w-[116px]">
                {CORES_LISTA.map(cor => (
                  <button
                    key={cor}
                    onClick={() => { onColorChange(cor); setShowPicker(false); }}
                    className="w-5 h-5 rounded-full transition-transform hover:scale-110 border-2"
                    style={{ backgroundColor: ETAPA_CORES[cor]?.dot, borderColor: stage.cor === cor ? "var(--color-text-primary)" : "transparent" }}
                  />
                ))}
              </div>
            )}
          </div>
          {editing ? (
            <input
              autoFocus
              value={nome}
              onChange={e => setNome(e.target.value)}
              onBlur={save}
              onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setNome(stage.nome); setEditing(false); } }}
              className="text-xs font-bold bg-transparent border-b border-[var(--color-primary-blue)] text-[var(--color-text-primary)] outline-none flex-1 min-w-0"
            />
          ) : (
            <button onClick={() => setEditing(true)} className="text-xs font-bold text-[var(--color-text-primary)] truncate text-left hover:text-[var(--color-primary-blue)] transition-colors flex-1 min-w-0">
              {stage.nome}
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-9 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)]" />
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--color-border-subtle)] px-3 py-2.5 flex items-center justify-between">
        <span className="text-[8px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">Iniciar minimizado</span>
        <button
          onClick={() => onUpdate({ iniciarMinimizado: !stage.iniciarMinimizado })}
          className={`relative w-8 h-4 rounded-full transition-colors ${stage.iniciarMinimizado ? "bg-[var(--color-primary-blue)]" : "bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)]"}`}
        >
          <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${stage.iniciarMinimizado ? "left-[18px]" : "left-0.5"}`} />
        </button>
      </div>
      <div className="px-3 pb-2.5">
        <span className="text-[8px] font-bold text-[var(--color-text-faint)] uppercase tracking-widest">Etapa {idx + 1}</span>
      </div>
    </div>
  );
}
