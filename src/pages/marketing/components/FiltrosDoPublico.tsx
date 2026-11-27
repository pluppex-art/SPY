/** Filtros do público de e-mail em listas: uma por assunto (origem, status, canal, campanha), com caixa de marcar e contagem. */
import { useState } from "react";
import { Search } from "lucide-react";
import { cn } from "../../../lib/utils";

export interface Opcao { value: string; count: number }
export interface GrupoDeFiltro {
  titulo: string;
  opcoes: Opcao[];
  marcados: string[];
  onMarcados: (v: string[]) => void;
  /** Texto de uma opção sem valor. */
  vazio?: string;
}

const COM_BUSCA = 8;
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function ListaDeFiltro({ titulo, opcoes, marcados, onMarcados, vazio = "—" }: GrupoDeFiltro) {
  const [busca, setBusca] = useState("");
  const visiveis = busca ? opcoes.filter((o) => semAcento(o.value || vazio).includes(semAcento(busca))) : opcoes;
  return (
    <fieldset className="min-w-0 m-0 p-0 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface)] overflow-hidden">
      <legend className="sr-only">{titulo}</legend>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]">
        <span className="text-[11px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">{titulo}</span>
        {marcados.length > 0 && (
          <button type="button" onClick={() => onMarcados([])} className="text-[11px] font-bold text-[var(--color-primary-blue)] bg-transparent border-0 p-0 cursor-pointer hover:underline">
            {marcados.length} marcado{marcados.length > 1 ? "s" : ""} · limpar
          </button>
        )}
      </div>
      {opcoes.length > COM_BUSCA && (
        <label className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-border-subtle)]">
          <Search className="w-3.5 h-3.5 shrink-0 text-[var(--color-text-faint)]" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar" aria-label={`Buscar em ${titulo}`}
            className="w-full bg-transparent border-0 outline-none text-xs text-[var(--color-text-primary)] p-0" />
        </label>
      )}
      <ul className="max-h-44 overflow-y-auto divide-y divide-[var(--color-border-subtle)] m-0 p-0 list-none">
        {visiveis.map((o) => {
          const marcado = marcados.includes(o.value);
          return (
            <li key={o.value}>
              <label className={cn("flex items-center gap-2.5 px-3 py-2 cursor-pointer text-xs", marcado ? "bg-[var(--color-primary-blue)]/10" : "hover:bg-[var(--color-surface-sunken)]")}>
                <input type="checkbox" checked={marcado} onChange={() => onMarcados(marcado ? marcados.filter((v) => v !== o.value) : [...marcados, o.value])} />
                <span title={o.value || vazio} className={cn("flex-1 min-w-0 truncate text-[var(--color-text-primary)]", marcado ? "font-bold" : "font-medium")}>{o.value || vazio}</span>
                <span className="shrink-0 tabular-nums font-bold text-[var(--color-text-muted)]">{o.count.toLocaleString("pt-BR")}</span>
              </label>
            </li>
          );
        })}
        {visiveis.length === 0 && <li className="px-3 py-3 text-xs text-[var(--color-text-faint)]">Nada encontrado.</li>}
      </ul>
    </fieldset>
  );
}

/** Mesma lista com os mesmos números (ex.: canal igual à origem) não precisa aparecer duas vezes. */
export const mesmasOpcoes = (a: Opcao[], b: Opcao[]) => {
  const chave = (l: Opcao[]) => JSON.stringify(l.map((o) => `${o.value}\u0000${o.count}`).sort());
  return a.length === b.length && chave(a) === chave(b);
};

export function FiltrosDoPublico({ grupos }: { grupos: GrupoDeFiltro[] }) {
  // Um grupo repetido só some enquanto não tem nada marcado nele.
  const visiveis = grupos.filter((g, i) => g.opcoes.length > 0 && (g.marcados.length > 0 || !grupos.slice(0, i).some((a) => mesmasOpcoes(a.opcoes, g.opcoes))));
  if (!visiveis.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 items-start">
      {visiveis.map((g) => <ListaDeFiltro key={g.titulo} {...g} />)}
    </div>
  );
}
