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
}

interface ContractsTableProps {
  contracts: Contract[];
  searchQuery: string;
  onSearchChange: (v: string) => void;
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

const PAGE_SIZE = 50;

export function ContractsTable({ contracts, searchQuery, onSearchChange, onDelete, onEdit, onDownloadPdf }: ContractsTableProps) {
  const { formatCurrency } = useLocalization();
  const filtered = contracts.filter(c =>
    c.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.plan.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Mesmo componente de paginação da Base de Clientes (ClientesList.tsx) —
  // antes era um botão "Carregar mais" aqui e páginas numeradas lá, dois
  // padrões diferentes pra telas de lista quase idênticas do mesmo módulo.
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [searchQuery]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [filtered, page]);

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-[var(--color-border-subtle)] flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
          <Input
            type="text"
            placeholder="Buscar contratos..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <select className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-4 py-2 text-sm text-[var(--color-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-blue)]">
          <option>Todos os Planos</option>
          <option>Enterprise</option>
          <option>Pro</option>
          <option>Starter</option>
        </select>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum contrato encontrado"
          description="Ajuste a busca ou cadastre um novo contrato"
          className="border-none rounded-none"
        />
      ) : (
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
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((contract) => (
              <TableRow key={contract.id} className="group cursor-pointer">
                <TableCell>
                  <div className="font-semibold text-[var(--color-text-primary)] group-hover:text-accent transition-colors flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center shrink-0">
                      <FileText className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" />
                    </div>
                    {contract.client}
                  </div>
                </TableCell>
                <TableCell className="font-medium text-[var(--color-text-muted)]">{contract.plan}</TableCell>
                <TableCell className="text-[var(--color-text-muted)] text-xs max-w-[220px] truncate" title={contract.description || undefined}>
                  {contract.description || "—"}
                </TableCell>
                <TableCell className="font-mono font-medium text-success">{contract.mrr}</TableCell>
                <TableCell className="font-mono font-medium text-[var(--color-text-primary)]">
                  {contract.totalValue !== undefined ? formatCurrency(contract.totalValue) : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(contract.status)}>{contract.status}</Badge>
                </TableCell>
                <TableCell className="text-[var(--color-text-muted)] text-xs">
                  <div className="flex flex-col justify-center gap-1.5 h-[36px]">
                    {contract.date}
                    <div className="w-24 h-1 bg-[var(--color-border-default)] rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--color-primary-blue)]" style={{ width: `${contract.progress ?? 100}%` }} />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-[var(--color-text-muted)] text-xs">
                  {contract.endDate || "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
            ))}
          </TableBody>
        </Table>
      )}
      <div className="p-4 border-t border-[var(--color-border-subtle)]">
        <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="contrato" />
      </div>
    </Card>
  );
}
