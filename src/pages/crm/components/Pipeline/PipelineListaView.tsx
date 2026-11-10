import React, { useState, useEffect } from "react";
import { formatPhoneBR, whatsappDigits } from "../../../../lib/utils";
import { leadCity, leadState } from "../../../../lib/leadLocation";
import { Card } from "../../../../components/ui/card";
import { Badge, type BadgeProps } from "../../../../components/ui/badge";
import { Pagination } from "../../../../components/ui/Pagination";
import { Mail, Phone, Calendar, MoreHorizontal, Tag, MapPin } from "lucide-react";

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

/** Uma linha de contato (telefone ou e-mail): ícone em destaque, rótulo pequeno e valor legível; clique abre WhatsApp/e-mail sem abrir o lead. */
function ContatoLinha({ icon, rotulo, valor, vazio, href, dica, quebra }: { icon: React.ReactNode; rotulo: string; valor: string; vazio: string; href?: string; dica: string; quebra?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${valor ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-faint)]"}`}>{icon}</span>
      <span className="min-w-0 flex flex-col leading-snug">
        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-faint)]">{rotulo}</span>
        {valor ? (
          href ? (
            <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" title={dica} onClick={(e) => e.stopPropagation()}
              className={`text-[13px] font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary-blue)] hover:underline ${quebra ? "block max-w-[230px] truncate" : "whitespace-nowrap"}`}>{valor}</a>
          ) : <span title={valor} className={`text-[13px] font-semibold text-[var(--color-text-primary)] ${quebra ? "block max-w-[230px] truncate" : ""}`}>{valor}</span>
        ) : <span className="text-xs italic text-[var(--color-text-faint)]">{vazio}</span>}
      </span>
    </div>
  );
}

export function PipelineListaView({
  listaLeads, sellers,
  temperatureFilter, sortOrder,
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
      {/* Desktop table */}
      <Card className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] overflow-hidden hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm text-left">
            <thead className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-default)]">
              <tr>
                <th className="pl-6 pr-3 py-3.5 min-w-[210px]">Nome & Empresa</th>
                <th className="px-3 py-3.5 min-w-[250px]">Contato</th>
                <th className="px-3 py-3.5 min-w-[150px]">Cidade / Estado</th>
                <th className="px-3 py-3.5">Status / Prioridade</th>
                <th className="px-3 py-3.5">Valor</th>
                <th className="px-3 py-3.5">Responsável</th>
                <th className="px-3 py-3.5">Última Interação</th>
                <th className="pl-3 pr-6 py-3.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {pageLeads.map((lead: any) => (
                <tr key={lead.id} onClick={() => setSelectedLead(lead)}
                  className="hover:bg-[var(--color-surface-sunken)] transition-colors cursor-pointer group">
                  <td className="pl-6 pr-3 py-3.5 align-top">
                    <div className="font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary-blue)] transition-colors">{lead.name}</div>
                    <div className="text-[var(--color-text-muted)] text-xs">{lead.company}</div>
                    <LeadTags tags={lead.tags} />
                  </td>
                  <td className="px-3 py-3.5 align-top">
                    <div className="flex flex-col gap-2 min-w-[240px]">
                      <ContatoLinha icon={<Phone className="w-3.5 h-3.5" />} rotulo="Telefone" valor={formatPhoneBR(lead.phone)} vazio="Sem telefone"
                        href={whatsappDigits(lead.phone) ? `https://wa.me/${whatsappDigits(lead.phone)}` : undefined} dica="Abrir no WhatsApp" />
                      <ContatoLinha icon={<Mail className="w-3.5 h-3.5" />} rotulo="E-mail" valor={String(lead.email ?? "").trim()} vazio="Sem e-mail"
                        href={String(lead.email ?? "").trim() ? `mailto:${String(lead.email).trim()}` : undefined} dica="Enviar e-mail" quebra />
                    </div>
                  </td>
                  <td className="px-3 py-3.5 align-top">
                    {(() => {
                      const cidade = leadCity(lead), uf = leadState(lead);
                      if (!cidade && !uf) return <span className="text-xs italic text-[var(--color-text-faint)]">—</span>;
                      return (
                        <div className="flex items-center gap-2.5 min-w-[130px]">
                          <span className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]"><MapPin className="w-3.5 h-3.5" /></span>
                          <span className="min-w-0 flex flex-col leading-tight">
                            <span className="text-[13px] font-semibold text-[var(--color-text-primary)] break-words">{cidade || uf}</span>
                            {cidade && uf && <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-faint)]">{uf}</span>}
                          </span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-3.5 align-top">
                    <div className="flex flex-col gap-1.5">
                      <Badge variant={STATUS_VARIANT[lead.status] ?? "neutral"} className="w-fit text-[9px] px-2.5 py-0.5">{lead.status}</Badge>
                      <Badge variant={PRIORITY_VARIANT[lead.priority] ?? "neutral"} className="w-fit text-[8px] px-2 py-0.5 uppercase">{lead.priority}</Badge>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 align-top font-mono text-xs whitespace-nowrap text-[var(--color-text-primary)]">{lead.value}</td>
                  <td className="px-3 py-3.5 align-top" onClick={(e) => e.stopPropagation()}>
                    <select value={lead.seller || ""} onChange={(e) => updateLead(lead.id, { seller: e.target.value })}
                      className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-2.5 py-1 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)] cursor-pointer hover:bg-[var(--color-surface-elevated)]">
                      <option value="">Sem Vendedor</option>
                      {sellers.filter((s: string) => s !== "Todos").map((s: string) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3.5 align-top text-[var(--color-text-muted)] text-xs">
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
                  <td className="pl-3 pr-6 py-3.5 align-top text-right">
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

      {/* Celular: lista de verdade — uma linha compacta por lead, divididas por filete, sem cartões. */}
      <div className="sm:hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-xl overflow-hidden">
        {pageLeads.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--color-text-faint)]">Nenhum lead encontrado</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border-subtle)]">
            {pageLeads.map((lead: any) => (
              <li key={lead.id} onClick={() => setSelectedLead(lead)}
                className="px-3.5 py-2.5 flex items-center gap-3 cursor-pointer active:bg-[var(--color-surface-sunken)]">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[13px] text-[var(--color-text-primary)] truncate">{lead.name}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] truncate">{[lead.company, lead.phone].filter(Boolean).join(" · ") || lead.email}</p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className="font-mono text-xs font-bold text-[var(--color-text-primary)]">{lead.value}</span>
                  <Badge variant={STATUS_VARIANT[lead.status] ?? "neutral"} className="text-[8px] px-2 py-0.5">{lead.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} total={listaLeads.length} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="lead" />
    </>
  );
}
