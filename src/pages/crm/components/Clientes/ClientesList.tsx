import { useState, useEffect, useMemo } from "react";
import { Card } from "../../../../components/ui/card";
import { Badge } from "../../../../components/ui/badge";
import { EmptyState } from "../../../../components/ui/empty-state";
import { Pagination } from "../../../../components/ui/Pagination";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../../../../components/ui/table";
import { Building2, MapPin, Phone, Mail, Trash2, FileText, Users, Pencil, Eye, List, LayoutGrid } from "lucide-react";
import { useLocalization } from "../../../../contexts/LocalizationContext";

const PAGE_SIZE = 50;

// `{city}, {state}` direto no JSX virava uma "," sozinha quando os dois eram
// null (não tem mais fallback fixo tipo "São Paulo" — ver Empresas.tsx/
// NovoClienteModal.tsx/DataContext.tsx createClientFromWonLead). Cliente sem
// localização informada é um estado real e deve dizer isso, não mostrar um
// separador vazio.
function localizacaoLabel(city?: string | null, state?: string | null): string {
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  if (state) return state;
  return "Não informado";
}

function initials(name?: string | null): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

interface Cliente {
  id: string;
  name: string;
  industry?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  status?: string;
  documento?: string | null;
  created_at?: string;
  /** Campos derivados em Clientes.tsx (leads/contracts vinculados) — ver
   * comentário lá. Ausentes num cliente sem lead/contrato correspondente. */
  responsavel?: string | null;
  contratoStatus?: string | null;
  mrr?: number;
}

interface ClientesListProps {
  clientes: Cliente[];
  /** Decisor "principal" (cliente_contatos.principal=true) por cliente —
   * mostrado junto com o Documento na tabela. */
  decisorPorCliente?: Record<string, { nome: string; cargo?: string | null }>;
  /** A busca/filtros agora vivem no card "KPIs & Filtros" de Clientes.tsx; a
   * lista chega já filtrada. */
  onDelete: (id: string) => void;
  onEdit: (cliente: Cliente) => void;
  onManageContatos: (clienteId: string) => void;
  onOpenDetalhes: (clienteId: string) => void;
}

function statusBadgeVariant(status?: string): "success" | "warning" | "secondary" {
  if (status === "Ativo") return "success";
  if (status === "Em Implantação") return "warning";
  return "secondary";
}

function contratoStatusMeta(status?: string | null): { label: string; dot: string } {
  if (status === "Ativo") return { label: "Em dia", dot: "bg-success" };
  if (status === "Inadimplente") return { label: "Inadimplente", dot: "bg-danger" };
  if (status === "Cancelado") return { label: "Cancelado", dot: "bg-[var(--color-text-faint)]" };
  return { label: "Sem contrato", dot: "bg-[var(--color-text-faint)]" };
}

