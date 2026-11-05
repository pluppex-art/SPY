import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

type OpcaoCargo = { id: string; nome: string; nivel?: string | null };

interface CargosMultiSelectProps {
  /** Cargos escolhidos; o primeiro é o principal. */
  value: string[];
  onChange: (v: string[]) => void;
  /** Cargos cadastrados na empresa. */
  options: OpcaoCargo[];
  className?: string;
}

const NIVEIS = ["Estratégico", "Tático", "Operacional"];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Escolha de uma ou mais áreas/cargos da pessoa (ex.: Administrador + Dev). As permissões somam.
 * Lista compacta: busca por nome e grupos por nível que abrem um de cada vez — sem rolagem longa.
 */
export function CargosMultiSelect({ value, onChange, options, className }: CargosMultiSelectProps) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const restantes = useMemo(() => options.filter((o) => !value.includes(o.nome)), [options, value]);
  const termo = norm(busca.trim());
  const filtradas = termo ? restantes.filter((o) => norm(o.nome).includes(termo)) : restantes;

  const grupos = useMemo(() => {
    const por = new Map<string, OpcaoCargo[]>();
    for (const o of filtradas) {
      const g = o.nivel && NIVEIS.includes(o.nivel) ? o.nivel : "Outros";
      por.set(g, [...(por.get(g) ?? []), o]);
    }
    return [...NIVEIS, "Outros"].filter((g) => por.has(g)).map((g) => ({ nome: g, itens: (por.get(g) as OpcaoCargo[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) }));
  }, [filtradas]);

  const escolher = (nome: string) => {
    onChange([...value, nome]);
    setBusca("");
    setAberto(false);
  };

  const itemCls = "w-full text-left px-3 py-2 text-xs font-semibold text-[var(--color-text-primary)] bg-transparent border-none cursor-pointer hover:bg-[var(--color-primary-blue)]/10";

  return (
    <div ref={raiz} className={`space-y-2 ${className ?? ""}`}>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((nome, i) => (
            <span key={nome} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg text-xs font-bold bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border border-[var(--color-primary-blue)]/20">
              {nome}
              {i === 0 && value.length > 1 && <span className="text-[10px] font-black uppercase opacity-70">principal</span>}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== nome))}
                aria-label={`Remover ${nome}`}
                className="w-5 h-5 inline-flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/15"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] pointer-events-none" />
        <input
          type="text"
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setAberto(true); }}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAberto(false);
            if (e.key === "Enter" && filtradas.length > 0) { e.preventDefault(); escolher(filtradas[0].nome); }
          }}
          placeholder={value.length === 0 ? "Buscar cargo..." : "Adicionar outra área..."}
          aria-label="Buscar cargo ou área"
          className="w-full h-10 pl-9 pr-9 rounded-lg text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
        />
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-label="Abrir lista de cargos"
          className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-transparent border-none cursor-pointer text-[var(--color-text-muted)]"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${aberto ? "rotate-180" : ""}`} />
        </button>

        {aberto && (
          <div className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] shadow-xl py-1" role="listbox">
            {grupos.length === 0 && <p className="px-3 py-4 text-center text-xs text-[var(--color-text-faint)]">{restantes.length === 0 ? "Todos os cargos já foram adicionados." : "Nenhum cargo encontrado."}</p>}
            {termo
              ? grupos.flatMap((g) => g.itens).map((o) => (
                  <button key={o.id} type="button" role="option" onClick={() => escolher(o.nome)} className={itemCls}>
                    {o.nome} {o.nivel && <span className="text-[10px] font-bold uppercase text-[var(--color-text-faint)] ml-1">{o.nivel}</span>}
                  </button>
                ))
              : grupos.map((g) => (
                  <div key={g.nome}>
                    <button
                      type="button"
                      onClick={() => setGrupoAberto((cur) => (cur === g.nome ? null : g.nome))}
                      aria-expanded={grupoAberto === g.nome}
                      className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-black uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-none cursor-pointer"
                    >
                      <span>{g.nome} <span className="font-bold normal-case tracking-normal">({g.itens.length})</span></span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${grupoAberto === g.nome ? "rotate-180" : ""}`} />
                    </button>
                    {grupoAberto === g.nome && g.itens.map((o) => (
                      <button key={o.id} type="button" role="option" onClick={() => escolher(o.nome)} className={itemCls}>{o.nome}</button>
                    ))}
                  </div>
                ))}
          </div>
        )}
      </div>

      {value.length > 1 && (
        <p className="text-[11px] text-[var(--color-text-muted)]">A pessoa acessa tudo que qualquer um dos cargos libera (as permissões somam).</p>
      )}
    </div>
  );
}

/** Cargos iniciais para editar: os já gravados ou, na falta, as partes do texto antigo ("Administrador / Dev") que existem em Cargos. */
export function cargosIniciais(cargosGravados: string[] | undefined, textoCargo: string | undefined, cadastrados: { nome: string }[]): string[] {
  if (Array.isArray(cargosGravados) && cargosGravados.length > 0) return cargosGravados;
  const nomes = new Map(cadastrados.map((c) => [c.nome.trim().toLowerCase(), c.nome]));
  const partes = String(textoCargo || "").split("/").map((p) => p.trim().toLowerCase()).filter(Boolean);
  return [...new Set(partes.map((p) => nomes.get(p)).filter(Boolean) as string[])];
}
