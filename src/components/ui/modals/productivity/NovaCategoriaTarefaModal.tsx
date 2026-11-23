import React, { useEffect, useMemo, useState } from "react";
import { Briefcase, ShieldCheck, Plus } from "lucide-react";
import { Modal } from "../../modal";
import { Button } from "../../button";

type NovaCategoriaTarefaPayload = {
  nome: string;
  cor: "Azul" | "Verde" | "Vermelho" | "Laranja" | "Roxo";
};

type NovoCategoriaTarefaModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: NovaCategoriaTarefaPayload) => void;
  title?: string;
  submitText?: string;
  initialValue?: Partial<NovaCategoriaTarefaPayload> | null;
};

const labelClass = "text-[10px] font-bold text-slate-400 uppercase tracking-wider";
const inputBaseClass =
  "w-full bg-[var(--color-surface)] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-[#2563EB] focus:bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 transition-all";

const COR_OPTIONS: NovaCategoriaTarefaPayload["cor"][] = [
  "Azul",
  "Verde",
  "Vermelho",
  "Laranja",
  "Roxo",
];

const corToStyles: Record<NovaCategoriaTarefaPayload["cor"], { pill: string; dot: string; text: string }> = {
  Azul: { pill: "bg-blue-500/10 border-blue-500/20", dot: "bg-blue-400", text: "text-blue-300" },
  Verde: { pill: "bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-400", text: "text-emerald-300" },
  Vermelho: { pill: "bg-rose-500/10 border-rose-500/20", dot: "bg-rose-400", text: "text-rose-300" },
  Laranja: { pill: "bg-orange-500/10 border-orange-500/20", dot: "bg-orange-400", text: "text-orange-300" },
  Roxo: { pill: "bg-violet-500/10 border-violet-500/20", dot: "bg-violet-400", text: "text-violet-300" },
};

export function NovaCategoriaTarefaModal({
  isOpen,
  onClose,
  onSave,
  title = "Nova Categoria de Tarefa",
  submitText = "Salvar",
  initialValue,
}: NovoCategoriaTarefaModalProps) {
  const isEditing = Boolean(initialValue?.nome);

  const [nome, setNome] = useState(initialValue?.nome || "");
  const [cor, setCor] = useState<NovaCategoriaTarefaPayload["cor"]>(
    (initialValue?.cor as NovaCategoriaTarefaPayload["cor"]) || "Azul"
  );
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setNome(initialValue?.nome || "");
    setCor(
      (initialValue?.cor as NovaCategoriaTarefaPayload["cor"]) || "Azul"
    );
    setTouched(false);
    setLoading(false);
  }, [isOpen, initialValue]);

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (!nome.trim()) return false;
    return true;
  }, [loading, nome]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;

    setLoading(true);
    try {
      onSave({
        nome: nome.trim(),
        cor,
      });
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
          <div className="w-9 h-9 rounded-xl bg-[#2563EB]/10 border border-[#2563EB]/20 flex items-center justify-center mt-0.5">
            <Briefcase className="w-4 h-4 text-[#60A5FA]" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-black text-white">{isEditing ? "Editar categoria" : title}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
              Classificação visual para o quadro de tarefas
            </div>
          </div>
        </div>
      }
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="nova-categoria-tarefa-form"
            className="bg-[#2563EB] hover:bg-blue-600 text-white font-bold px-6"
            disabled={!canSubmit}
          >
            {loading ? "Salvando..." : submitText}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-[var(--color-surface)]/40 border border-white/10 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mt-0.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-slate-200 font-bold">Como funciona</p>
              <p className="text-xs text-slate-400 leading-relaxed mt-1">
                Escolha um nome e uma cor. A categoria será usada para organizar e filtrar tarefas no quadro.
              </p>
            </div>
          </div>
        </div>

        <form
          id="nova-categoria-tarefa-form"
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="tarefa-cat-nome" className={labelClass}>
                Nome da Categoria
              </label>
              <input
                id="tarefa-cat-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className={inputBaseClass}
                placeholder="Ex.: Prospecting, Retomada, Suporte"
                required
              />
              {touched && !nome.trim() && (
                <div className="text-[11px] text-rose-400 font-semibold">
                  Informe um nome.
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="tarefa-cat-cor" className={labelClass}>
                Cor
              </label>
              <select
                id="tarefa-cat-cor"
                value={cor}
                onChange={(e) => setCor(e.target.value as NovaCategoriaTarefaPayload["cor"])}
                className={inputBaseClass + " pr-10"}
              >
                {COR_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-xl border ${corToStyles[cor].pill} ${corToStyles[cor].text}`}
                >
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${corToStyles[cor].dot}`} />
                  {cor}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-[var(--color-surface)] border border-white/10 rounded-xl p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-blue-400" />
              Prévia
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">
                  {nome.trim() ? nome.trim() : "Sua categoria"}
                </div>
                <div className="text-xs text-slate-400">
                  {cor} • disponível para organização do board
                </div>
              </div>
              <div className={`w-10 h-10 rounded-xl border ${corToStyles[cor].pill} flex items-center justify-center`}>
                <div className={`w-3.5 h-3.5 rounded-full ${corToStyles[cor].dot}`} />
              </div>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
}

