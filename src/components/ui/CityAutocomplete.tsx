import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { fetchCidadesIBGE, type Cidade } from "../../lib/ibgeCidades";

interface CityAutocompleteProps {
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  className: string;
  placeholder?: string;
  name?: string;
}

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Autocomplete de cidade brasileira (IBGE) — mesmo padrão visual/interação
 * do buscador de cliente (new-lead/ClientSelectorBlock.tsx): digita, filtra
 * localmente (a lista inteira já foi buscada uma vez, sem round-trip por
 * letra), clica pra selecionar. Continua um campo de texto livre por baixo —
 * digitar uma cidade fora da lista (ou já vinda de CNPJ/cliente vinculado)
 * nunca é bloqueado, o autocomplete só facilita achar o nome certo.
 */
export function CityAutocomplete({ value, onChange, onFocus, className, placeholder = "Cidade...", name }: CityAutocompleteProps) {
  const [cidades, setCidades] = useState<Cidade[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || cidades.length > 0 || loading) return;
    setLoading(true);
    fetchCidadesIBGE().then((list) => { setCidades(list); setLoading(false); });
  }, [open, cidades.length, loading]);

  const matches = useMemo(() => {
    const term = normalize(value.trim());
    if (!term) return [];
    return cidades.filter((c) => normalize(c.nome).includes(term)).slice(0, 30);
  }, [cidades, value]);

  return (
    <div className="relative">
      <input
        type="text"
        name={name}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); onFocus?.(); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={className}
      />

      {open && value.trim() && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full min-w-[220px] bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] shadow-xl max-h-48 overflow-y-auto">
          {loading ? (
            <p className="px-3 py-2 text-[11px] text-[var(--color-text-faint)]">Carregando cidades...</p>
          ) : matches.length > 0 ? (
            matches.map((c) => (
              <button
                key={`${c.nome}-${c.uf}`}
                type="button"
                onMouseDown={() => { onChange(c.nome); setOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-[var(--color-surface-sunken)] transition-colors flex items-center gap-2 border-none bg-transparent cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-[var(--color-text-faint)] shrink-0" />
                <span className="text-xs font-semibold text-[var(--color-text-primary)] flex-1 truncate">{c.nome}</span>
                {c.uf && <span className="text-[10px] text-[var(--color-text-faint)] font-bold shrink-0">{c.uf}</span>}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-[11px] text-[var(--color-text-faint)]">Nenhuma cidade encontrada — continua um texto livre.</p>
          )}
        </div>
      )}
    </div>
  );
}
