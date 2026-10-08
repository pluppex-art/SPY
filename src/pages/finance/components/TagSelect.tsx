import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "../../../lib/utils";
import { DEFAULT_TAG_COLOR, useFinanceTags, type FinanceTag } from "../hooks/useFinanceTags";

/**
 * Seleção múltipla de tags do catálogo do Financeiro. value/onChange são nomes
 * (string[]), então finance_entries.tags (text[]) segue igual. Tags do lançamento
 * que não estão no catálogo aparecem como chips neutros (nada é descartado).
 */

const norm = (s: string) => s.trim().toLowerCase();
const NEUTRAL = "#94a3b8";

const chipStyle = (cor: string): React.CSSProperties => ({
  backgroundColor: `${cor}22`,
  color: cor,
  borderColor: `${cor}55`,
});

export function TagChip({ nome, cor, onRemove, className }: { nome: string; cor?: string | null; onRemove?: () => void; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold leading-4 max-w-full", className)}
      style={chipStyle(cor || NEUTRAL)}
    >
      <span className="truncate">{nome}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remover tag ${nome}`} className="shrink-0 rounded-full hover:opacity-70">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

/** Chips somente leitura (modal de visualização / linhas da lista). */
export function TagChips({ tags, catalog, max, className }: { tags: string[] | null | undefined; catalog: FinanceTag[]; max?: number; className?: string }) {
  const list = (tags || []).filter(Boolean);
  if (list.length === 0) return null;
  const shown = max ? list.slice(0, max) : list;
  const rest = list.length - shown.length;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {shown.map((t) => <TagChip key={t} nome={t} cor={catalog.find((c) => norm(c.nome) === norm(t))?.cor} />)}
      {rest > 0 && <span className="text-[10px] font-bold text-[var(--color-text-faint)] self-center">+{rest}</span>}
    </span>
  );
}

export interface TagSelectProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function TagSelect({ value, onChange, placeholder = "Selecionar tags", disabled }: TagSelectProps) {
  const { tags: catalog, addTag } = useFinanceTags();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const selected = useMemo(() => new Set(value.map(norm)), [value]);
  const q = norm(query);
  const options = useMemo(
    () => catalog.filter((t) => t.ativo && (!q || norm(t.nome).includes(q))),
    [catalog, q],
  );
  const exists = q !== "" && catalog.some((t) => norm(t.nome) === q);
  const canCreate = q !== "" && !exists;

  const toggle = (nome: string) => {
    if (selected.has(norm(nome))) onChange(value.filter((v) => norm(v) !== norm(nome)));
    else onChange([...value, nome]);
  };

  const create = async () => {
    const nome = query.trim();
    if (!nome || creating) return;
    setCreating(true);
    const created = await addTag({ nome, cor: DEFAULT_TAG_COLOR });
    setCreating(false);
    if (created) {
      if (!selected.has(norm(created.nome))) onChange([...value, created.nome]);
      setQuery("");
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div
        className={cn(
          "w-full min-h-[38px] flex flex-wrap items-center gap-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-2 py-1.5 text-xs",
          open && "ring-2 ring-[var(--color-primary-blue)]",
          disabled && "opacity-60 pointer-events-none",
        )}
        onClick={() => setOpen(true)}
      >
        {value.map((v) => (
          <TagChip key={v} nome={v} cor={catalog.find((c) => norm(c.nome) === norm(v))?.cor} onRemove={() => toggle(v)} />
        ))}
        <input
          type="text"
          value={query}
          disabled={disabled}
          placeholder={value.length === 0 ? placeholder : "Buscar ou criar..."}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (options[0] && (q === "" ? false : true)) { toggle(options[0].nome); setQuery(""); }
              else if (canCreate) create();
            } else if (e.key === "Backspace" && query === "" && value.length > 0) {
              onChange(value.slice(0, -1));
            } else if (e.key === "Escape") setOpen(false);
          }}
          className="flex-1 min-w-[90px] bg-transparent outline-none text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] px-1"
        />
      </div>
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated,var(--color-surface-sunken))] shadow-lg py-1">
          {options.map((t) => {
            const on = selected.has(norm(t.nome));
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => { toggle(t.nome); setQuery(""); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-[var(--color-surface-sunken)]"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.cor }} />
                <span className="flex-1 truncate text-[var(--color-text-primary)] font-medium">{t.nome}</span>
                {on && <Check className="w-3.5 h-3.5 text-[var(--color-primary-blue)] shrink-0" />}
              </button>
            );
          })}
          {canCreate && (
            <button
              type="button"
              disabled={creating}
              onClick={create}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left font-bold text-[var(--color-primary-blue)] hover:bg-[var(--color-surface-sunken)] disabled:opacity-60"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{creating ? "Criando..." : `Criar "${query.trim()}"`}</span>
            </button>
          )}
          {options.length === 0 && !canCreate && (
            <p className="px-3 py-2 text-xs text-[var(--color-text-faint)]">Nenhuma tag cadastrada. Digite para criar.</p>
          )}
        </div>
      )}
    </div>
  );
}
