import { useState, useEffect, useMemo } from "react";
import { Card } from "../../../../components/ui/card";
import { Badge } from "../../../../components/ui/badge";
import { Input } from "../../../../components/ui/input";
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
import { Search, Building2, MapPin, Phone, Mail, Trash2, FileText, Users, Pencil } from "lucide-react";
import { normalizeText } from "../../../../lib/utils";

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
}

interface ClientesListProps {
  clientes: Cliente[];
  /** Decisor "principal" (cliente_contatos.principal=true) por cliente —
   * mostrado junto com o Documento na tabela. */
  decisorPorCliente?: Record<string, { nome: string; cargo?: string | null }>;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  sectorFilter: string;
  onSectorChange: (v: string) => void;
  statusFilter: string;
  onStatusChange: (v: string) => void;
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

export function ClientesList({
  clientes, decisorPorCliente = {}, searchQuery, onSearchChange,
  sectorFilter, onSectorChange, statusFilter, onStatusChange, onDelete, onEdit, onManageContatos, onOpenDetalhes,
}: ClientesListProps) {
  const filtered = useMemo(() => clientes.filter(c => {
    if (statusFilter !== "Todos as situações" && c.status !== statusFilter) return false;
    if (sectorFilter !== "Todos os setores" && c.industry !== sectorFilter) return false;
    if (searchQuery) {
      const term = normalizeText(searchQuery);
      return normalizeText(c.name).includes(term) ||
             normalizeText(c.email).includes(term) ||
             normalizeText(c.industry).includes(term);
    }
    return true;
  }), [clientes, statusFilter, sectorFilter, searchQuery]);

  // Renderizava TODOS os clientes filtrados de uma vez — pagina só a
  // exibição (os dados já estão em memória).
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [statusFilter, sectorFilter, searchQuery]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const selectClass = "bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-blue)] font-bold";

  return (
    <Card className="overflow-hidden">
      {/* Filters bar */}
      <div className="p-4 border-b border-[var(--color-border-subtle)] flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar cliente..."
            className="pl-9"
          />
        </div>
        <select
          value={sectorFilter}
          onChange={(e) => onSectorChange(e.target.value)}
          className={selectClass}
        >
          <option>Todos os setores</option>
          <option>Tecnologia</option>
          <option>Engenharia</option>
          <option>Saúde</option>
          <option>Varejo</option>
          <option>Indústria</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          className={selectClass}
        >
          <option>Todos as situações</option>
          <option>Ativo</option>
          <option>Em Implantação</option>
          <option>Inativo</option>
        </select>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Nenhum cliente encontrado"
            description="Ajuste os filtros ou cadastre um novo cliente"
            className="border-none rounded-none"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Localização</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((c) => (
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
                      {c.industry}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-[var(--color-text-muted)] text-xs">
                      <span className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-[var(--color-text-faint)]" /> {c.email}</span>
                      <span className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-[var(--color-text-faint)]" /> {c.phone}</span>
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
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
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
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
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
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(c); }}
                  className="p-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10 rounded transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onManageContatos(c.id); }}
                  className="p-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10 rounded transition-colors"
                >
                  <Users className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                  className="p-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-danger hover:bg-danger/10 rounded transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="bg-[var(--color-surface-sunken)] px-2 py-0.5 rounded text-[9px] uppercase font-bold text-[var(--color-text-muted)]">{c.industry}</span>
              <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-faint)]"><MapPin className="w-3 h-3" /> {localizacaoLabel(c.city, c.state)}</span>
            </div>
            <div className="pt-2 border-t border-[var(--color-border-subtle)] flex flex-col gap-1.5 text-[11px] text-[var(--color-text-muted)]">
              <div className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-[var(--color-text-faint)] shrink-0" /><span className="truncate">{c.email}</span></div>
              <div className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-[var(--color-text-faint)] shrink-0" /><span>{c.phone}</span></div>
              {c.documento && (
                <div className="flex items-center gap-1.5"><FileText className="w-3 h-3 text-[var(--color-text-faint)] shrink-0" /><span className="font-mono">{c.documento}</span></div>
              )}
              {decisorPorCliente[c.id] && (
                <div className="flex items-center gap-1.5" title="Decisor (contato principal)">
                  <Users className="w-3 h-3 text-[var(--color-text-faint)] shrink-0" />
                  <span className="truncate">
                    {decisorPorCliente[c.id].nome}
                    {decisorPorCliente[c.id].cargo ? ` · ${decisorPorCliente[c.id].cargo}` : ""}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <EmptyState
            icon={Building2}
            title="Nenhum cliente cadastrado"
            className="border-none rounded-none"
          />
        )}
      </div>

      <div className="p-4 border-t border-[var(--color-border-subtle)]">
        <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="cliente" />
      </div>
    </Card>
  );
}
