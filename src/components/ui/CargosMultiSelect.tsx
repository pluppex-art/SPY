import { X } from "lucide-react";

interface CargosMultiSelectProps {
  /** Cargos escolhidos; o primeiro é o principal. */
  value: string[];
  onChange: (v: string[]) => void;
  /** Cargos cadastrados na empresa. */
  options: { id: string; nome: string }[];
  className?: string;
}

/** Escolha de uma ou mais áreas/cargos da pessoa (ex.: Administrador + Dev). As permissões somam. */
export function CargosMultiSelect({ value, onChange, options, className }: CargosMultiSelectProps) {
  const restantes = options.filter((o) => !value.includes(o.nome));
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
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
      <select
        value=""
        onChange={(e) => { if (e.target.value) onChange([...value, e.target.value]); }}
        className="w-full h-10 px-3 rounded-lg text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] cursor-pointer focus:outline-none focus:border-[var(--color-primary-blue)]"
        aria-label="Adicionar cargo ou área"
      >
        <option value="">{value.length === 0 ? "Selecione um cargo..." : "+ Adicionar outra área..."}</option>
        {restantes.map((o) => <option key={o.id} value={o.nome}>{o.nome}</option>)}
      </select>
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
