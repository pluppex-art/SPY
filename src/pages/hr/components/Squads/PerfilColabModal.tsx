import { X, Users, Mail, Calendar } from "lucide-react";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";

interface PerfilColabModalProps {
  colab: any | null;
  onClose: () => void;
}

export function PerfilColabModal({ colab, onClose }: PerfilColabModalProps) {
  if (!colab) return null;

  const statusCls =
    colab.status === "Ativo" ? "bg-emerald-500/10 text-emerald-500" :
    colab.status === "Férias" ? "bg-blue-500/10 text-blue-500" :
    "bg-rose-500/10 text-rose-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose}>
      <div className="w-full max-w-md bg-[var(--color-surface)] border border-white/10 rounded-[2rem] max-h-[90dvh] overflow-y-auto shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200" onClick={e => e.stopPropagation()}>

        <div className="h-28 bg-gradient-to-r from-indigo-600/30 to-blue-600/30 relative flex items-end justify-center">
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
          <div className="w-20 h-20 rounded-2xl bg-[var(--color-surface)] border-4 border-[var(--color-surface)] -mb-10 flex items-center justify-center text-indigo-500">
            <Users className="w-8 h-8 opacity-40" />
          </div>
        </div>

        <div className="px-8 pt-14 pb-8 text-center">
          <Badge className={`${statusCls} font-black uppercase tracking-widest text-[8px] px-3 py-1 border-none mb-3`}>
            {colab.status}
          </Badge>
          <h2 className="text-xl font-black text-white uppercase tracking-tight">{colab.nome}</h2>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">{colab.cargo}</p>

          <div className="grid grid-cols-2 gap-4 border-y border-white/5 py-5 mt-6 mb-6 text-left">
            <div>
              <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Departamento</div>
              <div className="text-sm font-bold text-slate-200">{colab.departamento || "—"}</div>
            </div>
            <div>
              <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Desempenho</div>
              <div className="text-sm font-bold text-emerald-400">{colab.desempenho ?? 0}%</div>
            </div>
          </div>

          <div className="space-y-4 text-left">
            <div className="flex items-center gap-3 text-slate-400">
              <Mail className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium truncate">{colab.email}</span>
            </div>
            <div className="flex items-center gap-3 text-slate-400">
              <Calendar className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">Admissão: {colab.dataAdmissao || "—"}</span>
            </div>
          </div>

          <Button onClick={onClose} className="w-full mt-8 h-11 bg-indigo-600 hover:bg-indigo-700 font-black uppercase tracking-widest text-[10px] rounded-xl">
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
