import { useState, useMemo } from "react";
import { Button } from "../../components/ui/button";
import { ConfirmModal } from "../../components/ui/modals/shared/ConfirmModal";
import { Plus, FileText, Layers, User } from "lucide-react";
import { toast } from "sonner";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { ContractsKPIs } from "./components/Contracts/ContractsKPIs";
import { ContractsTable } from "./components/Contracts/ContractsTable";
import { ContractFormModal, type ContractFormPayload } from "./components/Contracts/ContractFormModal";
import { handleDownloadPdf } from "./utils/proposalPdf";
import { getFaturamentoContratado } from "../../lib/revenueMetrics";
import { isContractAtivo } from "../../components/ui/drillColumns";
import type { Contract } from "../../types";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect } from "../../components/ui/kpi-filter-card";
import { normalizeText } from "../../lib/utils";

export default function Contracts() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [contractToDelete, setContractToDelete] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [planFilter, setPlanFilter] = useState("Todos");
  const [vendedorFilter, setVendedorFilter] = useState("Todos");
  const { contracts, addContract, updateContract, deleteContract, updateClienteBase, appSettings, clienteBase, colaboradores, proposals } = useData();
  const { activeTenantName } = useAuth();

  // "Responsável" na tabela já vem do próprio contrato quando preenchido
  // (campo real, editável na modal agora) — só cai pro vendedor da proposta
  // de origem como fallback pra contratos antigos sem responsável definido.
  const contractsEnriquecidos = useMemo(() => {
    return (contracts as any[]).map((c: any) => {
      const colaborador = (colaboradores as any[]).find((col: any) => col.id === c.responsavelId);
      return {
        ...c,
        responsavel: colaborador?.nome || (proposals as any[]).find((p: any) => p.id === c.proposalId)?.vendedor || null,
      };
    });
  }, [contracts, colaboradores, proposals]);

  // Opções reais dos filtros — só valores que existem nos contratos deste tenant.
  const planosDisponiveis = useMemo(() => Array.from(new Set(contractsEnriquecidos.map((c: any) => c.plan).filter(Boolean))).sort() as string[], [contractsEnriquecidos]);
  const vendedoresDisponiveis = useMemo(() => Array.from(new Set(contractsEnriquecidos.map((c: any) => c.responsavel).filter(Boolean))).sort() as string[], [contractsEnriquecidos]);

  const contractsFiltrados = useMemo(() => {
    const q = normalizeText(searchQuery);
    return contractsEnriquecidos.filter((c: any) => {
      if (statusFilter !== "Todos" && c.status !== statusFilter) return false;
      if (planFilter !== "Todos" && c.plan !== planFilter) return false;
      if (vendedorFilter !== "Todos" && c.responsavel !== vendedorFilter) return false;
      if (!q) return true;
      return normalizeText(c.client).includes(q) || normalizeText(c.plan).includes(q) || normalizeText(c.responsavel).includes(q);
    });
  }, [contractsEnriquecidos, searchQuery, statusFilter, planFilter, vendedorFilter]);

  const activeCount = (searchQuery ? 1 : 0) + (statusFilter !== "Todos" ? 1 : 0) + (planFilter !== "Todos" ? 1 : 0) + (vendedorFilter !== "Todos" ? 1 : 0);
  const clearFilters = () => { setSearchQuery(""); setStatusFilter("Todos"); setPlanFilter("Todos"); setVendedorFilter("Todos"); };

  const handleEditContract = (contract: Contract) => {
    setEditingContract(contract);
    setIsModalOpen(true);
  };

  const handleSave = async (payload: ContractFormPayload) => {
    const { clienteIndustry, ...contractFields } = payload;
    if (editingContract) {
      await updateContract(editingContract.id, contractFields);
      toast.success("Contrato atualizado com sucesso!");
    } else {
      await addContract({ ...contractFields, progress: 100 });
      toast.success("Contrato criado com sucesso!");
    }
    // Setor do Cliente é editado aqui mas vive em `clientes.industry`, não no
    // contrato — só grava quando o valor mudou de verdade em relação ao que
    // o cliente já tinha (nunca sobrescreve com o mesmo valor à toa).
    const clienteAlvo = (clienteBase as any[]).find((c: any) => c.name === payload.client);
    if (clienteAlvo && clienteIndustry && clienteAlvo.industry !== clienteIndustry) {
      await updateClienteBase(clienteAlvo.id, { industry: clienteIndustry });
    }
    setEditingContract(null);
  };

  // Mesmo gerador/branding (logo do tenant) já usado no PDF de Propostas — o
  // contrato é montado como uma "Proposta" equivalente pra reaproveitar o
  // layout, em vez de duplicar a lógica de PDF com um visual diferente.
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

  const valorContratosAtivos = getFaturamentoContratado(contractsFiltrados);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gestão de Contratos</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Contratos ativos, MRR e saúde financeira.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2">Exportar CSV</Button>
          <Button onClick={() => { setEditingContract(null); setIsModalOpen(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Novo Contrato
          </Button>
        </div>
      </div>

      {/* Card "KPIs & Filtros" compartilhado. ContractsKPIs (drill-down + sparkline) fica dentro do card,
          calculado sobre a lista filtrada. */}
      <KpiFilterCard id="crmContratos" activeCount={activeCount} onClear={clearFilters}>
        <ContractsKPIs
          valorAtivos={valorContratosAtivos}
          ativos={contractsFiltrados.filter(c => c.status === "Ativo").length}
          inadimplentes={contractsFiltrados.filter(c => c.status === "Inadimplente").length}
          mrrRows={contractsFiltrados.filter(isContractAtivo)}
          ativosRows={contractsFiltrados.filter(c => c.status === "Ativo")}
          inadimplentesRows={contractsFiltrados.filter(c => c.status === "Inadimplente")}
          contracts={contractsFiltrados}
        />
        <FilterBar>
          <FilterSearch value={searchQuery} onChange={setSearchQuery} placeholder="Buscar cliente, plano ou responsável..." />
          <FilterSelect icon={FileText} value={statusFilter} onChange={setStatusFilter} options={["Ativo", "Inadimplente", "Cancelado"]} allLabel="Todos os status" allValue="Todos" />
          {planosDisponiveis.length > 1 && (
            <FilterSelect icon={Layers} value={planFilter} onChange={setPlanFilter} options={planosDisponiveis} allLabel="Todos os planos" allValue="Todos" />
          )}
          {vendedoresDisponiveis.length > 1 && (
            <FilterSelect icon={User} value={vendedorFilter} onChange={setVendedorFilter} options={vendedoresDisponiveis} allLabel="Todos os responsáveis" allValue="Todos" />
          )}
        </FilterBar>
      </KpiFilterCard>

      <ContractsTable
        contracts={contractsFiltrados}
        onDelete={(id) => setContractToDelete(id)}
        onEdit={handleEditContract}
        onDownloadPdf={handleContractPdf}
      />

      <ContractFormModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingContract(null); }}
        contract={editingContract}
        clienteBase={clienteBase as any[]}
        colaboradores={colaboradores as any[]}
        onSave={handleSave}
      />

      <ConfirmModal
        isOpen={contractToDelete !== null}
        onClose={() => setContractToDelete(null)}
        onConfirm={() => {
          if (contractToDelete) {
            deleteContract(contractToDelete);
            toast.success("Contrato excluído com sucesso!");
          }
        }}
        title="Confirmar Exclusão de Contrato"
        message="Tem certeza de que deseja remover permanentemente este contrato? Os dados associados não poderão ser recuperados."
      />
    </div>
  );
}
