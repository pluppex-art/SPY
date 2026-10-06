import { useEffect, useMemo, useState } from "react";
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
import { FileText, Search, Edit2, Trash2, Download } from "lucide-react";
import { useLocalization } from "../../../../contexts/LocalizationContext";
import { normalizeText } from "../../../../lib/utils";

interface Contract {
  id: string;
  client: string;
  plan: string;
  description?: string | null;
  mrr: string | number;
  /** Valor total do contrato (recorrente + avulso/implantação) — igual ao
   * MRR só em contratos pontuais de 1 mês; num contrato anual, por exemplo,
   * é bem maior que a mensalidade sozinha. */
  totalValue?: number;
  status: string;
  date: string;
  endDate?: string | null;
  progress?: number;
  /** Derivado em Propostas.tsx a partir do vendedor da proposta que
   * originou o contrato (contracts.proposalId -> proposals.vendedor). */
  responsavel?: string | null;
}

interface ContractsTableProps {
  contracts: Contract[];
  searchQuery: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  planFilter: string;
  onPlanFilterChange: (v: string) => void;
  vendedorFilter: string;
  onVendedorFilterChange: (v: string) => void;
  onDelete: (id: string) => void;
  onEdit: (contract: Contract) => void;
  onDownloadPdf: (contract: Contract) => void;
}

function statusBadgeVariant(status: string): "success" | "warning" | "destructive" | "secondary" {
  if (status === "Ativo") return "success";
  if (status === "Inadimplente") return "warning";
  if (status === "Cancelado") return "destructive";
  return "secondary";
}

function parseDateBR(br?: string | null): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br || "");
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

const PAGE_SIZE = 50;

export function ContractsTable({
  contracts, searchQuery, onSearchChange,
  statusFilter, onStatusFilterChange, planFilter, onPlanFilterChange, vendedorFilter, onVendedorFilterChange,
  onDelete, onEdit, onDownloadPdf,
}: ContractsTableProps) {
  const { formatCurrency } = useLocalization();

  // Opções reais dos filtros — só valores que de fato existem nos contratos
  // deste tenant, nunca uma lista fixa.
  const planosDisponiveis = useMemo(() => Array.from(new Set(contracts.map((c) => c.plan).filter(Boolean))).sort(), [contracts]);
  const vendedoresDisponiveis = useMemo(() => Array.from(new Set(contracts.map((c) => c.responsavel).filter(Boolean))).sort() as string[], [contracts]);

  const q = normalizeText(searchQuery);
  const filtered = contracts.filter(c => {
    if (statusFilter !== "Todos" && c.status !== statusFilter) return false;
    if (planFilter !== "Todos" && c.plan !== planFilter) return false;
    if (vendedorFilter !== "Todos" && c.responsavel !== vendedorFilter) return false;
    if (!q) return true;
    return normalizeText(c.client).includes(q) || normalizeText(c.plan).includes(q) || normalizeText(c.responsavel).includes(q);
  });

  // Mesmo componente de paginação da Base de Clientes (ClientesList.tsx) —
  // antes era um botão "Carregar mais" aqui e páginas numeradas lá, dois
  // padrões diferentes pra telas de lista quase idênticas do mesmo módulo.
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [searchQuery, statusFilter, planFilter, vendedorFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [filtered, page]);

  const selectClass = "bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-blue)] font-bold";

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-[var(--color-border-subtle)] flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
          <Input
            type="text"
            placeholder="Buscar cliente, plano ou responsável..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <select value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value)} className={selectClass}>
          <option>Todos</option>
          <option>Ativo</option>
          <option>Inadimplente</option>
          <option>Cancelado</option>
        </select>
        {planosDisponiveis.length > 1 && (
          <select value={planFilter} onChange={(e) => onPlanFilterChange(e.target.value)} className={selectClass}>
            <option>Todos</option>
            {planosDisponiveis.map((p) => <option key={p}>{p}</option>)}
          </select>
        )}
        {vendedoresDisponiveis.length > 1 && (
          <select value={vendedorFilter} onChange={(e) => onVendedorFilterChange(e.target.value)} className={selectClass}>
            <option>Todos</option>
            {vendedoresDisponiveis.map((v) => <option key={v}>{v}</option>)}
          </select>
        )}
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum contrato encontrado"
          description="Ajuste a busca ou cadastre um novo contrato"
          className="border-none rounded-none"
        />
      ) : (
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Mensalidade</TableHead>
              <TableHead>Total do Contrato</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assinatura</TableHead>
              <TableHead>Término</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((contract) => {
              const inicio = parseDateBR(contract.date);
              const fim = parseDateBR(contract.endDate);
              const duracaoDias = inicio && fim ? Math.round((fim.getTime() - inicio.getTime()) / 86400000) : null;
              const progresso = inicio && fim && duracaoDias
                ? Math.max(0, Math.min(100, Math.round(((Date.now() - inicio.getTime()) / (fim.getTime() - inicio.getTime())) * 100)))
                : null;
              return (
              <TableRow key={contract.id} className="group cursor-pointer" onClick={() => onEdit(contract)}>
                <TableCell>
                  <div className="font-semibold text-[var(--color-text-primary)] group-hover:text-accent transition-colors flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center shrink-0">
                      <FileText className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" />
                    </div>
                    {contract.client}
                  </div>
                </TableCell>
                <TableCell><Badge variant="secondary">{contract.plan}</Badge></TableCell>
                <TableCell className="text-[var(--color-text-muted)] text-xs max-w-[220px] truncate" title={contract.description || undefined}>
                  {contract.description || "—"}
                </TableCell>
                <TableCell className="font-mono font-medium text-success">{contract.mrr}</TableCell>
                <TableCell>
                  <div className="font-mono font-medium text-[var(--color-text-primary)]">
                    {contract.totalValue !== undefined ? formatCurrency(contract.totalValue) : "—"}
                  </div>
                  {duracaoDias !== null && <div className="text-[9px] text-[var(--color-text-faint)]">{duracaoDias} dias</div>}
                </TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(contract.status)}>{contract.status}</Badge>
                </TableCell>
                <TableCell className="text-[var(--color-text-muted)] text-xs">
                  <div className="flex flex-col justify-center gap-1.5 h-[36px]">
                    {contract.date}
                    {progresso !== null && (
                      <div className="w-24 h-1 bg-[var(--color-border-default)] rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--color-primary-blue)]" style={{ width: `${progresso}%` }} />
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-[var(--color-text-muted)] text-xs">
                  {contract.endDate || "Sem prazo definido"}
                </TableCell>
                <TableCell className="text-[var(--color-text-muted)] text-xs">
                  {contract.responsavel || "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onEdit(contract)}
                      title="Editar contrato"
                      className="p-2 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] hover:border-[var(--color-border-default)] rounded-xl transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDownloadPdf(contract)}
                      title="Baixar PDF do contrato"
                      className="p-2 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-accent hover:bg-accent/10 hover:border-accent/25 rounded-xl transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete(contract.id)}
                      title="Excluir contrato"
                      className="p-2 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-danger hover:bg-danger/10 hover:border-danger/25 rounded-xl transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            );})}
          </TableBody>
        </Table>
        </div>
      )}
      <div className="p-4 border-t border-[var(--color-border-subtle)]">
        <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="contrato" />
      </div>
    </Card>
  );
}
