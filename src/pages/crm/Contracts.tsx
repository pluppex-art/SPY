import { useState, useMemo } from "react";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { Input } from "../../components/ui/input";
import { FormField } from "../../components/ui/form-field";
import { ConfirmModal } from "../../components/ui/modals/shared/ConfirmModal";
import { Plus } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { ContractsKPIs } from "./components/Contracts/ContractsKPIs";
import { ContractsTable } from "./components/Contracts/ContractsTable";
import { handleDownloadPdf } from "./utils/proposalPdf";
import { getFaturamentoContratado } from "../../lib/revenueMetrics";
import { isContractAtivo } from "../../components/ui/drillColumns";
import type { Contract } from "../../types";

const contractSchema = z.object({
  cliente: z.string().min(1, "O cliente é obrigatório"),
  plano:   z.string().min(1, "O plano é obrigatório"),
  valor:   z.string().refine((val) => {
    const clean = val.replace(/[^0-9,.]/g, "");
    return !isNaN(parseFloat(clean.replace(",", "."))) && clean.length > 0;
  }, "Formato de valor inválido. Use formato monetário, ex: 1500,00"),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Insira uma data válida"),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Insira uma data válida").optional().or(z.literal("")),
  descricao: z.string().optional(),
});
type ContractFormData = z.infer<typeof contractSchema>;

