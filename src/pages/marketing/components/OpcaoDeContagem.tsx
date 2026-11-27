/** Contar aberturas e cliques muda a mensagem (links passam pelo S.P.Y.): a pessoa pode desligar. */
export function OpcaoDeContagem({ ligada, onMudar }: { ligada: boolean; onMudar: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 rounded-xl border border-[var(--color-border-default)] p-3 cursor-pointer">
      <input type="checkbox" className="mt-0.5" checked={ligada} onChange={(e) => onMudar(e.target.checked)} />
      <span>
        <span className="block text-xs font-bold text-[var(--color-text-primary)]">Contar aberturas e cliques</span>
        <span className="block text-[11px] text-[var(--color-text-muted)]">Os links passam pelo endereço do S.P.Y. e vai uma imagem invisível, e alguns filtros seguram e-mails assim. Se a mensagem não está chegando, desligue.</span>
      </span>
    </label>
  );
}
