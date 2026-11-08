import { Button } from "../../../../components/ui/button";
import { X } from "lucide-react";

interface LandingPageCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  newName: string;
  setNewName: (v: string) => void;
  newSlug: string;
  setNewSlug: (v: string) => void;
  pixelId: string;
  setPixelId: (v: string) => void;
  gtagId: string;
  setGtagId: (v: string) => void;
  onSubmit: (e: { preventDefault(): void }) => void;
}

export function LandingPageCreateModal({
  isOpen, onClose, newName, setNewName, newSlug, setNewSlug,
  pixelId, setPixelId, gtagId, setGtagId, onSubmit,
}: LandingPageCreateModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[var(--color-surface-elevated)] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90dvh] overflow-y-auto ring-1 ring-black/5 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200">
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
          <div>
            <h3 className="text-lg font-black text-white flex items-center gap-2 uppercase tracking-wide">
              🚀 Criar Nova Landing Page
            </h3>
            <p className="text-xs text-slate-400 mt-1">Configure o título e os dados da sua nova página de captura.</p>
          </div>
          <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 flex flex-col gap-4">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Título da Página</label>
            <input
              type="text" required
              placeholder="Ex: Campanha Black Friday, Captura Ebook"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                if (!newSlug) setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
              }}
              className="w-full bg-[var(--color-surface-elevated)] text-white border border-white/10 rounded-xl h-11 px-4 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Caminho / Slug (URL)</label>
            <div className="flex items-center bg-[var(--color-surface-elevated)] border border-white/10 rounded-xl h-11 overflow-hidden px-4 text-sm text-slate-400">
              <span className="shrink-0">lp.seussistema.com/</span>
              <input
                type="text" required placeholder="black-friday"
                value={newSlug} onChange={(e) => setNewSlug(e.target.value)}
                className="flex-1 bg-transparent text-white focus:outline-none h-full pl-1 text-sm font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Pixel ID (Meta)</label>
              <input type="text" placeholder="Ex: 1029384756" value={pixelId} onChange={(e) => setPixelId(e.target.value)}
                className="w-full bg-[var(--color-surface-elevated)] text-white border border-white/10 rounded-xl h-11 px-4 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Google Analytics ID</label>
              <input type="text" placeholder="Ex: G-XXXXXXXXXX" value={gtagId} onChange={(e) => setGtagId(e.target.value)}
                className="w-full bg-[var(--color-surface-elevated)] text-white border border-white/10 rounded-xl h-11 px-4 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <Button type="button" onClick={onClose} className="flex-1 bg-white/5 hover:bg-white/10 text-white h-11 rounded-xl border border-white/5 uppercase text-xs font-black tracking-widest">
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-11 rounded-xl uppercase text-xs font-black tracking-widest">
              Criar Página
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
