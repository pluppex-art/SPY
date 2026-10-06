import { useEffect, useMemo, useState } from "react";
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
import { FileText, Edit2, Trash2, Download } from "lucide-react";
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
  /** Derivado em Propostas.tsx a partir do vendedor da proposta que
   * originou o contrato (contracts.proposalId -> proposals.vendedor). */
  responsavel?: string | null;
}

interface ContractsTableProps {
  contracts: Contract[];
  /** Busca/filtros vivem no card "KPIs & Filtros" de Contracts.tsx; a tabela recebe a lista já filtrada. */
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
  contracts,
  onDelete, onEdit, onDownloadPdf,
}: ContractsTableProps) {
  const { formatCurrency } = useLocalization();

  const filtered = contracts;

  // Mesmo componente de paginação da Base de Clientes (ClientesList.tsx) —
  // antes era um botão "Carregar mais" aqui e páginas numeradas lá, dois
  // padrões diferentes pra telas de lista quase idênticas do mesmo módulo.
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [contracts]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [filtered, page]);

  return (
    <Card className="overflow-hidden">
      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum contrato encontrado"
          description="Ajuste a busca ou cadastre um novo contrato"
          className="border-none rounded-none"
        />
      ) : (
        <div className="overflow-x-auto">
        <Table className="whitespace-nowrap">
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
                    <span className="truncate max-w-[240px]" title={contract.client}>{contract.client}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="max-w-[260px]" title={contract.plan}>
                    <span className="truncate">{contract.plan}</span>
                  </Badge>
                </TableCell>
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
