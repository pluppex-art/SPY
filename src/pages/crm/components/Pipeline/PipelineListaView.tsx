import { useState, useEffect } from "react";
import { Card } from "../../../../components/ui/card";
import { Badge, type BadgeProps } from "../../../../components/ui/badge";
import { Pagination } from "../../../../components/ui/Pagination";
import { Mail, Phone, Calendar, MoreHorizontal, Tag } from "lucide-react";

const PAGE_SIZE = 50;

interface PipelineListaViewProps {
  listaLeads: any[];
  sellers: string[];
  temperatureFilter: string;
  setTemperatureFilter: (v: string) => void;
  sortOrder: "desc" | "asc";
  setSortOrder: (fn: (o: "desc" | "asc") => "desc" | "asc") => void;
  setSelectedLead: (lead: any) => void;
  updateLead: (id: string, updates: any) => void;
}

// Mesma paleta "semântica" já usada no resto do CRM (ver Badge.tsx) — nunca
// uma cor hardcoded por status, pra funcionar igual no claro e no escuro.
const STATUS_VARIANT: Record<string, BadgeProps["variant"]> = {
  "Novo": "info",
  "Qualificado": "cyan",
  "Em Negociação": "warning",
  "Fechado": "success",
  "Perdido": "destructive",
};
const PRIORITY_VARIANT: Record<string, BadgeProps["variant"]> = {
  "Alta": "destructive",
  "Média": "warning",
  "Baixa": "neutral",
};

function LeadTags({ tags }: { tags: any }) {
  const list: string[] = Array.isArray(tags) ? tags : [];
  if (list.length === 0) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap mt-1">
      {list.slice(0, 3).map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[9px] font-bold text-[var(--color-text-muted)]"
        >
          <Tag className="w-2 h-2" /> {tag}
        </span>
      ))}
    </div>
  );
}

