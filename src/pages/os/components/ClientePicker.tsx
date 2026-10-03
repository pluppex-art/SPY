import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Mail, MapPin, Phone, Search, X } from "lucide-react";
import { useData } from "../../../contexts/DataContext";
import { cn } from "../../../lib/utils";
import { enderecoDoCliente } from "../clienteOs";

interface Props {
  /** id do cliente escolhido (Base de Clientes). */
  clienteId: string | null | undefined;
  onSelect: (cliente: any | null) => void;
  disabled?: boolean;
  /** Clientes que não devem aparecer (ex.: já têm implementação). */
  excluirIds?: Set<string>;
  placeholder?: string;
  /** Mostra os dados do cliente escolhido (documento, telefone, e-mail, endereço) logo abaixo. */
  mostrarDados?: boolean;
}

const normaliza = (s?: string | null) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Escolhe um cliente da Base de Clientes com busca por nome, documento, telefone ou e-mail. */
export function ClientePicker({ clienteId, onSelect, disabled, excluirIds, placeholder = "Buscar cliente…", mostrarDados = true }: Props) {
  const { clienteBase } = useData();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const raiz = useRef<HTMLDivElement>(null);

  const selecionado = useMemo(() => (clienteBase as any[]).find(c => c.id === clienteId) ?? null, [clienteBase, clienteId]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const opcoes = useMemo(() => {
    const q = normaliza(busca).trim();
    const qDigitos = q.replace(/\D/g, "");
    return (clienteBase as any[])
      .filter(c => !excluirIds?.has(c.id))
      .filter(c => {
        if (!q) return true;
        if (normaliza(c.name).includes(q) || normaliza(c.email).includes(q)) return true;
        return qDigitos.length >= 3 && [c.documento, c.phone].some(v => String(v ?? "").replace(/\D/g, "").includes(qDigitos));
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .slice(0, 30);
  }, [clienteBase, busca, excluirIds]);

  const escolher = (c: any | null) => {
    onSelect(c);
    setAberto(false);
    setBusca("");
  };

  const endereco = selecionado ? enderecoDoCliente(selecionado) : "";
  const dados = selecionado
    ? [
        { icon: Building2, valor: selecionado.documento },
        { icon: Phone, valor: selecionado.phone },
        { icon: Mail, valor: selecionado.email },
        { icon: MapPin, valor: endereco },
      ].filter(d => d.valor)
    : [];

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAberto(a => !a)}
        className="w-full flex items-center justify-between gap-2 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-left focus:outline-none focus:border-[var(--color-primary-blue)] disabled:opacity-60"
      >
        <span className={cn("truncate", selecionado ? "text-[var(--color-text-primary)] font-medium" : "text-[var(--color-text-faint)]")}>
          {selecionado ? selecionado.name : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selecionado && !disabled && (
            <span
              role="button"
              aria-label="Limpar cliente"
              onClick={e => { e.stopPropagation(); escolher(null); }}
              className="p-0.5 rounded text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)]"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-faint)]" />
        </span>
      </button>

      {aberto && (
        <div className="absolute z-[110] mt-1 w-full rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] shadow-xl overflow-hidden">
          <div className="relative border-b border-[var(--color-border-subtle)]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-faint)]" />
            <input
              autoFocus
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Nome, CPF/CNPJ, telefone ou e-mail"
              className="w-full bg-transparent pl-9 pr-3 py-2.5 text-xs focus:outline-none"
            />
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {opcoes.length === 0 && <li className="px-3 py-3 text-xs text-[var(--color-text-faint)]">Nenhum cliente encontrado.</li>}
            {opcoes.map(c => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => escolher(c)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--color-surface-sunken)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-[var(--color-text-primary)] truncate">{c.name}</span>
                    <span className="block text-[10px] text-[var(--color-text-faint)] truncate">
                      {[c.documento, c.phone, c.email].filter(Boolean).join(" · ") || "Sem documento/contato"}
                    </span>
                  </span>
                  {c.id === clienteId && <Check className="w-3.5 h-3.5 text-[var(--color-primary-blue)] shrink-0" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mostrarDados && selecionado && dados.length > 0 && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]/60 px-3 py-2">
          {dados.map(({ icon: Icon, valor }, i) => (
            <span key={i} className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)] min-w-0">
              <Icon className="w-3 h-3 shrink-0 text-[var(--color-text-faint)]" />
              <span className="truncate">{valor}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
