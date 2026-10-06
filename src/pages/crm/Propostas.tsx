import { useMemo, useState } from "react";
import { DateRangeFilter } from "../../components/ui/DateRangeFilter";
import { Plus, FileText, FileSignature, Workflow, Search, X, Send, Eye as EyeIcon, CheckCircle2, XCircle, FileEdit } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { PageContainer } from "../../components/PageContainer";
import { toast } from "sonner";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { NovaPropostaWizard } from "../../components/ui/modals/crm/NovaPropostaWizard";
import { PropostasKPIs } from "./components/Propostas/PropostasKPIs";
import { PropostasTable, etapaDe } from "./components/Propostas/PropostasTable";
import { ContractsKPIs } from "./components/Contracts/ContractsKPIs";
import { ContractsTable } from "./components/Contracts/ContractsTable";
import { ContractFormModal, type ContractFormPayload } from "./components/Contracts/ContractFormModal";
import { Pagination } from "../../components/ui/Pagination";
import { handleDownloadPdf } from "./utils/proposalPdf";
import { cn } from "../../lib/utils";
import { getFaturamentoContratado } from "../../lib/revenueMetrics";
import { isContractAtivo } from "../../components/ui/drillColumns";
import type { Contract } from "../../types";
import { usePropostasList } from "./usePropostasList";

const FUNIL_ETAPAS: { step: number; label: string; icon: typeof FileEdit; color: string }[] = [
  { step: 1, label: "Rascunho", icon: FileEdit, color: "#94a3b8" },
  { step: 2, label: "Aguardando retorno", icon: Send, color: "var(--color-info)" },
  { step: 3, label: "Visualizada pelo cliente", icon: EyeIcon, color: "var(--color-warning)" },
  { step: 4, label: "Decidida (aceita/recusada)", icon: CheckCircle2, color: "var(--color-success)" },
];

