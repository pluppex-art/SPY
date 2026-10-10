import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Brain, Zap, Plus, Trash2, Calculator, RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Button } from "../../button";
import { useEducacaoConfig } from "../../../../lib/modules/educacaoConfig";

interface Grade {
  subject: string;
  value: number;
  weight: number;
}

interface Student {
  id: string;
  name: string;
  email: string;
  phone: string;
  course: string;
  progress: number;
  status: string;
  avatar: string;
  grades: Grade[];
}

interface AlunoGradesModalProps {
  isOpen: boolean;
  student: Student | null;
  onClose: () => void;
  onAddGrade: (studentId: string, grade: Grade) => void;
  onRemoveGrade: (studentId: string, index: number) => void;
  onAnalyzeAI: (student: Student) => Promise<string>;
}

function calcAvg(grades: Grade[]): string {
  if (!grades.length) return "0.0";
  const totalW = grades.reduce((a, g) => a + g.weight, 0);
  const totalV = grades.reduce((a, g) => a + g.value * g.weight, 0);
  return totalW > 0 ? (totalV / totalW).toFixed(2) : "0.0";
}

function GradeIndicator({ value, aprov, recup }: { value: number; aprov: number; recup: number }) {
  if (value >= aprov) return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (value >= recup) return <Minus className="w-3.5 h-3.5 text-yellow-400" />;
  return <TrendingDown className="w-3.5 h-3.5 text-rose-400" />;
}

export function AlunoGradesModal({ isOpen, student, onClose, onAddGrade, onRemoveGrade, onAnalyzeAI }: AlunoGradesModalProps) {
  const { notas: cfgNotas } = useEducacaoConfig();
  const corNota = (v: number) => (v >= cfgNotas.notaAprovacao ? "text-emerald-400" : v >= cfgNotas.notaRecuperacao ? "text-yellow-400" : "text-rose-400");
  const [subject, setSubject] = useState("");
  const [gradeValue, setGradeValue] = useState("");
  const [aiInsight, setAiInsight] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const avg = student ? calcAvg(student.grades) : "0.0";
  const avgNum = parseFloat(avg);

  const handleAddGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !gradeValue || !student) return;
    const val = parseFloat(gradeValue);
    if (isNaN(val) || val < 0 || val > cfgNotas.notaMaxima) return;
    onAddGrade(student.id, { subject, value: val, weight: 1 });
    setSubject("");
    setGradeValue("");
  };

  const handleAnalyze = async () => {
    if (!student) return;
    setIsAnalyzing(true);
    const result = await onAnalyzeAI(student);
    setAiInsight(result);
    setIsAnalyzing(false);
  };

  const handleClose = () => {
    setAiInsight("");
    setSubject("");
    setGradeValue("");
    onClose();
  };

  if (!student) return null;

  const initials = student.name.substring(0, 2).toUpperCase();

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
            className="bg-[var(--color-surface-elevated)] border border-white/10 rounded-3xl w-full max-w-2xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col max-h-[90vh] ring-1 ring-black/5 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200"
          >
            {/* Header */}
            <div className="relative p-6 border-b border-white/10 bg-gradient-to-br from-indigo-600/10 via-transparent to-transparent shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-black text-sm border border-indigo-500/20 shrink-0">
                  {initials}
                </div>
                <div>
                  <h3 className="text-base font-black text-white tracking-tight">{student.name}</h3>
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-0.5">{student.course}</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="absolute right-4 top-4 p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {/* IA Panel */}
              <div className="p-5 bg-gradient-to-br from-indigo-600/10 to-transparent border border-indigo-500/20 rounded-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-2xl rounded-full pointer-events-none" />
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-indigo-400" />
                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Master IA — Análise de Desempenho</h4>
                  </div>
                  <Button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    variant="outline"
                    className="h-8 border-indigo-500/30 text-indigo-400 text-[9px] font-black uppercase tracking-widest gap-2 bg-indigo-500/5 hover:bg-indigo-500/15"
                  >
                    {isAnalyzing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    {isAnalyzing ? "Analisando..." : "Solicitar Análise"}
                  </Button>
                </div>
                {aiInsight ? (
                  <p className="text-xs text-slate-300 italic leading-relaxed">&ldquo;{aiInsight}&rdquo;</p>
                ) : (
                  <p className="text-xs text-slate-500 italic">Peça para a Master IA analisar o histórico de notas e prever o engajamento do aluno.</p>
                )}
              </div>

              {/* Add grade form */}
              <form onSubmit={handleAddGrade} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Matéria / Atividade</label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Ex: Anatomia Aplicada"
                    className="w-full h-11 bg-white/[0.04] border border-white/10 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder:text-slate-600"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Nota (0–10)</label>
                  <input
                    value={gradeValue}
                    onChange={(e) => setGradeValue(e.target.value)}
                    placeholder="0.0"
                    className="w-full h-11 bg-white/[0.04] border border-white/10 rounded-xl px-4 text-sm text-white font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder:text-slate-600"
                  />
                </div>
                <Button
                  type="submit"
                  className="h-11 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest gap-2 shadow-lg shadow-indigo-600/20"
                >
                  <Plus className="w-4 h-4" /> Lançar
                </Button>
              </form>

              {/* Grade history */}
              <div>
                <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 pb-2 mb-3">
                  Histórico de Avaliações
                </h5>
                <div className="space-y-2">
                  {student.grades.length > 0 ? (
                    student.grades.map((grade, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl group hover:border-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-8 h-8 rounded-xl bg-slate-800/80 flex items-center justify-center text-[10px] font-black text-slate-500">
                            {idx + 1}
                          </div>
                          <span className="text-sm font-bold text-white">{grade.subject}</span>
                        </div>
                        <div className="flex items-center gap-5">
                          <div className="flex items-center gap-2">
                            <GradeIndicator value={grade.value} aprov={cfgNotas.notaAprovacao} recup={cfgNotas.notaRecuperacao} />
                            <div className="text-right">
                              <p className="text-[9px] text-slate-500 font-black uppercase tracking-tighter">Nota</p>
                              <p className={`text-sm font-black font-mono ${corNota(grade.value)}`}>
                                {grade.value.toFixed(1)}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => onRemoveGrade(student.id, idx)}
                            className="p-2 bg-white/5 border border-white/10 opacity-0 group-hover:opacity-100 text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/25 rounded-xl transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-10 text-center text-slate-600 italic text-xs">
                      Nenhuma nota registrada para este aluno.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 bg-white/[0.01] border-t border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/20">
                  <Calculator className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Média Ponderada</p>
                  <p className={`text-xl font-black font-mono tracking-tighter ${corNota(avgNum)}`}>
                    {avg}
                  </p>
                </div>
              </div>
              <Button
                onClick={handleClose}
                className="h-11 px-8 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10"
              >
                Fechar
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
