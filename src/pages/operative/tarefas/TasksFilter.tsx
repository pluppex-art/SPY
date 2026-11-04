import React, { useState } from "react";
import { Calendar, Filter, Search, X } from "lucide-react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";

interface TasksFilterProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  deadlineFilter: string;
  setDeadlineFilter: (val: string) => void;
  selectedPriorities: string[];
  setSelectedPriorities: React.Dispatch<React.SetStateAction<string[]>>;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  assigneeFilter: string;
  setAssigneeFilter: (v: string) => void;
  clienteFilter: string;
  setClienteFilter: (v: string) => void;
  statusOptions: { id: string; nome: string }[];
  assigneeOptions: { id: string; nome: string }[];
  clienteOptions: string[];
  activeCount: number;
  onClear: () => void;
}

const selectCls =
  "h-11 xl:h-10 min-w-0 w-full xl:w-auto px-3 rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40 cursor-pointer";

/** Barra de filtros de Tarefas: busca, status, responsável, prioridade, cliente e "Mais filtros" (prazo). */
export function TasksFilter(p: TasksFilterProps) {
  const [showMais, setShowMais] = useState(false);
  // No celular os 4 selects ficam recolhidos atrás de um botão "Filtros" (a busca fica sempre visível).
  const [showSel, setShowSel] = useState(false);
  const selHide = !showSel ? "max-xl:hidden" : "";
  const toggleMobile = () => { const next = !showSel; setShowSel(next); setShowMais(next); };
  return (
    <Card className="p-3 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm space-y-3">
      <div className="grid grid-cols-2 xl:flex xl:flex-row gap-2 max-[479px]:[&>*]:col-span-2">
        <div className="relative col-span-2 xl:col-span-1 xl:flex-1 xl:min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
          <input
            type="text"
            value={p.searchQuery}
            onChange={(e) => p.setSearchQuery(e.target.value)}
            placeholder="Buscar tarefa, cliente, responsável ou palavra-chave..."
            className={cn(selectCls, "w-full pl-9 font-normal cursor-text")}
          />
        </div>
        <Button
          variant="outline"
          onClick={toggleMobile}
          className={cn("xl:hidden h-11 gap-2 text-xs font-bold", (showSel || p.activeCount > 0) && "border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]")}
        >
          <Filter className="w-4 h-4" /> Filtros{p.activeCount > 0 ? ` (${p.activeCount})` : ""}
        </Button>
        <select value={p.statusFilter} onChange={(e) => p.setStatusFilter(e.target.value)} className={cn(selectCls, selHide)}>
          <option value="">Status: Todos</option>
          {p.statusOptions.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
        <select value={p.assigneeFilter} onChange={(e) => p.setAssigneeFilter(e.target.value)} className={cn(selectCls, selHide)}>
          <option value="">Responsável: Todos</option>
          <option value="__none__">Sem responsável</option>
          {p.assigneeOptions.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
        <select
          value={p.selectedPriorities[0] ?? ""}
          onChange={(e) => p.setSelectedPriorities(e.target.value ? [e.target.value] : [])}
          className={cn(selectCls, selHide)}
        >
          <option value="">Prioridade: Todas</option>
          {["Alta", "Média", "Baixa"].map((pr) => <option key={pr} value={pr}>{pr}</option>)}
        </select>
        <select value={p.clienteFilter} onChange={(e) => p.setClienteFilter(e.target.value)} className={cn(selectCls, "col-span-2 xl:col-span-1 xl:max-w-[220px]", selHide)}>
          <option value="">Cliente: Todos</option>
          {p.clienteOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <Button
          variant="outline"
          onClick={() => setShowMais((v) => !v)}
          className={cn("max-xl:hidden col-span-2 xl:col-span-1 h-11 xl:h-10 gap-2 text-xs font-bold", (showMais || p.deadlineFilter) && "border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]")}
        >
          <Filter className="w-4 h-4" /> Mais filtros
        </Button>
      </div>

      {(showMais || p.activeCount > 0) && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-2 border-t border-[var(--color-border-subtle)]">
          {showMais && (
            <div className="flex items-center gap-1.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 h-11 sm:h-10 w-full sm:w-auto">
              <Calendar className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
              <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Prazo até:</span>
              <input
                type="date"
                value={p.deadlineFilter}
                onChange={(e) => p.setDeadlineFilter(e.target.value)}
                className="bg-transparent text-[var(--color-text-primary)] text-[11px] focus:outline-none border-none font-mono cursor-pointer flex-1 min-w-0"
                title="Filtrar por data limite da tarefa"
              />
            </div>
          )}
          {p.activeCount > 0 && (
            <button
              type="button"
              onClick={p.onClear}
              className="flex items-center gap-1 text-xs font-bold text-[var(--color-text-muted)] hover:text-rose-500 bg-transparent border-none cursor-pointer"
            >
              <X className="w-3 h-3" /> Limpar filtros ({p.activeCount})
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
