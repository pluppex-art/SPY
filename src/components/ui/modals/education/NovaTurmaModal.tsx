import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, GraduationCap, BookOpen, User, Users, Clock, Calendar, Loader2 } from "lucide-react";
import { Button } from "../../button";
import { useData } from "../../../../contexts/DataContext";
import { useEducacaoConfig } from "../../../../lib/modules/educacaoConfig";

interface NovaTurmaForm {
  nome: string;
  curso: string;
  professor: string;
  vagas: string;
  shift: string;
  data_inicio: string;
}

interface NovaTurmaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: NovaTurmaForm) => void;
}

const inputClass =
  "w-full bg-white/[0.04] text-white border border-white/10 rounded-xl h-12 px-4 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-all placeholder:text-slate-600";


export function NovaTurmaModal({ isOpen, onClose, onSubmit }: NovaTurmaModalProps) {
  const { colaboradores } = useData();
  const { turmas: cfg } = useEducacaoConfig();
  const blank = (): NovaTurmaForm => ({ nome: "", curso: "", professor: "", vagas: String(cfg.vagasPadrao), shift: cfg.turnoPadrao, data_inicio: "" });
  const [form, setForm] = useState<NovaTurmaForm>(blank);
  useEffect(() => { if (isOpen) setForm(blank()); }, [isOpen, cfg.vagasPadrao, cfg.turnoPadrao]); // eslint-disable-line react-hooks/exhaustive-deps
  const [loading, setLoading] = useState(false);

  const set = (k: keyof NovaTurmaForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const reset = () => setForm(blank());
  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome || !form.curso) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 300));
    onSubmit(form);
    setLoading(false);
    reset();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--color-surface-elevated)] border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl shadow-black/60 overflow-hidden ring-1 ring-black/5 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200"
          >
            {/* Header */}
            <div className="relative p-6 border-b border-white/10 bg-gradient-to-br from-violet-600/10 via-transparent to-transparent">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-violet-500/15 text-violet-400 flex items-center justify-center border border-violet-500/20 shrink-0">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white tracking-tight">Nova Turma</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Configure os dados da nova turma ou curso</p>
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
              {/* Nome da Turma */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                  <BookOpen className="w-3 h-3" /> Nome da Turma *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Turma A — Engenharia 2025"
                  value={form.nome}
                  onChange={set("nome")}
                  className={inputClass}
                />
              </div>

              {/* Curso */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                  <GraduationCap className="w-3 h-3" /> Curso / Assunto *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Administração de Empresas"
                  value={form.curso}
                  onChange={set("curso")}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Professor */}
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                    <User className="w-3 h-3" /> Professor
                  </label>
                  <select
                    value={form.professor}
                    onChange={set("professor")}
                    className={inputClass}
                  >
                    <option value="">Selecione o professor</option>
                    {colaboradores.map((c: any) => (
                      <option key={c.id} value={c.nome}>{c.nome}</option>
                    ))}
                  </select>
                </div>

                {/* Vagas */}
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                    <Users className="w-3 h-3" /> Vagas
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="30"
                    value={form.vagas}
                    onChange={set("vagas")}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Turno */}
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" /> Turno
                  </label>
                  <select value={form.shift} onChange={set("shift")} className={inputClass}>
                    <option>Manhã</option>
                    <option>Tarde</option>
                    <option>Noite</option>
                  </select>
                </div>

                {/* Data de Início */}
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" /> Início
                  </label>
                  <input
                    type="date"
                    value={form.data_inicio}
                    onChange={set("data_inicio")}
                    className={inputClass}
                  />
                </div>
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
                  className="flex-1 h-12 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-violet-600/20 disabled:opacity-60"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar Turma"}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
