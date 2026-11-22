import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Printer, Copy, Check, ClipboardList, Eye } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { ImplementationReportView, buildReportText, type ImplementationReportProps } from "../../components/implementacao/ImplementationReportView";
import { useData } from "../../contexts/DataContext";
import { cn } from "../../lib/utils";
import type { ImplementationStatus } from "../../lib/implementationForm";

export default function ImplementacaoRelatorio() {
  const { id } = useParams();
  const { implementations, clienteBase } = useData();
  const [audience, setAudience] = useState<"team" | "client">("team");
  const [copiado, setCopiado] = useState(false);

  const impl = (implementations as any[]).find((i) => i.id === id);
  const cliente = impl ? (clienteBase as any[]).find((c) => c.id === impl.cliente_id) : null;

  if (!impl) {
    return (
      <PageContainer title="Relatório de implementação" breadcrumb={[{ label: "Vendas" }, { label: "Implementações", path: "/app/crm/implementacoes" }, { label: "Relatório" }]}>
        <EmptyState
          icon={ClipboardList}
          title="Implementação não encontrada"
          action={<Link to="/app/crm/implementacoes"><Button variant="outline" className="h-9 px-4 text-xs gap-1.5"><ArrowLeft className="w-3.5 h-3.5" /> Voltar</Button></Link>}
        />
      </PageContainer>
    );
  }

  const props: ImplementationReportProps = {
    clienteNome: cliente?.name || "Cliente",
    status: impl.status as ImplementationStatus,
    responsavel: impl.responsavel,
    goLiveDate: impl.go_live_date,
    startedAt: impl.started_at,
    data: impl.data || {},
    internalNotes: impl.internal_notes,
    audience,
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(buildReportText(props));
      setCopiado(true);
      toast.success("Resumo copiado — é só colar no WhatsApp ou e-mail.");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Use Imprimir / PDF.");
    }
  };

  return (
    <PageContainer
      title={`Relatório — ${props.clienteNome}`}
      description="Visão completa da implantação: o que está pronto, o que falta e as respostas de cada seção."
      breadcrumb={[{ label: "Vendas" }, { label: "Implementações", path: "/app/crm/implementacoes" }, { label: props.clienteNome, path: `/app/crm/implementacoes/${impl.id}` }, { label: "Relatório" }]}
      actions={
        <div className="flex items-center gap-2 flex-wrap print:hidden">
          <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]" title="Alterna entre o que a equipe vê e o que o cliente veria">
            {([{ id: "team", label: "Equipe" }, { id: "client", label: "Visão do cliente" }] as const).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setAudience(o.id)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded cursor-pointer transition-all flex items-center gap-1",
                  audience === o.id ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                )}
              >
                {o.id === "client" && <Eye className="w-3 h-3" />}{o.label}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={copiar} className="h-9 px-4 text-xs font-medium gap-1.5">
            {copiado ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />} Copiar resumo
          </Button>
          <Button onClick={() => window.print()} className="h-9 px-4 text-xs font-medium gap-1.5">
            <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
          </Button>
        </div>
      }
    >
      <div className="max-w-5xl mx-auto pb-12">
        <ImplementationReportView {...props} />
      </div>
    </PageContainer>
  );
}
