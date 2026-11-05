import { Trophy, Pencil, Trash2, Users } from "lucide-react";
import { Squad } from "../../../../types";

interface SquadsPanelProps {
  squads: Squad[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (sq: Squad) => void;
  onDelete: (id: string) => void;
  /** Quem só pode ver o squad não tem editar/excluir. */
  somenteLeitura?: boolean;
}

export function SquadsPanel({ squads, selectedId, onSelect, onEdit, onDelete, somenteLeitura = false }: SquadsPanelProps) {
  if (squads.length === 0) {
    return (
      <div className="text-center py-16 text-slate-600 italic text-sm">
        Nenhum squad criado ainda.<br />
        <span className="text-[10px]">Clique em "Criar Squad" para começar.</span>
      </div>
    );
  }

  return (
    <>
      {squads.map(sq => {
        const cor = sq.cor || "#6366f1";
        const isSelected = selectedId === sq.id;
        return (
          <div
            key={sq.id}
            onClick={() => onSelect(sq.id)}
            className="relative h-48 rounded-2xl overflow-hidden cursor-pointer transition-all group"
            style={{
              background: `linear-gradient(145deg, #0f172a 0%, #1e293b 55%, ${cor}20 100%)`,
              border: `2px solid ${isSelected ? "#3b82f6" : "rgba(255,255,255,0.05)"}`,
              boxShadow: isSelected ? `0 0 24px ${cor}30` : "none",
            }}
          >
            <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 75% 40%, ${cor}25, transparent 65%)` }} />

            {sq.logo && (
              <img src={sq.logo} alt="logo" className="absolute right-3 top-3 w-14 h-14 rounded-xl object-cover opacity-75" />
            )}

            <div className="absolute top-3 left-3 w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${cor}30`, border: `1px solid ${cor}50` }}>
              <Trophy className="w-4 h-4" style={{ color: cor }} />
            </div>

            {!somenteLeitura && <div
              className={`absolute top-3 right-3 flex gap-1 transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"} ${sq.logo ? "mt-16" : ""}`}
              style={sq.logo ? { top: "4.5rem" } : {}}
            >
              <button className="w-7 h-7 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-colors" onClick={e => { e.stopPropagation(); onEdit(sq); }}>
                <Pencil className="w-3 h-3 text-white" />
              </button>
              <button className="w-7 h-7 bg-rose-500/20 hover:bg-rose-500/40 rounded-lg flex items-center justify-center transition-colors" onClick={e => { e.stopPropagation(); onDelete(sq.id); }}>
                <Trash2 className="w-3 h-3 text-rose-400" />
              </button>
            </div>}

            <div className="absolute right-1 bottom-0 opacity-15 pointer-events-none">
              <Users className="w-28 h-28" style={{ color: cor }} />
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-3.5 z-10">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ backgroundColor: `${cor}30`, color: cor }}>
                  {(sq.departamento || "GERAL").toUpperCase()}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <h3 className="text-[15px] font-black text-white uppercase tracking-tight truncate leading-tight">{sq.nome}</h3>
            </div>
          </div>
        );
      })}
    </>
  );
}