export function ClientesList({
  clientes, decisorPorCliente = {},
  onDelete, onEdit, onManageContatos, onOpenDetalhes,
}: ClientesListProps) {
  const { formatCurrency } = useLocalization();
  const [view, setView] = useState<"list" | "grid">("list");

  const filtered = clientes;

  // Renderizava TODOS os clientes filtrados de uma vez — pagina só a
  // exibição (os dados já estão em memória).
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [clientes]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const actionButtons = (c: Cliente) => (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); onOpenDetalhes(c.id); }}
        title="Ver detalhes"
        aria-label="Ver detalhes"
        className="p-2 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10 rounded-lg transition-colors"
      >
        <Eye className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(c); }}
        title="Editar Cliente"
        aria-label="Editar Cliente"
        className="p-2 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10 rounded-lg transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onManageContatos(c.id); }}
        title="Contatos e Decisores"
        aria-label="Contatos e Decisores"
        className="p-2 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10 rounded-lg transition-colors"
      >
        <Users className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
        title="Remover Cliente"
        aria-label="Remover Cliente"
        className="p-2 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </>
  );

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border-subtle)] flex justify-end">
        <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]">
          <button type="button" onClick={() => setView("list")} title="Lista" className={`p-1.5 rounded-lg transition-colors ${view === "list" ? "bg-[var(--color-primary-blue)] text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}><List className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => setView("grid")} title="Grade" className={`p-1.5 rounded-lg transition-colors ${view === "grid" ? "bg-[var(--color-primary-blue)] text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}><LayoutGrid className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Nenhum cliente encontrado"
          description="Ajuste os filtros ou cadastre um novo cliente"
          className="border-none rounded-none"
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
          {pageItems.map((c) => {
            const contratoMeta = contratoStatusMeta(c.contratoStatus);
            return (
              <div key={c.id} onClick={() => onOpenDetalhes(c.id)} className="p-4 rounded-xl border border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)] hover:shadow-sm cursor-pointer transition-all space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-[var(--color-primary-blue)]" />
                    </div>
                    <span className="font-bold text-[var(--color-text-primary)] text-sm truncate">{c.name}</span>
                  </div>
                  <Badge variant={statusBadgeVariant(c.status)}>{c.status}</Badge>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="bg-[var(--color-surface-sunken)] px-2 py-0.5 rounded font-bold text-[var(--color-text-muted)] uppercase">{c.industry || "—"}</span>
                  <span className="flex items-center gap-1 text-[var(--color-text-faint)]"><span className={`w-1.5 h-1.5 rounded-full ${contratoMeta.dot}`} /> {contratoMeta.label}</span>
                </div>
                <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5"><MapPin className="w-3 h-3 text-[var(--color-text-faint)] shrink-0" /> {localizacaoLabel(c.city, c.state)}</div>
                {!!c.mrr && <div className="text-sm font-black text-[var(--color-text-primary)]">{formatCurrency(c.mrr)}<span className="text-[10px] font-normal text-[var(--color-text-faint)]"> /mês</span></div>}
                <div className="pt-2 border-t border-[var(--color-border-subtle)] flex items-center justify-between">
                  <span className="text-[10px] text-[var(--color-text-faint)]">{c.responsavel || "Sem responsável"}</span>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>{actionButtons(c)}</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente / Empresa</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Localização</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Valor MRR</TableHead>
                <TableHead>Início</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((c) => {
                const contratoMeta = contratoStatusMeta(c.contratoStatus);
                return (
                <TableRow key={c.id} className="cursor-pointer group" onClick={() => onOpenDetalhes(c.id)}>
                  <TableCell>
                    <div className="font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center shrink-0">
                        <Building2 className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" />
                      </div>
                      {c.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-mono text-[var(--color-text-muted)]">{c.documento || "—"}</span>
                      {decisorPorCliente[c.id] && (
                        <span className="text-[10px] text-[var(--color-text-faint)] truncate max-w-[140px]" title="Decisor (contato principal)">
                          {decisorPorCliente[c.id].nome}
                          {decisorPorCliente[c.id].cargo ? ` · ${decisorPorCliente[c.id].cargo}` : ""}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-[10px] font-bold bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] px-2 py-0.5 rounded uppercase tracking-wide">
                      {c.industry || "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {c.responsavel ? (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[var(--color-primary-blue)]/10 flex items-center justify-center shrink-0">
                          <span className="text-[9px] font-black text-[var(--color-primary-blue)]">{initials(c.responsavel)}</span>
                        </div>
                        <span className="text-xs font-bold text-[var(--color-text-muted)] truncate max-w-[90px]">{c.responsavel}</span>
                      </div>
                    ) : <span className="text-xs text-[var(--color-text-faint)]">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-[var(--color-text-muted)] text-xs">
                      <span className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-[var(--color-text-faint)]" /> {c.email || "—"}</span>
                      <span className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-[var(--color-text-faint)]" /> {c.phone || "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[var(--color-text-muted)] text-xs">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 text-[var(--color-text-faint)]" /> {localizacaoLabel(c.city, c.state)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(c.status)}>{c.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]"><span className={`w-1.5 h-1.5 rounded-full ${contratoMeta.dot}`} /> {contratoMeta.label}</span>
                  </TableCell>
                  <TableCell>
                    {c.mrr ? (
                      <div>
                        <div className="text-xs font-black text-[var(--color-text-primary)]">{formatCurrency(c.mrr)}</div>
                        <div className="text-[9px] text-[var(--color-text-faint)]">Mensal</div>
                      </div>
                    ) : <span className="text-xs text-[var(--color-text-faint)]">—</span>}
                  </TableCell>
                  <TableCell className="text-[var(--color-text-muted)] text-xs">{fmtDate(c.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">{actionButtons(c)}</div>
                  </TableCell>
                </TableRow>
              );})}
            </TableBody>
          </Table>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden divide-y divide-[var(--color-border-subtle)]">
          {pageItems.map((c) => (
            <div key={c.id} className="p-4 flex flex-col gap-3 hover:bg-[var(--color-surface-sunken)]/60 transition-all cursor-pointer" onClick={() => onOpenDetalhes(c.id)}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-[var(--color-primary-blue)]" />
                  </div>
                  <span className="font-bold text-[var(--color-text-primary)] text-sm truncate">{c.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={statusBadgeVariant(c.status)}>{c.status}</Badge>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="bg-[var(--color-surface-sunken)] px-2 py-0.5 rounded text-[9px] uppercase font-bold text-[var(--color-text-muted)]">{c.industry || "—"}</span>
                <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-faint)]"><MapPin className="w-3 h-3" /> {localizacaoLabel(c.city, c.state)}</span>
              </div>
              {!!c.mrr && <div className="text-sm font-black text-[var(--color-text-primary)]">{formatCurrency(c.mrr)}<span className="text-[10px] font-normal text-[var(--color-text-faint)]"> /mês</span></div>}
              <div className="pt-2 border-t border-[var(--color-border-subtle)] flex flex-col gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                <div className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-[var(--color-text-faint)] shrink-0" /><span className="truncate">{c.email}</span></div>
                <div className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-[var(--color-text-faint)] shrink-0" /><span>{c.phone}</span></div>
                {c.documento && (
                  <div className="flex items-center gap-1.5"><FileText className="w-3 h-3 text-[var(--color-text-faint)] shrink-0" /><span className="font-mono">{c.documento}</span></div>
                )}
                {c.responsavel && (
                  <div className="flex items-center gap-1.5"><Users className="w-3 h-3 text-[var(--color-text-faint)] shrink-0" /><span className="truncate">{c.responsavel}</span></div>
                )}
              </div>
              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>{actionButtons(c)}</div>
            </div>
          ))}
        </div>
        </>
      )}

      <div className="p-4 border-t border-[var(--color-border-subtle)]">
        <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="cliente" />
      </div>
    </Card>
  );
}