// "Funil de Conversão" — distribuição real das propostas (todas do tenant,
// não só a página/filtro atual) pelas etapas deriváveis de status +
// first_viewed_at (ver etapaDe em PropostasTable.tsx). Sem campo de "etapa"
// granular no banco, esse é o funil mais fiel que dá pra montar sem inventar
// categoria nenhuma.
function FunilConversao({ rows }: { rows: any[] }) {
  const { formatCurrency } = useLocalization();
  const porEtapa = useMemo(() => {
    const counts = FUNIL_ETAPAS.map((e) => ({ ...e, count: 0, valor: 0 }));
    let aceitas = 0, recusadas = 0, valorAceitas = 0;
    rows.forEach((p: any) => {
      const { step } = etapaDe(p);
      const bucket = counts.find((c) => c.step === step) || counts[counts.length - 1];
      bucket.count += 1;
      bucket.valor += Number(p.valor) || 0;
      if (p.status === "Aceita") { aceitas += 1; valorAceitas += Number(p.valor) || 0; }
      if (p.status === "Recusada") recusadas += 1;
    });
    return { counts, aceitas, recusadas, valorAceitas };
  }, [rows]);
  const max = Math.max(1, ...porEtapa.counts.map((c) => c.count));
  const total = rows.length || 1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2 p-6">
        <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)] mb-1">Funil de Conversão</h3>
        <p className="text-[11px] text-[var(--color-text-muted)] mb-5">Em qual etapa cada proposta está agora — da elaboração até a decisão final.</p>
        <div className="space-y-4">
          {porEtapa.counts.map((e) => (
            <div key={e.step}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5"><e.icon className="w-3.5 h-3.5" style={{ color: e.color }} /> {e.label}</span>
                <span className="text-xs font-bold text-[var(--color-text-muted)]">{e.count} · {formatCurrency(e.valor)}</span>
              </div>
              <div className="h-2.5 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, (e.count / max) * 100)}%`, background: e.color }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)] mb-4">Desfecho final</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-success/10">
            <span className="text-xs font-bold text-success flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Aceitas</span>
            <div className="text-right">
              <div className="text-sm font-black text-success">{porEtapa.aceitas}</div>
              <div className="text-[10px] text-success/80">{formatCurrency(porEtapa.valorAceitas)}</div>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-danger/10">
            <span className="text-xs font-bold text-danger flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" /> Recusadas</span>
            <div className="text-sm font-black text-danger">{porEtapa.recusadas}</div>
          </div>
          <div className="pt-3 border-t border-[var(--color-border-subtle)] flex items-center justify-between">
            <span className="text-[11px] text-[var(--color-text-muted)]">Taxa de conversão geral</span>
            <span className="text-sm font-black text-[var(--color-text-primary)]">{Math.round((porEtapa.aceitas / total) * 1000) / 10}%</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function Propostas() {
  const {
    proposals: propostas,
    updateProposal,
    deleteProposal,
    syncAcceptedProposal,
    contracts,
    updateContract,
    deleteContract,
    clienteBase,
    updateClienteBase,
    colaboradores,
    appSettings,
    products,
  } = useData();
  const { user, activeTenantName } = useAuth();

  const [activeTab, setActiveTab] = useState<"propostas" | "contratos" | "funil">("propostas");
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [contractSearch, setContractSearch] = useState("");
  const [isPropostaModalOpen, setIsPropostaModalOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);

  // Busca/pagina propostas direto no Supabase (50 por vez) em vez de filtrar
  // o array `proposals` inteiro do DataContext no cliente — ver
  // src/pages/crm/usePropostasList.ts. Aba de Contratos continua como estava.
  const {
    propostas: pagedPropostas, proposalItems: pagedProposalItems, kpis: propostasKpis,
    page: propostasPage, setPage: setPropostasPage, totalPages: propostasTotalPages,
    pageSize: propostasPageSize, total: propostasTotal, loading: propostasLoading,
    searchQuery: propostasSearch, setSearchQuery: setPropostasSearch, refetch: refetchPropostas,
    statusFiltro, setStatusFiltro, vendedorFiltro, setVendedorFiltro, vendedores, kpiAllRows,
  } = usePropostasList({ dateFrom, dateTo });

  const temFiltrosAtivos = !!propostasSearch || statusFiltro !== "todos" || vendedorFiltro !== "todos" || !!dateFrom || !!dateTo;
  const limparFiltros = () => {
    setPropostasSearch(""); setStatusFiltro("todos"); setVendedorFiltro("todos"); setDateFrom(null); setDateTo(null);
  };

  // Contracts guarda a data como "dd/mm/aaaa" (rowToContract) — converte pra
  // ISO só pra comparar com o filtro, sem mudar o formato de exibição.
  const toIsoBR = (br?: string | null) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br || "");
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  };
  const inRange = (iso: string | null, from: string | null, to: string | null) => {
    if (!iso) return !from && !to;
    if (from && iso < from) return false;
    if (to && iso > to) return false;
    return true;
  };

  const filteredContracts = useMemo(() => {
    if (!dateFrom && !dateTo) return contracts;
    return (contracts as any[]).filter((c) => inRange(toIsoBR(c.date), dateFrom, dateTo));
  }, [contracts, dateFrom, dateTo]);

  // "Responsável" na tabela usa o colaborador gravado direto no contrato
  // (campo real, editável) — cai pro vendedor da proposta de origem só como
  // fallback pra contratos antigos sem responsável definido ainda.
  const contractsEnriquecidos = useMemo(() => {
    return (filteredContracts as any[]).map((c: any) => {
      const colaborador = (colaboradores as any[]).find((col: any) => col.id === c.responsavelId);
      return {
        ...c,
        responsavel: colaborador?.nome || (propostas as any[]).find((p: any) => p.id === c.proposalId)?.vendedor || null,
      };
    });
  }, [filteredContracts, colaboradores, propostas]);

  const [contractStatusFilter, setContractStatusFilter] = useState("Todos");
  const [contractPlanFilter, setContractPlanFilter] = useState("Todos");
  const [contractVendedorFilter, setContractVendedorFilter] = useState("Todos");

  // Sincronização de contrato/fatura + reconciliação de propostas "Aceita" sem
  // contrato correspondente (ou com contrato desatualizado) agora é global —
  // vive em DataContext.tsx e roda assim que os dados do tenant carregam, não
  // só enquanto esta página está aberta (ver comentário lá pra detalhes).
  const handleUpdateStatus = async (id: string, newStatus: any) => {
    updateProposal(id, { status: newStatus });
    setTimeout(refetchPropostas, 300);

    if (newStatus === "Aceita") {
      const prop = (propostas || []).find((p: any) => p.id === id);
      // syncAcceptedProposal já mostra seu próprio toast ("🎉 Proposta
      // Aceita!...") quando de fato cria contrato/fatura — precisa esperar o
      // resultado real (agora async, por causa do lookup de category_id) em
      // vez de tratar a Promise como sempre truthy, senão o toast genérico
      // abaixo nunca mais aparece nem quando nada foi criado (contrato já
      // existia).
      if (prop && await syncAcceptedProposal(prop)) return;
    }
    toast.success(`Proposta atualizada para: ${newStatus}`);
  };

  const valorContratosAtivos = getFaturamentoContratado(filteredContracts || []);

  const handleEditContract = (contract: Contract) => {
    setEditingContract(contract);
  };

  const handleSaveEditContract = async (payload: ContractFormPayload) => {
    if (!editingContract) return;
    const { clienteIndustry, ...contractFields } = payload;
    await updateContract(editingContract.id, contractFields);
    toast.success("Contrato atualizado com sucesso!");
    // Setor do Cliente vive em `clientes.industry`, não no contrato — só
    // grava quando mudou de verdade (mesma regra de Contracts.tsx).
    const clienteAlvo = (clienteBase as any[]).find((c: any) => c.name === payload.client);
    if (clienteAlvo && clienteIndustry && clienteAlvo.industry !== clienteIndustry) {
      await updateClienteBase(clienteAlvo.id, { industry: clienteIndustry });
    }
    setEditingContract(null);
  };

  // Mesmo gerador/branding (logo do tenant) já usado no PDF de Propostas —
  // reaproveita o layout em vez de duplicar a lógica de PDF do zero.
  const handleContractPdf = (contract: Contract) => {
    const empresaDados = appSettings?.empresa_dados || {};
    const mrrNumber = typeof contract.mrr === "number"
      ? contract.mrr
      : parseFloat(String(contract.mrr).replace(/[^\d,.-]/g, "").replace(",", ".")) || 0;
    handleDownloadPdf(
      {
        id: contract.id,
        cliente: contract.client,
        titulo: contract.plan,
        valor: mrrNumber,
        created_at: undefined,
        validade: undefined,
        status: contract.status === "Ativo" ? "Aceita" : "Enviada",
        vendedor: activeTenantName || "S.P.Y.",
      } as any,
      [],
      { logoUrl: empresaDados?.logoUrl, tenantName: activeTenantName }
    );
  };

  return (
    <PageContainer
      title="Propostas & Contratos"
      description="Ciclo comercial completo: elaboração de orçamento, aprovação com conversão em contrato e faturamento integrado."
      actions={
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="lg"
            className="font-bold uppercase tracking-widest text-[10px] bg-[var(--color-surface-elevated)] border-[var(--color-border-default)]"
            onClick={() => toast.info("Apenas modelos premium de engenharia e tecnologia estão ativos no plano.")}
          >
            Modelos
          </Button>
          <Button
            size="lg"
            onClick={() => setIsPropostaModalOpen(true)}
            className="font-black uppercase tracking-widest text-[10px] bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 !text-white"
          >
            <Plus className="w-4 h-4 mr-2" /> Nova Proposta
          </Button>
        </div>
      }
    >
      {/* Abas de Navegação Unificada */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-2 mb-6">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("propostas")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
              activeTab === "propostas"
                ? "bg-[var(--color-primary-blue)] text-white shadow-md shadow-[var(--color-primary-blue)]/20"
                : "bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)]"
            )}
          >
            <FileText className="w-3.5 h-3.5" />
            Propostas Comerciais ({propostasTotal})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("contratos")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
              activeTab === "contratos"
                ? "bg-[var(--color-primary-blue)] text-white shadow-md shadow-[var(--color-primary-blue)]/20"
                : "bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)]"
            )}
          >
            <FileSignature className="w-3.5 h-3.5" />
            Contratos & Faturas ({contracts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("funil")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
              activeTab === "funil"
                ? "bg-[var(--color-primary-blue)] text-white shadow-md shadow-[var(--color-primary-blue)]/20"
                : "bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)]"
            )}
          >
            <Workflow className="w-3.5 h-3.5" />
            Funil de Conversão
          </button>
        </div>
        <DateRangeFilter dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
      </div>

      {activeTab === "propostas" ? (
        <div className="space-y-6">
          <PropostasKPIs kpis={propostasKpis} contracts={contracts as any[]} />

          <Card className="p-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
              <Input value={propostasSearch} onChange={(e) => setPropostasSearch(e.target.value)} placeholder="Buscar por cliente, título ou vendedor..." className="pl-9" />
            </div>
            <select className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface)] px-3 py-2 text-xs" value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}>
              <option value="todos">Status: Todos</option>
              <option value="Rascunho">Rascunho</option>
              <option value="Enviada">Enviada</option>
              <option value="Aceita">Aceita</option>
              <option value="Recusada">Recusada</option>
            </select>
            {vendedores.length > 1 && (
              <select className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface)] px-3 py-2 text-xs" value={vendedorFiltro} onChange={(e) => setVendedorFiltro(e.target.value)}>
                <option value="todos">Responsável: Todos</option>
                {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            )}
            {temFiltrosAtivos && (
              <Button variant="ghost" size="sm" onClick={limparFiltros} className="text-[11px] font-bold gap-1"><X className="w-3.5 h-3.5" /> Limpar filtros</Button>
            )}
          </Card>

          <PropostasTable
            propostas={pagedPropostas as any}
            proposalItems={pagedProposalItems as any}
            onUpdateStatus={handleUpdateStatus}
            onDelete={async (id) => {
              // Achado real: isso disparava o toast de sucesso na hora, sem esperar nem checar
              // o resultado — a exclusão podia falhar de verdade (ex.: contrato vinculado) e o
              // usuário via "excluída com sucesso" mesmo com a proposta inteira ainda lá.
              const ok = await deleteProposal(id);
              if (ok) {
                toast.success("Proposta de venda excluída.");
                refetchPropostas();
              }
              return ok;
            }}
            updateProposal={async (id, updates) => {
              await updateProposal(id, updates);
              refetchPropostas();
            }}
          />

          <Pagination
            page={propostasPage}
            totalPages={propostasTotalPages}
            total={propostasTotal}
            pageSize={propostasPageSize}
            loading={propostasLoading}
            onPageChange={setPropostasPage}
            itemLabel="proposta"
          />
        </div>
      ) : activeTab === "contratos" ? (
        <div className="space-y-6">
          <ContractsKPIs
            valorAtivos={valorContratosAtivos}
            ativos={filteredContracts.filter((c: any) => c.status === "Ativo").length}
            inadimplentes={filteredContracts.filter((c: any) => c.status === "Inadimplente").length}
            mrrRows={filteredContracts.filter(isContractAtivo)}
            ativosRows={filteredContracts.filter((c: any) => c.status === "Ativo")}
            inadimplentesRows={filteredContracts.filter((c: any) => c.status === "Inadimplente")}
            contracts={filteredContracts as any[]}
          />

          <ContractsTable
            contracts={contractsEnriquecidos as any}
            statusFilter={contractStatusFilter}
            onStatusFilterChange={setContractStatusFilter}
            planFilter={contractPlanFilter}
            onPlanFilterChange={setContractPlanFilter}
            vendedorFilter={contractVendedorFilter}
            onVendedorFilterChange={setContractVendedorFilter}
            searchQuery={contractSearch}
            onSearchChange={setContractSearch}
            onDelete={(id) => { deleteContract(id); toast.success("Contrato removido."); }}
            onEdit={handleEditContract}
            onDownloadPdf={handleContractPdf}
          />
        </div>
      ) : (
        <FunilConversao rows={kpiAllRows} />
      )}

      <NovaPropostaWizard
        isOpen={isPropostaModalOpen}
        onClose={() => setIsPropostaModalOpen(false)}
        availableProducts={products || []}
        seller={user?.name || "Consultor S.P.Y."}
        onDone={() => refetchPropostas()}
      />

      <ContractFormModal
        isOpen={!!editingContract}
        onClose={() => setEditingContract(null)}
        contract={editingContract}
        clienteBase={clienteBase as any[]}
        colaboradores={colaboradores as any[]}
        onSave={handleSaveEditContract}
      />
    </PageContainer>
  );
}
