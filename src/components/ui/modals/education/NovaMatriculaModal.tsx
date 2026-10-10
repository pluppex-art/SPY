import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, GraduationCap, User, Mail, Phone, BookOpen, Loader2, Wallet } from "lucide-react";
import { Button } from "../../button";
import { useData } from "../../../../contexts/DataContext";
import { useEducacaoConfig } from "../../../../lib/modules/educacaoConfig";

interface NovaMatriculaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    nome: string; email: string; telefone: string; curso: string;
    valorMensalidade: string; diaVencimento: string; quantidadeParcelas: string;
  }) => void;
}

const inputClass =
  "w-full bg-white/[0.04] text-white border border-white/10 rounded-xl h-12 px-4 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all placeholder:text-slate-600";

export function NovaMatriculaModal({ isOpen, onClose, onSubmit }: NovaMatriculaModalProps) {
  const { turmas } = useData();
  const { matricula: cfg } = useEducacaoConfig();
  const blank = () => ({
    nome: "", email: "", telefone: "", curso: "",
    valorMensalidade: "", diaVencimento: String(cfg.diaVencimentoPadrao), quantidadeParcelas: String(cfg.parcelasPadrao),
  });
  const [form, setForm] = useState(blank);
  useEffect(() => { if (isOpen) setForm(blank()); }, [isOpen, cfg.diaVencimentoPadrao, cfg.parcelasPadrao]); // eslint-disable-line react-hooks/exhaustive-deps
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const reset = () => setForm(blank());

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome || !form.email) return;
    setLoading(true);
    await onSubmit(form);
    setLoading(false);
    reset();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--color-surface-elevated)] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl shadow-black/60 overflow-hidden ring-1 ring-black/5 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200"
          >
            {/* Header */}
            <div className="relative p-6 border-b border-white/10 bg-gradient-to-br from-emerald-600/10 via-transparent to-transparent">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center border border-emerald-500/20 shrink-0">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white tracking-tight">Nova Matrícula</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Cadastre um novo aluno na plataforma</p>
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
              {/* Nome */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                  <User className="w-3 h-3" /> Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: João Pedro Almeida"
                  value={form.nome}
                  onChange={set("nome")}
                  className={inputClass}
                />
              </div>

              {/* Email */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                  <Mail className="w-3 h-3" /> E-mail *
                </label>
                <input
                  type="email"
                  required
                  placeholder="aluno@email.com"
                  value={form.email}
                  onChange={set("email")}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Telefone */}
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                    <Phone className="w-3 h-3" /> Telefone
                  </label>
                  <input
                    type="tel"
                    placeholder="(XX) XXXXX-XXXX"
                    value={form.telefone}
                    onChange={set("telefone")}
                    className={inputClass}
                  />
                </div>

                {/* Curso */}
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                    <BookOpen className="w-3 h-3" /> Curso / Turma
                  </label>
                  <select
                    value={form.curso}
                    onChange={set("curso")}
                    className={inputClass}
                  >
                    <option value="">Selecione a turma</option>
                    {turmas.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.nome || t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mensalidade */}
              <div className="pt-1 border-t border-white/10">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 mt-3 flex items-center gap-1.5">
                  <Wallet className="w-3 h-3" /> Cobrança de Mensalidade
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 block mb-1">Valor (R$)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="299"
                      value={form.valorMensalidade}
                      onChange={set("valorMensalidade")}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 block mb-1">Dia Vencimento</label>
                    <input
                      type="number"
                      min="1"
                      max="28"
                      value={form.diaVencimento}
                      onChange={set("diaVencimento")}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 block mb-1">Nº Parcelas</label>
                    <input
                      type="number"
                      min="1"
                      value={form.quantidadeParcelas}
                      onChange={set("quantidadeParcelas")}
                      className={inputClass}
                    />
                  </div>
                </div>
                <p className="text-[9px] text-slate-600 mt-1.5">Deixe o valor em branco para matricular sem gerar cobrança automática.</p>
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
                  className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-600/20 disabled:opacity-60"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Matricular Aluno"}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