export function PipelineListaView({
  listaLeads, sellers,
  temperatureFilter, setTemperatureFilter, sortOrder, setSortOrder,
  setSelectedLead, updateLead,
}: PipelineListaViewProps) {
  // A visão de lista renderizava TODOS os leads filtrados como <tr>/<Card>
  // de uma vez — com milhares de leads (Pipeline sem cap, ao contrário do
  // Kanban), isso trava o navegador (DOM gigante), independente de quão
  // rápido os dados chegam. Pagina só a renderização aqui — os dados já
  // estão todos em memória, não é uma nova busca.
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [listaLeads.length, temperatureFilter, sortOrder]);
  const totalPages = Math.max(1, Math.ceil(listaLeads.length / PAGE_SIZE));
  const pageLeads = listaLeads.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <>
      {/* Busca, vendedor, empresa, cidade, cliente e funil já vêm da barra
          compartilhada (PipelineFilterBar, acima, igual nas duas visões) —
          aqui só o que é específico da Lista: temperatura e ordenação. */}
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <div className="flex items-center gap-2 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-xl px-3 h-10">
          <span className="text-[9px] uppercase font-bold text-[var(--color-text-faint)]">Temp:</span>
          <select value={temperatureFilter} onChange={(e) => setTemperatureFilter(e.target.value)}
            className="bg-transparent border-none text-xs text-[var(--color-text-primary)] focus:outline-none cursor-pointer font-bold">
            <option value="Todas">Todas</option>
            <option value="quente">🔥 Quente</option>
            <option value="morno">☀️ Morno</option>
            <option value="frio">❄️ Frio</option>
          </select>
        </div>
        <button onClick={() => setSortOrder(o => o === "desc" ? "asc" : "desc")}
          className="flex items-center gap-1.5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-xl px-3 h-10 text-[10px] font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer">
          Temp {sortOrder === "desc" ? "▼" : "▲"}
        </button>
      </div>

      {/* Desktop table */}
      <Card className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] overflow-hidden hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-default)]">
              <tr>
                <th className="px-6 py-4">Nome & Empresa</th>
                <th className="px-6 py-4">Contato</th>
                <th className="px-6 py-4">Status / Prioridade</th>
                <th className="px-6 py-4">Valor</th>
                <th className="px-6 py-4">Responsável</th>
                <th className="px-6 py-4">Última Interação</th>
                <th className="px-6 py-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {pageLeads.map((lead: any) => (
                <tr key={lead.id} onClick={() => setSelectedLead(lead)}
                  className="hover:bg-[var(--color-surface-sunken)] transition-colors cursor-pointer group">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary-blue)] transition-colors">{lead.name}</div>
                    <div className="text-[var(--color-text-muted)] text-xs">{lead.company}</div>
                    <LeadTags tags={lead.tags} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-[var(--color-text-muted)] text-xs"><Mail className="w-3 h-3 text-[var(--color-text-faint)] shrink-0" /> {lead.email}</div>
                    <div className="flex items-center gap-2 text-[var(--color-text-muted)] mt-1 text-xs"><Phone className="w-3 h-3 text-[var(--color-text-faint)] shrink-0" /> {lead.phone}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1.5">
                      <Badge variant={STATUS_VARIANT[lead.status] ?? "neutral"} className="w-fit text-[9px] px-2.5 py-0.5">{lead.status}</Badge>
                      <Badge variant={PRIORITY_VARIANT[lead.priority] ?? "neutral"} className="w-fit text-[8px] px-2 py-0.5 uppercase">{lead.priority}</Badge>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-[var(--color-text-primary)]">{lead.value}</td>
                  <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                    <select value={lead.seller || ""} onChange={(e) => updateLead(lead.id, { seller: e.target.value })}
                      className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-2.5 py-1 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)] cursor-pointer hover:bg-[var(--color-surface-elevated)]">
                      <option value="">Sem Vendedor</option>
                      {sellers.filter((s: string) => s !== "Todos").map((s: string) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-6 py-4 text-[var(--color-text-muted)] text-xs">
                    <div className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {lead.date}</div>
                    <div className="text-[10px] mt-1 italic">{lead.title}</div>
                    {lead.timeIdle !== undefined && (
                      <div className="mt-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold inline-block ${lead.timeIdle > 7 ? "bg-warning/10 text-warning border border-warning/25" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-faint)]"}`}>
                          ⏳ {lead.timeIdle}d sem contato
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-lg hover:bg-[var(--color-border-subtle)] transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {listaLeads.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-[var(--color-text-faint)] text-sm">Nenhum lead encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile cards */}
      <div className="space-y-3 sm:hidden">
        {pageLeads.map((lead: any) => (
          <Card key={lead.id} onClick={() => setSelectedLead(lead)}
            className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] active:border-[var(--color-primary-blue)]/40 transition-all flex flex-col gap-3 cursor-pointer">
            <div className="flex justify-between items-start">
              <div className="min-w-0">
                <h4 className="font-bold text-[var(--color-text-primary)] text-sm truncate">{lead.name}</h4>
                <p className="text-xs text-[var(--color-text-muted)] truncate">{lead.company}</p>
                <LeadTags tags={lead.tags} />
              </div>
              <Badge variant={PRIORITY_VARIANT[lead.priority] ?? "neutral"} className="text-[8px] px-2 py-0.5 uppercase shrink-0 ml-2">{lead.priority}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs border-y border-[var(--color-border-subtle)] py-2 px-1">
              <div>
                <span className="text-[8px] text-[var(--color-text-faint)] uppercase font-bold block mb-0.5">Valor</span>
                <span className="font-mono text-[var(--color-text-primary)] text-xs">{lead.value}</span>
              </div>
              <div>
                <span className="text-[8px] text-[var(--color-text-faint)] uppercase font-bold block mb-0.5">Status</span>
                <Badge variant={STATUS_VARIANT[lead.status] ?? "neutral"} className="text-[8px] px-2 py-0.5">{lead.status}</Badge>
              </div>
            </div>
            <div className="flex justify-between items-center text-[10px] text-[var(--color-text-faint)]">
              <span className="truncate">{lead.email}</span>
              <span className="shrink-0 font-medium ml-2">{lead.phone}</span>
            </div>
          </Card>
        ))}
        {listaLeads.length === 0 && (
          <div className="p-8 border border-dashed border-[var(--color-border-default)] rounded-xl text-center text-[var(--color-text-faint)]">Nenhum lead encontrado</div>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} total={listaLeads.length} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="lead" />
    </>
  );
}
