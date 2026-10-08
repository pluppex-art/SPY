import React, { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Plus, Search, X } from "lucide-react";
import { useData } from "../../../contexts/DataContext";
import { normalizeText, cn } from "../../../lib/utils";
import { inputCls } from "./ModalKit";

/**
 * Seletor de Cliente/Fornecedor do Financeiro. Busca na base de clientes da
 * plataforma (`clienteBase` — a mesma tabela `clientes` usada como Contatos do
 * financeiro, com `tipos`) por nome, documento, telefone e e-mail. Escolher um
 * item devolve nome + id real; digitar um nome que não existe continua
 * permitido (fornecedor avulso) e devolve id = null.
 */

const MAX_RESULTS = 30;
const digits = (s: any) => String(s ?? "").replace(/\D/g, "");

export interface ClienteSelectProps {
  /** Nome exibido / gravado (ex.: counterparty). */
  value: string;
  /** id do cadastro vinculado (ex.: contato_id), se houver. */
  contatoId?: string | null;
  onChange: (name: string, contatoId: string | null) => void;
  /** Tipo favorecido na ordenação (não filtra: ambos aparecem). */
  preferTipo?: "CLIENTE" | "FORNECEDOR";
  placeholder?: string;
  /** Permite usar nome digitado sem cadastro (padrão: true). */
  allowFreeText?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export function ClienteSelect({
  value, contatoId, onChange, preferTipo, placeholder = "Buscar por nome, documento, telefone ou e-mail",
  allowFreeText = true, invalid, disabled, autoFocus, className,
}: ClienteSelectProps) {
  const { clienteBase } = useData();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Índice pré-normalizado uma vez por mudança da base (busca barata em bases grandes).
  const index = useMemo(
    () => ((clienteBase as any[]) || []).map(c => ({
      c,
      text: normalizeText(`${c.name || ""} ${c.documento || ""} ${c.email || ""} ${c.phone || ""}`),
      nameN: normalizeText(c.name),
      dig: digits(`${c.documento || ""} ${c.phone || ""}`),
      pref: preferTipo && Array.isArray(c.tipos) && c.tipos.includes(preferTipo) ? 0 : 1,
    })),
    [clienteBase, preferTipo]
  );

  const linked = useMemo(() => (contatoId ? index.find(i => i.c.id === contatoId)?.c : undefined), [index, contatoId]);

  // Texto antigo sem id: se bate exatamente com UM cadastro, vincula sozinho.
  useEffect(() => {
    if (contatoId || !value.trim()) return;
    const n = normalizeText(value);
    const hits = index.filter(i => i.nameN === n);
    if (hits.length === 1) onChange(hits[0].c.name, hits[0].c.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, contatoId]);

  const q = normalizeText(value);
  const qDigits = digits(value);
  const results = useMemo(() => {
    const list = q
      ? index.filter(i => i.text.includes(q) || (qDigits.length >= 3 && i.dig.includes(qDigits)))
      : index;
    return [...list].sort((a, b) => a.pref - b.pref || a.nameN.localeCompare(b.nameN, "pt-BR")).slice(0, MAX_RESULTS);
  }, [index, q, qDigits]);

  const exactExists = !!q && index.some(i => i.nameN === q);
  const showFree = allowFreeText && !!value.trim() && !exactExists;
  const total = results.length + (showFree ? 1 : 0);

  useEffect(() => { setActive(0); }, [q, open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const pick = (i: number) => {
    if (i < results.length) onChange(results[i].c.name, results[i].c.id);
    else if (showFree) onChange(value.trim(), null);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, Math.max(total - 1, 0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && total > 0) { e.preventDefault(); pick(active); }
    else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
  };

  const baseVazia = index.length === 0;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-faint)] pointer-events-none" />
        <input
          type="text"
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={baseVazia ? "Digite o nome" : placeholder}
          onChange={(e) => { onChange(e.target.value, null); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          className={cn(inputCls(invalid), "pl-9", (linked || value) && "pr-24")}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {linked && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <BadgeCheck className="w-3 h-3" /> cadastrado
            </span>
          )}
          {value && !disabled && (
            <button type="button" aria-label="Limpar" onClick={() => { onChange("", null); setOpen(true); }}
              className="p-0.5 text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)]">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {open && !disabled && (total > 0 || baseVazia) && (
        <div className="absolute z-50 top-full mt-1 w-full min-w-[240px] bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-lg shadow-xl max-h-60 overflow-y-auto" role="listbox">
          {baseVazia && !showFree && (
            <p className="px-3 py-2 text-[11px] text-[var(--color-text-muted)]">Nenhum cliente cadastrado ainda. Cadastre em Financeiro → Contatos.</p>
          )}
          {results.map((r, i) => {
            const sub = [r.c.documento, r.c.phone, r.c.email].filter(Boolean).join(" · ");
            const tipos: string[] = Array.isArray(r.c.tipos) ? r.c.tipos : [];
            return (
              <button key={r.c.id} type="button" role="option" aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); pick(i); }}
                onMouseEnter={() => setActive(i)}
                className={cn("w-full text-left px-3 py-2 flex items-center gap-2 border-none cursor-pointer",
                  i === active ? "bg-[var(--color-surface-sunken)]" : "bg-transparent")}>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{r.c.name}</p>
                  {sub && <p className="text-[10px] text-[var(--color-text-muted)] truncate">{sub}</p>}
                </div>
                {tipos.length > 0 && (
                  <span className="text-[9px] font-bold uppercase text-[var(--color-text-faint)] shrink-0">{tipos.map(t => t.toLowerCase()).join("/")}</span>
                )}
              </button>
            );
          })}
          {showFree && (
            <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(results.length); }}
              onMouseEnter={() => setActive(results.length)}
              className={cn("w-full text-left px-3 py-2 flex items-center gap-2 border-none cursor-pointer text-xs text-[var(--color-text-primary)]",
                active === results.length ? "bg-[var(--color-surface-sunken)]" : "bg-transparent")}>
              <Plus className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
              <span className="truncate">Usar "{value.trim()}" sem cadastro</span>
            </button>
          )}
          {index.length > MAX_RESULTS && results.length === MAX_RESULTS && (
            <p className="px-3 py-1.5 text-[10px] text-[var(--color-text-faint)] border-t border-[var(--color-border-subtle)]">Mostrando os primeiros {MAX_RESULTS}. Refine a busca.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default ClienteSelect;
