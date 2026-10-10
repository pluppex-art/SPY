import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { useEducacaoConfig } from "../../../../lib/modules/educacaoConfig";
import { Users, Calendar, Search, Share2, Check, X, MoreVertical } from "lucide-react";

interface Student {
  id: string;
  name: string;
  status: "onboarding" | "active" | "at_risk" | "completed";
  progress: number;
}

interface TurmaDetalhesPresencaProps {
  students: Student[];
  searchQuery: string;
  onSearchChange: (v: string) => void;
  attendanceDate: string;
  onDateChange: (v: string) => void;
  onMarkAllPresent: () => void;
  onToggleAttendance: (id: string, present: boolean) => void;
}

export function TurmaDetalhesPresenca({
  students, searchQuery, onSearchChange,
  attendanceDate, onDateChange,
  onMarkAllPresent, onToggleAttendance,
}: TurmaDetalhesPresencaProps) {
  const freqMin = useEducacaoConfig().presenca.frequenciaMinima;
  return (
    <div className="space-y-6">
      <Card className="p-4 bg-[var(--color-surface-elevated)]/50 border-white/5 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="relative">
            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              type="date"
              value={attendanceDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="bg-[var(--color-surface)] border-white/5 pl-10 h-10 rounded-xl text-xs font-bold text-white w-48"
            />
          </div>
          <div className="relative flex-1 min-w-[250px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filtrar alunos..."
              className="bg-[var(--color-surface)] border-white/5 pl-10 h-10 rounded-xl text-xs text-white w-full"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onMarkAllPresent} variant="ghost" className="h-10 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white">Marcar todos presente</Button>
          <Button size="icon" variant="ghost" className="h-10 w-10 text-slate-500 hover:text-white bg-white/5 rounded-xl border border-white/5">
            <Share2 className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden bg-[var(--color-surface-elevated)]/60 border-white/5 min-h-[300px]">
        {students.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-40 gap-4">
            <Users className="w-12 h-12 text-slate-500" />
            <span className="text-xs uppercase font-black tracking-widest text-slate-500 text-center max-w-sm">
              Sem alunos cadastrados nesta turma. Integre o banco para ver a lista de presença.
            </span>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/5 border-b border-white/5">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Aluno</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Presença</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Progresso no Curso</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {students.map((student) => (
                <tr key={student.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs italic capitalize">
                        {student.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white">{student.name}</div>
                        <div className="text-[9px] text-slate-600 font-black uppercase tracking-widest">Matrícula: SPY-{student.id}92</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex justify-center gap-3">
                      <button onClick={() => onToggleAttendance(student.id, true)} className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center hover:bg-emerald-500/20 transition-all">
                        <Check className="w-5 h-5" />
                      </button>
                      <button onClick={() => onToggleAttendance(student.id, false)} className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center hover:bg-rose-500/20 transition-all">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 max-w-[100px] h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${student.progress < freqMin ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${student.progress}%` }} />
                      </div>
                      <span className={`text-[11px] font-black ${student.progress < freqMin ? "text-rose-500" : "text-emerald-500"}`}>{student.progress}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <button className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
