import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Package, FileSpreadsheet, Activity, TrendingUp, Sparkles } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/PageContainer";
import { Pagination } from "../../components/ui/Pagination";
import { useProdutoForm } from "./produtos/useProdutoForm";
import { ProdutoModal } from "./produtos/ProdutoModal";
import { ProdutosGrid } from "./produtos/ProdutosGrid";
import { ProdutosTable } from "./produtos/ProdutosTable";
import { KpiFilterCard } from "../../components/ui/kpi-filter-card";
import { ProdutosFilters } from "./components/Produtos/ProdutosFilters";
import { ProdutosAICombo } from "./components/Produtos/ProdutosAICombo";
import { CriarPropostaModal } from "../../components/ui/modals/crm/CriarPropostaModal";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "sonner";
import type { Product } from "../../types";
import { downloadCsv } from "../../lib/csvExport";
import { useMaxdataPage, MAXDATA_ORIGENS } from "../../lib/useMaxdataPage";

const PAGE_SIZE = 60;

export default function Catalog() {
  const f = useProdutoForm();
  const { createProposalWithItems } = useData();
  const { user, activeTenantId } = useAuth();

  // Deep-link: /app/produtos?type=Imóvel (ou ?tipo=) pré-seleciona o filtro de
  // tipo; &novo=1 abre o modal de novo produto já com esse tipo.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const t = searchParams.get("type") || searchParams.get("tipo");
    const novo = searchParams.get("novo") === "1";
    if (!t && !novo) return;
    if (t) f.setSelectedTypes([t]);
    if (novo) {
      f.handleOpenAddModal();
      if (t) f.setFormType(t as any);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("novo");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [sellingProduct, setSellingProduct] = useState<Product | null>(null);

  const handleVender = (p: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    setSellingProduct(p);
  };

  const handleSaveVenda = async (data: any) => {
    await createProposalWithItems({
      titulo: data.titulo,
      cliente: data.cliente,
      valor: parseFloat(data.valor) || 0,
      validade: data.dataValidade || null,
      status: "Enviada",
      vendedor: user?.name || "Sistema S.P.Y.",
      itens: data.itens?.filter((i: any) => i.descricao?.trim()) || [],
    });
    toast.success("✨ Proposta criada com sucesso a partir do produto!");
    setSellingProduct(null);
  };

  const filteredProducts = useMemo(() => {
    return f.products
      .filter((p) => {
        const q = f.searchTerm.toLowerCase();
        const a = (p.typeAttributes || {}) as Record<string, unknown>;
        const matchesSearch =
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.provider && p.provider.toLowerCase().includes(q)) ||
          // Varejo: também busca por marca, códigos de barras/EAN, NCM, coleção e código interno
          (f.varejoOn && ["marca", "barcode", "ean", "ncm", "colecao", "codigoInterno"].some(k => a[k] != null && String(a[k]).toLowerCase().includes(q))) ||
          (f.varejoOn && !!p.category && p.category.toLowerCase().includes(q));
        const matchesCategory = f.selectedCategories.length === 0 || f.selectedCategories.includes(p.category);
        const matchesType = f.selectedTypes.length === 0 || f.selectedTypes.includes(p.type);
        const matchesStatus =
          f.selectedStatus === "Todos" ||
          (f.selectedStatus === "Ativos" && p.active) ||
          (f.selectedStatus === "Inativos" && !p.active);
        return matchesSearch && matchesCategory && matchesType && matchesStatus;
      })
      .sort((a, b) => {
        if (f.sortBy === "name-asc") return a.name.localeCompare(b.name);
        if (f.sortBy === "name-desc") return b.name.localeCompare(a.name);
        if (f.sortBy === "price-desc") return b.price - a.price;
        if (f.sortBy === "price-asc") return a.price - b.price;
        if (f.sortBy === "margin-desc") return b.margin - a.margin;
        return 0;
      });
  }, [f.products, f.varejoOn, f.searchTerm, f.selectedCategories, f.selectedTypes, f.selectedStatus, f.sortBy]);

  // Grid/Tabela renderizavam TODOS os produtos filtrados de uma vez —
  // pagina só a exibição (os dados já estão em memória); export CSV e o
  // contador do filtro continuam usando `filteredProducts` completo.
  const [page, setPage] = useState(0);
  // Origem: catálogo normal (em memória) ou os produtos da Max Data, lidos do servidor página a página
  // (dezenas de milhares de SKUs não cabem no carregamento integral do navegador).
  const [origem, setOrigem] = useState("");
  const mx = useMaxdataPage({ table: "maxdata_produtos", origem, tenantId: activeTenantId, term: f.searchTerm, page, pageSize: PAGE_SIZE, searchCols: ["name", "sku"], orderBy: "name" });
  useEffect(() => { setPage(0); }, [f.searchTerm, f.selectedCategories, f.selectedTypes, f.selectedStatus, f.sortBy, origem]);
  const viewTotal = mx.ativo ? mx.total : filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(viewTotal / PAGE_SIZE));
  const pageProducts = mx.ativo ? mx.rows : filteredProducts.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const somenteConsulta = () => { toast.info("Produto vindo da Max Data: somente consulta."); };

  const totalSkuCount = viewTotal;
  const activeSkuCount = mx.ativo ? pageProducts.filter((p: any) => p.active).length : filteredProducts.filter(p => p.active).length;
  const averageMarginVal = useMemo(() => {
    const list = filteredProducts.filter(p => p.active);
    if (list.length === 0) return 0;
    return Math.round((list.reduce((acc, curr) => acc + curr.margin, 0) / list.length) * 10) / 10;
  }, [filteredProducts]);
  const bestSellerCount = filteredProducts.filter(p => p.isBestSeller).length;
  const activeFilterCount =
    (f.searchTerm.trim() ? 1 : 0) + (f.selectedCategories.length > 0 ? 1 : 0) + (f.selectedTypes.length > 0 ? 1 : 0) + (f.selectedStatus !== "Todos" ? 1 : 0);
  const clearFilters = () => { f.setSearchTerm(""); f.setSelectedCategories([]); f.setSelectedTypes([]); f.setSelectedStatus("Todos"); };

  const exportProductsToCSV = () => {
    downloadCsv(
      `catalogo_produtos_${Date.now()}.csv`,
      ["SKU", "Nome", "Categoria", "Tipo", "Preço", "Custo", "Margem", "Estoque Atual"],
      filteredProducts.map(p => [p.sku, p.name, p.category, p.type, p.price, p.cost, p.margin, p.currentStock])
    );
  };

  return (
    <PageContainer
      title="Produtos & SKUs S.P.Y."
      description="Painel Central de Gestão de Preços, Margem de Lucro, SKU e Comissionamento Comercial."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={exportProductsToCSV}
            className="h-9 px-4 text-xs font-bold gap-1.5 border-[var(--color-border-default)]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Exportar Planilha
          </Button>
          <Button
            onClick={f.handleOpenAddModal}
            className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Cadastrar Produto
          </Button>
        </div>
      }
    >
      <div className="space-y-6 pb-20">
        {f.varejoOn && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[var(--color-text-muted)] font-bold">Origem:</span>
            <select value={origem} onChange={(e) => setOrigem(e.target.value)} className="h-9 rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-transparent px-2 text-xs">
              {MAXDATA_ORIGENS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {mx.ativo && mx.loading && <span className="text-[var(--color-text-muted)]">Carregando…</span>}
            {mx.ativo && mx.error && <span className="text-danger">Erro: {mx.error}</span>}
          </div>
        )}
        <KpiFilterCard
          id="opsProdutos"
          kpis={[
            { label: "Total de SKUs", value: totalSkuCount, icon: Package, tone: "primary" },
            { label: "SKUs em Operação", value: activeSkuCount, icon: Activity, tone: "success" },
            { label: "Margem Ativa Média", value: `${averageMarginVal}%`, icon: TrendingUp, tone: "info" },
            { label: "Favoritos / BestSellers", value: bestSellerCount, icon: Sparkles, tone: "warning" },
          ]}
          activeCount={activeFilterCount}
          onClear={clearFilters}
        >
        <ProdutosFilters
          searchPlaceholder={f.varejoOn ? "Pesquisar por nome, SKU, marca, EAN/código de barras, NCM, categoria..." : undefined}
          searchTerm={f.searchTerm} onSearchChange={f.setSearchTerm}
          categories={f.categories} selectedCategories={f.selectedCategories}
          onCategoryToggle={(cat) => f.setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])}
          types={f.types} selectedTypes={f.selectedTypes}
          onTypeToggle={(tp) => f.setSelectedTypes(prev => prev.includes(tp) ? prev.filter(t => t !== tp) : [...prev, tp])}
          selectedStatus={f.selectedStatus} onStatusChange={f.setSelectedStatus}
          sortBy={f.sortBy} onSortByChange={f.setSortBy}
          viewMode={f.viewMode} onViewModeChange={f.setViewMode}
          selectedIds={f.selectedIds} filteredCount={filteredProducts.length}
          onBulkActivate={() => f.executeBulkStatus(true)}
          onBulkDeactivate={() => f.executeBulkStatus(false)}
          onBulkDelete={f.executeBulkDelete}
        />
        </KpiFilterCard>

        {viewTotal === 0 ? (
          <Card className="p-16 flex flex-col items-center justify-center text-center bg-[var(--color-surface-elevated)]/40 border-[var(--color-border-subtle)]">
            <Package className="w-16 h-16 text-slate-700 mb-4 animate-pulse" />
            <h3 className="text-[var(--color-text-primary)] font-bold text-lg mb-1">Nenhum SKU encontrado</h3>
            <p className="text-xs text-[var(--color-text-muted)] max-w-sm leading-relaxed">
              Nenhum produto atende a estes parâmetros de filtro atuais. Modifique os termos de pesquisa ou adicione um novo produto ao catálogo.
            </p>
            <Button onClick={f.handleOpenAddModal} className="mt-6 font-bold text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-2">
              Adicionar Primeiro Produto
            </Button>
          </Card>
        ) : (
          <>
            {f.viewMode === "grid" ? (
              <ProdutosGrid
                filteredProducts={pageProducts}
                selectedIds={f.selectedIds}
                handleToggleSelection={mx.ativo ? somenteConsulta : f.handleToggleSelection}
                toggleActiveStatus={mx.ativo ? somenteConsulta : f.toggleActiveStatus}
                handleOpenEditModal={mx.ativo ? somenteConsulta : f.handleOpenEditModal}
                duplicateProduct={mx.ativo ? somenteConsulta : f.duplicateProduct}
                deleteProduct={mx.ativo ? somenteConsulta : f.deleteProduct}
                setSelectedCategories={f.setSelectedCategories}
                setSearchTerm={f.setSearchTerm}
                handleVender={mx.ativo ? (_p: Product, e: React.MouseEvent) => { e.stopPropagation(); somenteConsulta(); } : handleVender}
              />
            ) : (
              <ProdutosTable
                filteredProducts={pageProducts}
                selectedIds={f.selectedIds}
                handleToggleSelection={mx.ativo ? somenteConsulta : f.handleToggleSelection}
                handleSelectAll={mx.ativo ? somenteConsulta : f.handleSelectAll}
                toggleActiveStatus={mx.ativo ? somenteConsulta : f.toggleActiveStatus}
                handleOpenEditModal={mx.ativo ? somenteConsulta : f.handleOpenEditModal}
                duplicateProduct={mx.ativo ? somenteConsulta : f.duplicateProduct}
                deleteProduct={mx.ativo ? somenteConsulta : f.deleteProduct}
                handleVender={mx.ativo ? (_p: Product, e: React.MouseEvent) => { e.stopPropagation(); somenteConsulta(); } : handleVender}
              />
            )}
            <Pagination page={page} totalPages={totalPages} total={viewTotal} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="produto" />
          </>
        )}

        {sellingProduct && (
          <CriarPropostaModal
            isOpen={!!sellingProduct}
            onClose={() => setSellingProduct(null)}
            onSave={handleSaveVenda}
            title={`Vender: ${sellingProduct.name}`}
            submitText="Criar Proposta"
            initialValue={{
              itens: [{
                productId: sellingProduct.id,
                descricao: sellingProduct.name,
                quantidade: 1,
                precoUnitario: sellingProduct.price,
              }],
            }}
          />
        )}

        <ProdutosAICombo />

        <ProdutoModal
          isOpen={f.isModalOpen}
          onClose={() => f.setIsModalOpen(false)}
          editingProduct={f.editingProduct}
          activeTab={f.activeTab}
          setActiveTab={f.setActiveTab}
          simulateTax={f.simulateTax}
          setSimulateTax={f.setSimulateTax}
          attachments={f.attachments}
          setAttachments={f.setAttachments}
          draftProductId={f.draftProductId}
          activeTenantId={f.activeTenantId}
          clientSearch={f.clientSearch}
          setClientSearch={f.setClientSearch}
          clientId={f.clientId}
          clientName={f.clientName}
          showClientDropdown={f.showClientDropdown}
          setShowClientDropdown={f.setShowClientDropdown}
          filteredClients={f.filteredClients}
          handleSelectClient={f.handleSelectClient}
          clearClient={f.clearClient}
          formName={f.formName}
          setFormName={f.setFormName}
          formSKU={f.formSKU}
          setFormSKU={f.setFormSKU}
          formCategory={f.formCategory}
          setFormCategory={f.setFormCategory}
          formType={f.formType}
          setFormType={f.setFormType}
          formTypeAttributes={f.formTypeAttributes}
          setFormTypeAttributes={f.setFormTypeAttributes}
          formPrice={f.formPrice}
          setFormPrice={f.setFormPrice}
          formCost={f.formCost}
          setFormCost={f.setFormCost}
          formCommission={f.formCommission}
          setFormCommission={f.setFormCommission}
          formStockMin={f.formStockMin}
          setFormStockMin={f.setFormStockMin}
          formStockMax={f.formStockMax}
          setFormStockMax={f.setFormStockMax}
          formProvider={f.formProvider}
          setFormProvider={f.setFormProvider}
          formTags={f.formTags}
          setFormTags={f.setFormTags}
          formIsBestSeller={f.formIsBestSeller}
          setFormIsBestSeller={f.setFormIsBestSeller}
          formDimensions={f.formDimensions}
          setFormDimensions={f.setFormDimensions}
          formWeight={f.formWeight}
          setFormWeight={f.setFormWeight}
          formMaterial={f.formMaterial}
          setFormMaterial={f.setFormMaterial}
          formDescription={f.formDescription}
          setFormDescription={f.setFormDescription}
          formCurrentStock={f.formCurrentStock}
          setFormCurrentStock={f.setFormCurrentStock}
          formIsRecurring={f.formIsRecurring}
          setFormIsRecurring={f.setFormIsRecurring}
          formBillingCycle={f.formBillingCycle}
          setFormBillingCycle={f.setFormBillingCycle}
          formContractMonths={f.formContractMonths}
          setFormContractMonths={f.setFormContractMonths}
          formHasImplementation={f.formHasImplementation}
          setFormHasImplementation={f.setFormHasImplementation}
          formImplementationFee={f.formImplementationFee}
          setFormImplementationFee={f.setFormImplementationFee}
          formHasLoyalty={f.formHasLoyalty}
          setFormHasLoyalty={f.setFormHasLoyalty}
          formLoyaltyMonths={f.formLoyaltyMonths}
          setFormLoyaltyMonths={f.setFormLoyaltyMonths}
          formEarlyTerminationFee={f.formEarlyTerminationFee}
          setFormEarlyTerminationFee={f.setFormEarlyTerminationFee}
          categories={f.categories}
          typeOptions={f.typeOptions}
          handleSaveProduct={f.handleSaveProduct}
        />
      </div>
    </PageContainer>
  );
}