export default function Contracts() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [contractToDelete, setContractToDelete] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [planFilter, setPlanFilter] = useState("Todos");
  const [vendedorFilter, setVendedorFilter] = useState("Todos");
  const { contracts, addContract, updateContract, deleteContract, appSettings, clienteBase, proposals } = useData();
  const { activeTenantName } = useAuth();

  // "Responsável" não existe no contrato — vem do vendedor da proposta que
  // originou ele (contracts.proposalId -> proposals.id), mesmo critério
  // usado na aba "Contratos & Faturas" de Propostas.tsx.
  const contractsEnriquecidos = useMemo(() => {
    return (contracts as any[]).map((c: any) => ({
      ...c,
      responsavel: (proposals as any[]).find((p: any) => p.id === c.proposalId)?.vendedor || null,
    }));
  }, [contracts, proposals]);

  const { register, handleSubmit, formState: { errors }, reset } = useForm<ContractFormData>({
    resolver: zodResolver(contractSchema),
  });

  const isEditing = !!editingContract;

  const onSubmit = (data: ContractFormData) => {
    const formattedData = data.data.split("-").reverse().join("/");
    const formattedDataFim = data.dataFim ? data.dataFim.split("-").reverse().join("/") : null;
    const cleanValue = parseFloat(data.valor.replace(/[^0-9,.]/g, "").replace(",", "."));
    const formattedValue = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(cleanValue);
    if (isEditing && editingContract) {
      updateContract(editingContract.id, { client: data.cliente, plan: data.plano, description: data.descricao || null, mrr: formattedValue, date: formattedData, endDate: formattedDataFim });
      toast.success("Contrato atualizado com sucesso!");
    } else {
      addContract({ client: data.cliente, plan: data.plano, description: data.descricao || null, mrr: formattedValue, status: "Ativo", date: formattedData, endDate: formattedDataFim, progress: 100 });
      toast.success("Contrato criado com sucesso!");
    }
    reset();
    setIsModalOpen(false);
    setEditingContract(null);
  };

  const handleModalClose = () => { setIsModalOpen(false); setEditingContract(null); reset(); };

  const handleEditContract = (contract: Contract) => {
    setEditingContract(contract);
    const [dd, mm, yyyy] = (contract.date || "").split("/");
    const [ddFim, mmFim, yyyyFim] = (contract.endDate || "").split("/");
    reset({
      cliente: contract.client,
      plano: contract.plan,
      valor: String(typeof contract.mrr === "number" ? contract.mrr : contract.mrr).replace(/[^\d,.-]/g, ""),
      data: dd && mm && yyyy ? `${yyyy}-${mm}-${dd}` : "",
      dataFim: ddFim && mmFim && yyyyFim ? `${yyyyFim}-${mmFim}-${ddFim}` : "",
      descricao: contract.description || "",
    });
    setIsModalOpen(true);
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

  const valorContratosAtivos = getFaturamentoContratado(contracts);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gestão de Contratos</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Contratos ativos, MRR e saúde financeira.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2">Exportar CSV</Button>
          <Button onClick={() => setIsModalOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Novo Contrato
          </Button>
        </div>
      </div>

      <ContractsKPIs
        valorAtivos={valorContratosAtivos}
        ativos={contracts.filter(c => c.status === "Ativo").length}
        inadimplentes={contracts.filter(c => c.status === "Inadimplente").length}
        mrrRows={contracts.filter(isContractAtivo)}
        ativosRows={contracts.filter(c => c.status === "Ativo")}
        inadimplentesRows={contracts.filter(c => c.status === "Inadimplente")}
        contracts={contracts}
      />

      <ContractsTable
        contracts={contractsEnriquecidos}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        planFilter={planFilter}
        onPlanFilterChange={setPlanFilter}
        vendedorFilter={vendedorFilter}
        onVendedorFilterChange={setVendedorFilter}
        onDelete={(id) => setContractToDelete(id)}
        onEdit={handleEditContract}
        onDownloadPdf={handleContractPdf}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        title={isEditing ? "Editar Contrato" : "Novo Contrato"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={handleModalClose}>Cancelar</Button>
            <Button onClick={handleSubmit(onSubmit)}>{isEditing ? "Salvar Alterações" : "Salvar Contrato"}</Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Cliente" error={errors.cliente?.message}>
            <select {...register("cliente")} className="w-full h-10 rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-blue)]">
              <option value="">Selecione o Cliente</option>
              {/* Contratos gerados a partir de proposta aceita podem trazer um nome de
                  cliente que não existe (mais) em `clienteBase` — sem essa opção extra,
                  o <select> não tinha nenhum <option> com esse value e caía pro placeholder
                  em branco ao editar, escondendo o cliente real do contrato. */}
              {editingContract?.client && !(clienteBase as any[]).some((c: any) => c.name === editingContract.client) && (
                <option value={editingContract.client}>{editingContract.client} (fora da lista de clientes)</option>
              )}
              {(clienteBase as any[]).map((c: any) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Plano Acordado" error={errors.plano?.message}>
            {/* Texto livre, não mais um <select> fixo de 4 opções — a maioria dos
                contratos hoje nasce da aceitação de uma proposta e carrega o título
                real dela (ex: "Proposta Comercial — Cliente X"), que nunca batia com
                Starter/Pro/Enterprise/Consultoria Avulsa e ficava invisível ao editar. */}
            <Input type="text" list="planos-sugeridos" {...register("plano")} placeholder="Ex: Starter, Pro, ou o título da proposta" />
            <datalist id="planos-sugeridos">
              <option value="Starter" />
              <option value="Pro" />
              <option value="Enterprise" />
              <option value="Consultoria Avulsa" />
            </datalist>
          </FormField>
          <FormField label="Descrição (opcional)" error={errors.descricao?.message}>
            <Input type="text" {...register("descricao")} placeholder="Ex: Proposta Comercial — Nome do Cliente" />
          </FormField>
          <FormField label="Valor (MRR)" error={errors.valor?.message}>
            <Input type="text" {...register("valor")} placeholder="Ex: 1500,00" />
          </FormField>
          <FormField label="Data de Assinatura" error={errors.data?.message}>
            <Input type="date" {...register("data")} />
          </FormField>
          <FormField label="Data de Término (opcional)" error={errors.dataFim?.message}>
            <Input type="date" {...register("dataFim")} />
          </FormField>
        </form>
      </Modal>

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
