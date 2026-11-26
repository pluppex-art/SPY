import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, FileText, ImagePlus, Loader2, Trash2, X } from 'lucide-react';
import { ehImagem, type Anexo } from '../lib/anexos';
import { useAnexoLinks } from '../hooks/useAnexoLinks';

/** Imagem em tela cheia. Esc fecha só ela (não fecha o painel que está atrás). */
function Visualizador({ url, nome, onClose }: { url: string; nome: string; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-label={nome} className="fixed inset-0 z-[130] bg-black/90 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between gap-3 p-3" onClick={e => e.stopPropagation()}>
        <span className="text-xs font-bold !text-white truncate">{nome}</span>
        <span className="flex items-center gap-2 shrink-0">
          <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-bold !text-white underline"><ExternalLink className="w-3.5 h-3.5" /> Abrir original</a>
          <button type="button" onClick={onClose} aria-label="Fechar imagem" className="p-1.5 rounded-lg bg-white/10 !text-white border-none cursor-pointer"><X className="w-4 h-4" /></button>
        </span>
      </div>
      <div className="flex-1 min-h-0 grid place-items-center p-3">
        <img src={url} alt={nome} className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
      </div>
    </div>,
    document.body,
  );
}

/** Grade de imagens e arquivos de uma tarefa, com botão para anexar. Colar (Ctrl/Cmd+V) é tratado por quem usa. */
export function AnexosTarefa({ anexos, enviando, onAdicionar, onRemover }: {
  anexos: Anexo[];
  enviando?: boolean;
  onAdicionar?: (arquivos: File[]) => void;
  onRemover?: (a: Anexo) => void;
}) {
  const link = useAnexoLinks(anexos);
  const input = useRef<HTMLInputElement>(null);
  const [aberta, setAberta] = useState<{ url: string; nome: string } | null>(null);
  const imagens = anexos.filter(ehImagem);
  const arquivos = anexos.filter(a => !ehImagem(a));
  const botaoRemover = (a: Anexo) => onRemover && (
    <button type="button" onClick={() => onRemover(a)} aria-label={`Remover ${a.nome}`} title="Remover"
      className="p-1 rounded-md bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-rose-500 cursor-pointer">
      <Trash2 className="w-3 h-3" />
    </button>
  );

  return (
    <div className="space-y-2">
      {imagens.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {imagens.map((a, i) => {
            const url = link(a);
            return (
              <div key={a.path || a.url || i} className="relative rounded-xl overflow-hidden border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]">
                <button type="button" aria-label={`Ampliar ${a.nome}`} disabled={!url} onClick={() => url && setAberta({ url, nome: a.nome })} className="block w-full h-32 p-0 border-none bg-transparent cursor-zoom-in">
                  {url ? <img src={url} alt={a.nome} loading="lazy" className="w-full h-full object-cover" /> : <span className="grid place-items-center h-full"><Loader2 className="w-4 h-4 animate-spin text-[var(--color-text-faint)]" /></span>}
                </button>
                <span className="absolute top-1.5 right-1.5">{botaoRemover(a)}</span>
              </div>
            );
          })}
        </div>
      )}
      {arquivos.map((a, i) => (
        <div key={a.path || a.url || i} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] px-3 py-2">
          <a href={link(a)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 min-w-0 text-xs font-bold text-[var(--color-text-primary)] hover:text-[var(--color-primary-blue)]">
            <FileText className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{a.nome}</span>
          </a>
          {botaoRemover(a)}
        </div>
      ))}
      {onAdicionar && (
        <>
          <input ref={input} type="file" multiple className="hidden" accept="image/*,video/mp4,.pdf,.txt,.log,.csv,.json,.zip"
            onChange={e => { const f = Array.from(e.target.files || []); e.target.value = ''; if (f.length) onAdicionar(f); }} />
          <button type="button" disabled={enviando} onClick={() => input.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = Array.from(e.dataTransfer.files); if (f.length) onAdicionar(f); }}
            className="w-full py-3 border border-dashed border-[var(--color-border-default)] rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer bg-transparent disabled:opacity-60">
            {enviando ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando…</> : <><ImagePlus className="w-3.5 h-3.5" /> Anexar print ou arquivo (ou cole com Ctrl/Cmd+V)</>}
          </button>
        </>
      )}
      {aberta && <Visualizador url={aberta.url} nome={aberta.nome} onClose={() => setAberta(null)} />}
    </div>
  );
}
