import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, BookOpen, Video, FileText, HelpCircle, Clock, Layers, Globe, Loader2, Upload } from "lucide-react";
import { Button } from "../../button";

type ContentType = "Video" | "PDF" | "Quiz" | "Artigo";
type ContentStatus = "Publicado" | "Rascunho" | "Em Revisão" | "Arquivado";

interface NovoConteudoForm {
  title: string;
  type: ContentType;
  duration: string;
  course: string;
  module: string;
  status: ContentStatus;
}

interface NovoConteudoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: NovoConteudoForm) => void;
  editingTitle?: string;
  initialValues?: Partial<NovoConteudoForm>;
}

const DEFAULT: NovoConteudoForm = {
  title: "", type: "Video", duration: "", course: "", module: "", status: "Publicado"
};

const TYPE_ICONS: Record<ContentType, React.ReactNode> = {
  Video: <Video className="w-3.5 h-3.5" />,
  PDF: <FileText className="w-3.5 h-3.5" />,
  Quiz: <HelpCircle className="w-3.5 h-3.5" />,
  Artigo: <BookOpen className="w-3.5 h-3.5" />,
};

const STATUS_COLORS: Record<ContentStatus, string> = {
  Publicado: "text-emerald-400",
  Rascunho: "text-slate-400",
  "Em Revisão": "text-yellow-400",
  Arquivado: "text-rose-400",
};

const inputClass =
  "w-full bg-white/[0.04] text-white border border-white/10 rounded-xl h-12 px-4 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-all placeholder:text-slate-600";

export function NovoConteudoModal({ isOpen, onClose, onSubmit, editingTitle, initialValues }: NovoConteudoModalProps) {
  const [form, setForm] = useState<NovoConteudoForm>({ ...DEFAULT, ...initialValues });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) setForm({ ...DEFAULT, ...initialValues });
  }, [isOpen]);

  const set = <K extends keyof NovoConteudoForm>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value as NovoConteudoForm[K] }));

  const reset = () => setForm(DEFAULT);
  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.course || !form.module) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 300));
    onSubmit(form);
    setLoading(false);
    reset();
  };

  const isEditing = !!editingTitle;

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--color-surface-elevated)] border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl shadow-black/60 max-h-[90dvh] overflow-y-auto ring-1 ring-black/5 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200"
          >
            {/* Header */}
            <div className="relative p-6 border-b border-white/10 bg-gradient-to-br from-cyan-600/10 via-transparent to-transparent">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center border border-cyan-500/20 shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white tracking-tight">
                    {isEditing ? "Editar Conteúdo" : "Publicar Material Acadêmico"}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isEditing ? `Editando: ${editingTitle}` : "Adicione novos ativos à trilha de aprendizado"}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="absolute right-4 top-4 p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">
                  Título do Conteúdo *
                </label>
                <input
                  required
                  placeholder="Ex: Introdução ao CRM — Parte 1"
                  value={form.title}
                  onChange={set("title")}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Tipo */}
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Tipo</label>
                  <select value={form.type} onChange={set("type")} className={inputClass}>
                    {(["Video", "PDF", "Quiz", "Artigo"] as ContentType[]).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Duração */}
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" /> Duração
                  </label>
                  <input
                    placeholder="Ex: 20min, 2h"
                    value={form.duration}
                    onChange={set("duration")}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Curso */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                  <Globe className="w-3 h-3" /> Curso Relacionado *
                </label>
                <input
                  required
                  placeholder="Ex: Administração de Vendas"
                  value={form.course}
                  onChange={set("course")}
                  className={inputClass}
                />
              </div>

              {/* Módulo */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                  <Layers className="w-3 h-3" /> Módulo *
                </label>
                <input
                  required
                  placeholder="Ex: 01: Fundamentos do CRM"
                  value={form.module}
                  onChange={set("module")}
                  className={inputClass}
                />
              </div>

              {/* Status */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Status de Publicação</label>
                <select value={form.status} onChange={set("status")} className={`${inputClass} ${STATUS_COLORS[form.status]}`}>
                  <option value="Publicado">Publicado</option>
                  <option value="Rascunho">Rascunho</option>
                  <option value="Em Revisão">Em Revisão</option>
                  <option value="Arquivado">Arquivado</option>
                </select>
              </div>

              {/* Footer */}
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 h-12 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1 h-12 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-cyan-600/20 disabled:opacity-60"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isEditing ? "Salvar Alterações" : "Publicar Ativo"}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
