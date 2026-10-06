import { useState, useEffect, useMemo } from "react";
import { Button } from "../../components/ui/button";
import { Plus, Building2, CheckCircle2, FileText } from "lucide-react";
import { NovoClienteModal } from "../../components/ui/modals/crm/NovoClienteModal";
import { ClienteContatosModal } from "../../components/ui/modals/crm/ClienteContatosModal";
import { ClienteDetalhesModal } from "../../components/ui/modals/crm/ClienteDetalhesModal";
import { LeadDetailsModal } from "../../components/ui/LeadDetailsModal";
import { toast } from "sonner";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { PageContainer } from "../../components/PageContainer";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import { ClientesKPIs } from "./components/Clientes/ClientesKPIs";
import { ClientesList } from "./components/Clientes/ClientesList";
import { ClientesResumo } from "./components/Clientes/ClientesResumo";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect } from "../../components/ui/kpi-filter-card";
import { normalizeText } from "../../lib/utils";

export default function Clientes() {
  const { activeTenantId } = useAuth();
  // `clienteBase` (renomeado aqui pra `clientes`, resto do arquivo não muda)
  // é o mesmo estado compartilhado que Contracts.tsx e o resto do sistema já
  // usam — assinado no canal de realtime único do DataContext (achado real:
  // esta tela tinha sua PRÓPRIA busca isolada, nunca usava esse estado
  // compartilhado, então nem tinha realtime nem via ao vivo a sincronia de
  // Cidade/Setor/Documento feita a partir do Detalhe do Lead — só depois de
  // recarregar a página).
  const { leads, clienteBase: clientes, contracts, addClienteBase, updateClienteBase, deleteClienteBase } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<any | null>(null);
  const [contatosClienteId, setContatosClienteId] = useState<string | null>(null);
  // Cliente cujo detalhe foi pedido (clique na linha ou no lápis) mas que não
  // tem NENHUM lead vinculado (ex.: cadastrado manualmente via "+ Novo
  // Cliente", nunca foi um lead ganho) — cai no modal simples de sempre
  // (ClienteDetalhesModal), já que LeadDetailsModal exige um lead de verdade
  // (funil/score/estágio) e não tem um modo "só cliente".
  const [orphanDetalhesClienteId, setOrphanDetalhesClienteId] = useState<string | null>(null);
  const [selectedLeadForDetails, setSelectedLeadForDetails] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState("Todas as situações");
  const [sectorFilter, setSectorFilter] = useState("Todos os setores");
  const [contratoStatusFilter, setContratoStatusFilter] = useState("Todos os status");
  const [searchQuery, setSearchQuery] = useState("");

  // Decisor por cliente, pra mostrar na tabela junto com o Documento — vem do
  // contato marcado como "principal" em cliente_contatos (a mesma tabela do
  // ícone de "Contatos e Decisores"), não de `leads`/`proposals`: é a única
  // fonte que funciona pra QUALQUER cliente, inclusive os cadastrados
  // manualmente sem lead nenhum por trás.
  const [decisorPorCliente, setDecisorPorCliente] = useState<Record<string, { nome: string; cargo?: string | null }>>({});

  useEffect(() => {
    if (!activeTenantId || !supabase) return;
    let cancelled = false;

    supabase.from("cliente_contatos").select("cliente_id, nome, cargo, papel_decisao, principal")
      .eq("tenant_id", activeTenantId).eq("principal", true).then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const map: Record<string, { nome: string; cargo?: string | null }> = {};
        for (const row of data as any[]) {
          map[row.cliente_id] = { nome: row.nome, cargo: row.papel_decisao || row.cargo || null };
        }
        setDecisorPorCliente(map);
      });

    return () => { cancelled = true; };
  }, [activeTenantId]);

  // Enriquece cada cliente com 3 campos reais que não existem na tabela
  // `clientes` (sem coluna própria de MRR/responsável): "Responsável" vem do
  // vendedor do lead mais recente vinculado (leads.clientId -> clientes.id,
  // o mesmo FK já usado em openClienteOrLead); "MRR"/"Status do contrato"
  // vêm do contrato cujo `client` (texto livre, ver rowToContract em
  // DataContext.tsx) bate com o nome do cliente — mesma convenção de
  // "mesmo nome = mesma entidade" já usada no resto do app (ex.: busca de
  // contrato vinculado em PropostasTable.tsx).
  const clientesEnriquecidos = useMemo(() => {
    return clientes.map((c: any) => {
      const dealLeads = (leads || []).filter((l: any) => l.clientId === c.id);
      const leadMaisRecente = [...dealLeads].sort((a: any, b: any) =>
        new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime()
      )[0];
      const contratosDoCliente = (contracts as any[]).filter((ct: any) => ct.client === c.name);
      const contratoAtivo = contratosDoCliente.find((ct: any) => ct.status === "Ativo") || contratosDoCliente[0] || null;
      const mrr = contratosDoCliente
        .filter((ct: any) => ct.status !== "Cancelado")
        .reduce((s: number, ct: any) => s + (Number(String(ct.mrr).replace(/[^\d,.-]/g, "").replace(",", ".")) || 0), 0);
      return {
        ...c,
        responsavel: leadMaisRecente?.seller || null,
        contratoStatus: contratoAtivo?.status || null,
        mrr,
      };
    });
  }, [clientes, leads, contracts]);

  const NEUTRO_SETOR = "Todos os setores";
  const NEUTRO_SITUACAO = "Todas as situações";
  const NEUTRO_CONTRATO = "Todos os status";

  const contratoStatusLabel = (st?: string | null) =>
    st === "Ativo" ? "Em dia" : st === "Inadimplente" ? "Inadimplente" : st === "Cancelado" ? "Cancelado" : "Sem contrato";

  // Opções reais do filtro de setor — só os valores que existem na base.
  const setoresDisponiveis = useMemo(
    () => Array.from(new Set(clientesEnriquecidos.map((c: any) => c.industry).filter(Boolean))).sort() as string[],
    [clientesEnriquecidos]
  );

  const clientesFiltrados = useMemo(() => clientesEnriquecidos.filter((c: any) => {
    if (statusFilter !== NEUTRO_SITUACAO && c.status !== statusFilter) return false;
    if (sectorFilter !== NEUTRO_SETOR && c.industry !== sectorFilter) return false;
    if (contratoStatusFilter !== NEUTRO_CONTRATO && contratoStatusLabel(c.contratoStatus) !== contratoStatusFilter) return false;
    if (searchQuery) {
      const term = normalizeText(searchQuery);
      return normalizeText(c.name).includes(term) ||
             normalizeText(c.documento).includes(term) ||
             normalizeText(c.responsavel).includes(term) ||
             normalizeText(c.email).includes(term) ||
             normalizeText(c.phone).includes(term);
    }
    return true;
  }), [clientesEnriquecidos, statusFilter, sectorFilter, contratoStatusFilter, searchQuery]);

  const activeCount = (searchQuery ? 1 : 0) + (statusFilter !== NEUTRO_SITUACAO ? 1 : 0) + (sectorFilter !== NEUTRO_SETOR ? 1 : 0) + (contratoStatusFilter !== NEUTRO_CONTRATO ? 1 : 0);
  const clearFilters = () => { setSearchQuery(""); setStatusFilter(NEUTRO_SITUACAO); setSectorFilter(NEUTRO_SETOR); setContratoStatusFilter(NEUTRO_CONTRATO); };

  // KPIs refletem a lista já filtrada (mesmo comportamento do Pipeline).
  const kpis = useMemo(() => {
    const ativosRows = clientesFiltrados.filter((c: any) => c.status === "Ativo");
    const implantacaoRows = clientesFiltrados.filter((c: any) => c.status === "Em Implantação");
    const inativosRows = clientesFiltrados.filter((c: any) => c.status === "Inativo");
    return {
      total: clientesFiltrados.length,
      ativos: ativosRows.length,
      implantacao: implantacaoRows.length,
      inativos: inativosRows.length,
      todosRows: clientesFiltrados,
      ativosRows,
      implantacaoRows,
      inativosRows,
    };
  }, [clientesFiltrados]);

  const handleSaveCliente = async (data: any) => {
    if (!data.nome) { toast.error("Nome da empresa é obrigatório."); return; }
    if (!supabase) { toast.error("Não foi possível conectar ao servidor."); return; }
    if (!activeTenantId) { toast.error("Tenant não identificado."); return; }

    const documento = data.documento || null;
    const email = data.email || null;

    // Evita duplicar cliente: mesmo documento (CPF/CNPJ) ou e-mail já cadastrado
    // pra este tenant vira o mesmo registro, não uma linha nova — mesmo critério
    // já usado em createClientFromWonLead (DataContext.tsx) pro fluxo automático,
    // só que faltava aqui no cadastro manual (achado real: "Guruseg" duplicado
    // na Base de Clientes).
    const duplicate = clientes.find(c =>
      c.id !== editingCliente?.id &&
      ((documento && c.documento && c.documento === documento) ||
       (email && c.email && c.email.toLowerCase() === email.toLowerCase()))
    );
    if (duplicate) {
      toast.error(`Já existe um cliente cadastrado com esse ${duplicate.documento === documento && documento ? "documento" : "e-mail"}: ${duplicate.name}.`);
      return;
    }

    const clientPayload = {
      name: data.nome,
      industry: data.industry || "Tecnologia",
      // Sem fallback fixo pra "São Paulo"/(11) — nem todo tenant fica lá,
      // e dado inventado num cadastro real de cliente é pior que campo vazio.
      city: data.cidade || null,
      state: data.estado ? String(data.estado).toUpperCase() : null,
      phone: data.telefone || null,
      email,
      documento,
    };

    if (editingCliente) {
      await updateClienteBase(editingCliente.id, clientPayload);
      toast.success("Cliente atualizado com sucesso!");
      setEditingCliente(null);
      return;
    }

    await addClienteBase({ ...clientPayload, status: "Ativo" });
    toast.success("Cliente cadastrado com sucesso!");
    setIsModalOpen(false);
  };

  const handleDeleteCliente = async (id: string) => {
    const alvo = clientes.find(c => c.id === id);
    if (!(await confirmDialog({
      title: "Excluir cliente",
      description: `Excluir ${alvo?.name || "este cliente"} da base de clientes? Essa ação não pode ser desfeita.`,
    }))) return;
    const ok = await deleteClienteBase(id);
    if (!ok) return; // deleteClienteBase já mostra o toast de erro
    // Sem isso, o(s) lead(s) que apontavam pra esse cliente ficam com um
    // `clientId` órfão pra sempre — a reconciliação em DataContext trata
    // "clientId setado" como "já vinculado" mesmo quando o cliente por trás
    // foi excluído, então o negócio ganho nunca reaparece na Base de
    // Clientes sozinho (achado real: exclusão de "To Na Pista Boliche"
    // deixou o lead "Fabiano Fagundes" preso a um cliente inexistente).
    if (supabase) await supabase.from("leads").update({ clientId: null }).eq("clientId", id).eq("tenant_id", activeTenantId);
    toast.success("Cliente removido com sucesso!");
  };

  // Clicar numa linha OU no lápis de editar agora abre o Lead Details de
  // verdade (funil, score, produtos, propostas — tudo num lugar só) em vez
  // do modal básico de cliente, sempre que existir um lead real por trás
  // (leads.clientId -> clientes.id, não tem FK inversa, então a busca é por
  // aqui — mesmo padrão já usado em ClienteDetalhesModal.tsx). Sem lead
  // vinculado (cliente cadastrado manualmente), cai no modal simples de
  // sempre, porque LeadDetailsModal não tem como renderizar sem um lead real.
  const openClienteOrLead = (clienteId: string) => {
    const dealLeads = (leads || []).filter((l: any) => l.clientId === clienteId);
    if (dealLeads.length > 0) {
      const mostRecent = [...dealLeads].sort((a: any, b: any) =>
        new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime()
      )[0];
      setSelectedLeadForDetails(mostRecent);
    } else {
      setOrphanDetalhesClienteId(clienteId);
    }
  };

  return (
    <PageContainer
      title="Base de Clientes S.P.Y."
      description="Gerencie a carteira de clientes ativos e em implantação de forma inteligente."
      actions={
        <Button 
          onClick={() => setIsModalOpen(true)} 
          className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" /> Novo Cliente
        </Button>
      }
    >
      {/* Card "KPIs & Filtros" compartilhado. Os KPIs de Clientes mantêm drill-down e sparkline
          (ClientesKPIs), agora dentro do card e calculados sobre a lista filtrada. */}
      <KpiFilterCard className="mb-4" id="crmClientes" activeCount={activeCount} onClear={clearFilters}>
        <ClientesKPIs {...kpis} clientes={clientesFiltrados} />
        <FilterBar>
          <FilterSearch value={searchQuery} onChange={setSearchQuery} placeholder="Buscar por cliente, documento, responsável, e-mail ou telefone..." />
          <FilterSelect icon={Building2} value={sectorFilter} onChange={setSectorFilter} options={setoresDisponiveis} allLabel={NEUTRO_SETOR} allValue={NEUTRO_SETOR} />
          <FilterSelect icon={CheckCircle2} value={statusFilter} onChange={setStatusFilter} options={["Ativo", "Em Implantação", "Inativo"]} allLabel={NEUTRO_SITUACAO} allValue={NEUTRO_SITUACAO} />
          <FilterSelect icon={FileText} value={contratoStatusFilter} onChange={setContratoStatusFilter} options={["Em dia", "Inadimplente", "Cancelado", "Sem contrato"]} allLabel={NEUTRO_CONTRATO} allValue={NEUTRO_CONTRATO} />
        </FilterBar>
      </KpiFilterCard>

      <ClientesList
        clientes={clientesFiltrados}
        decisorPorCliente={decisorPorCliente}
        onDelete={handleDeleteCliente}
        onEdit={(c) => {
          const hasDeal = (leads || []).some((l: any) => l.clientId === c.id);
          if (hasDeal) openClienteOrLead(c.id);
          else setEditingCliente(c); // sem lead vinculado — só dá pra editar os dados básicos mesmo
        }}
        onManageContatos={setContatosClienteId}
        onOpenDetalhes={openClienteOrLead}
      />

      <ClientesResumo
        clientes={clientes}
        contracts={contracts}
        onFilterSetor={setSectorFilter}
        onFilterStatus={setStatusFilter}
      />

      <NovoClienteModal
        isOpen={isModalOpen || !!editingCliente}
        onClose={() => { setIsModalOpen(false); setEditingCliente(null); }}
        onAction={handleSaveCliente}
        cliente={editingCliente}
      />

      <ClienteContatosModal
        isOpen={!!contatosClienteId}
        onClose={() => setContatosClienteId(null)}
        clienteId={contatosClienteId}
        clienteNome={clientes.find(c => c.id === contatosClienteId)?.name}
      />

      <ClienteDetalhesModal
        isOpen={!!orphanDetalhesClienteId}
        onClose={() => setOrphanDetalhesClienteId(null)}
        cliente={clientes.find(c => c.id === orphanDetalhesClienteId) || null}
        onManageContatos={(id) => { setOrphanDetalhesClienteId(null); setContatosClienteId(id); }}
      />

      <LeadDetailsModal
        isOpen={!!selectedLeadForDetails}
        onClose={() => setSelectedLeadForDetails(null)}
        lead={selectedLeadForDetails}
      />
    </PageContainer>
  );
}
