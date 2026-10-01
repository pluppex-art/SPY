import React, { useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Plus, GripVertical, Pencil, Trash2, Save, Columns3, BookOpen, CheckSquare, Zap, Code2 } from "lucide-react";
import { toast } from "sonner";
import { useData } from "../../../contexts/DataContext";
import {
  KanbanColConfig,
  KANBAN_KEYS,
  KANBAN_DEFAULTS,
  KANBAN_COR_DOT,
  KANBAN_COR_TOP,
  readKanbanConfig,
} from "../../../hooks/useKanbanConfig";

// ─── Colors ───────────────────────────────────────────────────────────────────

const CORES_LISTA = ["blue", "orange", "cyan", "emerald", "purple", "rose", "amber", "indigo", "pink", "slate"];

// ─── Column Card ──────────────────────────────────────────────────────────────

function ColCard({
  col, idx, dragHandleProps, onRename, onDelete, onUpdate, onColorChange, canDelete,
}: {
  col: KanbanColConfig;
  idx: number;
  dragHandleProps?: any;
  onRename: (nome: string) => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<KanbanColConfig>) => void;
  onColorChange: (cor: string) => void;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [nome, setNome] = useState(col.nome);
  const [showPicker, setShowPicker] = useState(false);

  const dotColor = KANBAN_COR_DOT[col.cor] ?? KANBAN_COR_DOT.slate;
  const topColor = KANBAN_COR_TOP[col.cor] ?? KANBAN_COR_TOP.slate;

  const save = () => {
    if (nome.trim()) onRename(nome.trim());
    else setNome(col.nome);
    setEditing(false);
  };

  return (
    <div
      className="flex-shrink-0 w-[200px] rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] flex flex-col relative shadow-sm"
      style={{ borderTop: `4px solid ${topColor}` }}
    >
      <div className="p-3 flex-1">
        <div className="flex items-center justify-between mb-2">
          <span
            {...(dragHandleProps ?? {})}
            className="cursor-grab active:cursor-grabbing p-0.5 rounded text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <GripVertical className="w-4 h-4" />
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setEditing(true)} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded border-none bg-transparent cursor-pointer">
              <Pencil className="w-3 h-3" />
            </button>
            {canDelete && (
              <button onClick={onDelete} className="p-1 text-[var(--color-text-muted)] hover:text-danger transition-colors rounded border-none bg-transparent cursor-pointer">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-shrink-0 z-20">
            <button
              onClick={() => setShowPicker(v => !v)}
              className="w-3.5 h-3.5 rounded-full transition-all hover:ring-2 hover:ring-[var(--color-primary-blue)]/50 cursor-pointer border-none"
              style={{ backgroundColor: dotColor }}
            />
            {showPicker && (
              <div className="absolute top-5 left-0 z-[100] p-2 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-xl shadow-2xl grid grid-cols-5 gap-1.5 w-[120px]">
                {CORES_LISTA.map(cor => (
                  <button
                    key={cor}
                    onClick={() => { onColorChange(cor); setShowPicker(false); }}
                    className="w-5 h-5 rounded-full transition-transform hover:scale-110 border-2 cursor-pointer"
                    style={{
                      backgroundColor: KANBAN_COR_DOT[cor],
                      borderColor: col.cor === cor ? "var(--color-primary-blue)" : "transparent",
                    }}
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
              onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
              className="text-xs font-bold bg-[var(--color-surface-sunken)] border border-[var(--color-primary-blue)] rounded px-1.5 py-0.5 text-[var(--color-text-primary)] w-full outline-none"
            />
          ) : (
            <span
              onClick={() => setEditing(true)}
              className="text-xs font-bold text-[var(--color-text-primary)] cursor-pointer truncate hover:text-[var(--color-primary-blue)] transition-colors"
              title="Clique para renomear"
            >
              {col.nome}
            </span>
          )}
        </div>
      </div>

      <div className="p-2 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
        <span className="font-mono">#{idx + 1}</span>
        <span className="capitalize font-bold">{col.cor}</span>
      </div>
    </div>
  );
}

// ─── Board Configs ────────────────────────────────────────────────────────────

type BoardKey = 'marketing' | 'educacao' | 'tarefas' | 'sprint';

interface BoardDef {
  key: BoardKey;
  label: string;
  icon: React.ReactNode;
  description: string;
  storageKey: string;
  defaults: KanbanColConfig[];
  canAddRemove: boolean;
}

const BOARDS: BoardDef[] = [
  {
    key: 'marketing',
    label: 'Marketing / Conteúdo',
    icon: <Zap className="w-4 h-4" />,
    description: 'Etapas de produção e publicação de campanhas e criativos.',
    storageKey: KANBAN_KEYS.marketing,
    defaults: KANBAN_DEFAULTS[KANBAN_KEYS.marketing],
    canAddRemove: true,
  },
  {
    key: 'tarefas',
    label: 'Tarefas / Produtividade',
    icon: <CheckSquare className="w-4 h-4" />,
    description: 'Fluxo operacional de tarefas internas e follow-ups.',
    storageKey: KANBAN_KEYS.tarefas,
    defaults: KANBAN_DEFAULTS[KANBAN_KEYS.tarefas],
    canAddRemove: true,
  },
  {
    key: 'educacao',
    label: 'Educação / Conteúdos',
    icon: <BookOpen className="w-4 h-4" />,
    description: 'Status de acompanhamento e publicação dos conteúdos pedagógicos.',
    storageKey: KANBAN_KEYS.educacao,
    defaults: KANBAN_DEFAULTS[KANBAN_KEYS.educacao],
    canAddRemove: true,
  },
  {
    key: 'sprint',
    label: 'Desenvolvimento / Sprint',
    icon: <Code2 className="w-4 h-4" />,
    description: 'Quadro ágil para tracking de demandas técnicas e engenharia.',
    storageKey: KANBAN_KEYS.sprint,
    defaults: KANBAN_DEFAULTS[KANBAN_KEYS.sprint],
    canAddRemove: true,
  },
];

// ─── Board Editor ─────────────────────────────────────────────────────────────

function BoardEditor({ boardKey, canAddRemove }: { boardKey: BoardKey; canAddRemove: boolean }) {
  const { appSettings, saveAppSetting } = useData();
  const [cols, setCols] = useState<KanbanColConfig[]>(() => readKanbanConfig(appSettings, boardKey));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(cols);
    const [reordered] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reordered);
    setCols(items);
    setDirty(true);
  };

  const handleRename = (idx: number, nome: string) => {
    setCols(cols.map((c, i) => i === idx ? { ...c, nome } : c));
    setDirty(true);
  };

  const handleColorChange = (idx: number, cor: string) => {
    setCols(cols.map((c, i) => i === idx ? { ...c, cor } : c));
    setDirty(true);
  };

  const handleUpdate = (idx: number, patch: Partial<KanbanColConfig>) => {
    setCols(cols.map((c, i) => i === idx ? { ...c, ...patch } : c));
    setDirty(true);
  };

  const handleDelete = (idx: number) => {
    setCols(cols.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const handleAdd = () => {
    const cor = CORES_LISTA[cols.length % CORES_LISTA.length];
    const newCol: KanbanColConfig = {
      id: `col-${Date.now()}`,
      nome: `Nova Coluna ${cols.length + 1}`,
      cor,
      iniciarMinimizado: false,
    };
    setCols([...cols, newCol]);
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAppSetting(KANBAN_KEYS[boardKey], cols);
    } catch {}
    setSaving(false);
    setDirty(false);
    toast.success("Estrutura do Kanban salva com sucesso!");
  };

  const handleReset = () => {
    const def = KANBAN_DEFAULTS[KANBAN_KEYS[boardKey]];
    setCols(def);
    setDirty(true);
    toast.info("Configuração padrão restaurada (não se esqueça de salvar).");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="text-[10px] font-bold text-warning bg-warning/10 px-2 py-0.5 rounded border border-warning/20">
              Alterações não salvas
            </span>
          )}
          <button
            type="button"
            onClick={handleReset}
            className="text-[10px] font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors uppercase tracking-wider cursor-pointer border-none bg-transparent"
          >
            Redefinir padrão
          </button>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? "Salvando..." : "Salvar Alterações"}
        </Button>
      </div>

      <div className="overflow-x-auto pb-4">
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId={`board-${boardKey}`} direction="horizontal">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="flex gap-3 min-w-max"
              >
                {cols.map((col, idx) => (
                  <Draggable key={`${boardKey}-${col.id}-${idx}`} draggableId={`${boardKey}-${col.id}-${idx}`} index={idx}>
                    {(drag, snapshot) => (
                      <div
                        ref={drag.innerRef}
                        {...drag.draggableProps}
                        className={snapshot.isDragging ? "opacity-80 rotate-1 scale-105" : ""}
                      >
                        <ColCard
                          col={col}
                          idx={idx}
                          dragHandleProps={drag.dragHandleProps}
                          onRename={(nome) => handleRename(idx, nome)}
                          onDelete={() => handleDelete(idx)}
                          onUpdate={(patch) => handleUpdate(idx, patch)}
                          onColorChange={(cor) => handleColorChange(idx, cor)}
                          canDelete={canAddRemove}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}

                {canAddRemove && (
                  <button
                    onClick={handleAdd}
                    className="flex-shrink-0 w-[200px] rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] flex flex-col items-center justify-center min-h-[220px] gap-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary-blue)] transition-all cursor-pointer"
                  >
                    <Plus className="w-6 h-6" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Adicionar Coluna</span>
                  </button>
                )}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      {!canAddRemove && (
        <p className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">
          * As colunas deste quadro são fixas. Você pode renomear, reordenar e alterar cores, mas não adicionar ou remover colunas.
        </p>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function ConfigKanbanBoards() {
  const [activeBoard, setActiveBoard] = useState<BoardKey>('marketing');
  const board = BOARDS.find(b => b.key === activeBoard)!;

  return (
    <div className="max-w-5xl space-y-6 animate-in fade-in duration-300 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
          Funis & Quadros Kanban <Columns3 className="w-5 h-5 text-[var(--color-primary-blue)]" />
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">Personalize as colunas, cores e etapas dos quadros de tarefas, marketing e educação da plataforma.</p>
      </div>

      {/* Board Tabs */}
      <div className="flex flex-wrap gap-2">
        {BOARDS.map(b => (
          <button
            key={b.key}
            onClick={() => setActiveBoard(b.key)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
              activeBoard === b.key
                ? "bg-[var(--color-primary-blue)] !text-white border-[var(--color-primary-blue)] shadow-xs"
                : "bg-[var(--color-surface-elevated)] border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {b.icon}
            {b.label}
          </button>
        ))}
      </div>

      {/* Active Board Card */}
      <Card className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] p-6 space-y-5 shadow-sm">
        <div className="flex items-center gap-3 pb-4 border-b border-[var(--color-border-subtle)]">
          <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
            {board.icon}
          </div>
          <div>
            <div className="font-bold text-[var(--color-text-primary)] text-sm">{board.label}</div>
            <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{board.description}</div>
          </div>
        </div>

        <BoardEditor key={activeBoard} boardKey={activeBoard} canAddRemove={board.canAddRemove} />
      </Card>
    </div>
  );
}
