import { useMemo } from "react";
import { normalizeText } from "../../../lib/utils";

/**
 * Chips de sugestão de descrição, montados SÓ a partir das descrições que o
 * próprio usuário já lançou (mais frequentes primeiro). Sem texto inventado.
 */
export function useDescricoesAnteriores(entries: any[], type?: string): string[] {
  return useMemo(() => {
    const freq = new Map<string, { text: string; n: number }>();
    for (const e of entries || []) {
      if (type && e.type !== type) continue;
      const t = String(e.description || "").trim();
      if (!t) continue;
      const k = normalizeText(t);
      const cur = freq.get(k);
      if (cur) cur.n++; else freq.set(k, { text: t, n: 1 });
    }
    return [...freq.values()].sort((a, b) => b.n - a.n || a.text.localeCompare(b.text, "pt-BR")).map(v => v.text);
  }, [entries, type]);
}

export function DescricaoSugestoes({ anteriores, value, onPick, max = 5 }: {
  anteriores: string[]; value: string; onPick: (v: string) => void; max?: number;
}) {
  const sugestoes = useMemo(() => {
    const q = normalizeText(value);
    const list = q
      ? anteriores.filter(d => { const n = normalizeText(d); return n.includes(q) && n !== q; })
      : anteriores;
    return list.slice(0, max);
  }, [anteriores, value, max]);
  if (sugestoes.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1.5">
      <span className="text-[10px] text-[var(--color-text-faint)]">Já usadas:</span>
      {sugestoes.map(s => (
        <button key={s} type="button" onClick={() => onPick(s)} title={s}
          className="max-w-[200px] truncate px-2 py-0.5 rounded-full text-[10px] border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary-blue)] cursor-pointer">
          {s}
        </button>
      ))}
    </div>
  );
}
