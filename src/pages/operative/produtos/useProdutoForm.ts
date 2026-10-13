import React, { useState, useMemo } from "react";
import { Product, ProductType, ProductAttachment } from "../../../types";
import { toast } from "sonner";
import { useData } from "../../../contexts/DataContext";
import { useAuth } from "../../../contexts/AuthContext";
import { BASE_TYPES, isUniqueAssetType, statusToStock } from "./typeSchemas";
import { useNicheProfiles } from "./useNicheProfiles";
import { resolveTypeOptions, getDefaultType, getDefaultCategory, profileCategories, hidesSubscription, persistDefaultsFor } from "./nicheProfiles";

export function useProdutoForm() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState("Todos");
  const [sortBy, setSortBy] = useState("name-asc");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modal controllers
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Tab and Interactive state inside modal
  const [activeTab, setActiveTab] = useState<"info" | "comercial" | "estoque" | "arquivos">("info");
  const [simulateTax, setSimulateTax] = useState(false);
  const [attachments, setAttachments] = useState<ProductAttachment[]>([]);
  // Id gerado assim que o modal de "novo produto" abre — usado como pasta de
  // upload no Storage antes do produto existir de fato, pra não precisar de
  // path temporário/rename depois que ele for salvo.
  const [draftProductId, setDraftProductId] = useState("");

  // Client association state
  const [clientSearch, setClientSearch] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  // Form State
  const [formName, setFormName] = useState("");
  const [formSKU, setFormSKU] = useState("");
  const [formCategory, setFormCategory] = useState("Software");
  const [formType, setFormType] = useState<ProductType>("Digital");
  const [formTypeAttributes, setFormTypeAttributes] = useState<Record<string, string | number | boolean>>({});
  const [formPrice, setFormPrice] = useState("");
  const [formCost, setFormCost] = useState("");
  const [formCommission, setFormCommission] = useState("5");
  const [formStockMin, setFormStockMin] = useState("10");
  const [formStockMax, setFormStockMax] = useState("100");
  const [formProvider, setFormProvider] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formIsBestSeller, setFormIsBestSeller] = useState(false);
  const [formDimensions, setFormDimensions] = useState("");
  const [formWeight, setFormWeight] = useState("");
  const [formMaterial, setFormMaterial] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCurrentStock, setFormCurrentStock] = useState("0");

  // Recurrence & Implementation State
  const [formIsRecurring, setFormIsRecurring] = useState(false);
  const [formBillingCycle, setFormBillingCycle] = useState("Mensal");
  const [formContractMonths, setFormContractMonths] = useState("12");
  const [formHasImplementation, setFormHasImplementation] = useState(false);
  const [formImplementationFee, setFormImplementationFee] = useState("0");

  // Fidelidade: prazo mínimo de permanência com multa por cancelamento
  // antecipado — distinto de formContractMonths (vigência normal do contrato).
  const [formHasLoyalty, setFormHasLoyalty] = useState(false);
  const [formLoyaltyMonths, setFormLoyaltyMonths] = useState("12");
  const [formEarlyTerminationFee, setFormEarlyTerminationFee] = useState("0");

  const { products, addProduct, updateProduct, deleteProduct, setProducts, clienteBase } = useData();
  const { user, activeTenantId, isModuleEnabled } = useAuth();

  // Perfis de nicho ativos (módulos do tenant + tenantNiche) — ver nicheProfiles.ts.
  const profiles = useNicheProfiles();
  const tenantNiche = user?.tenantNiche;
  const defaultType = getDefaultType(profiles, tenantNiche);
  const defaultCategory = getDefaultCategory(profiles, tenantNiche);
  const varejoOn = profiles.some(p => p.key === "varejo");

  // Tipos = base + tipos dos perfis ativos. O tipo do registro em edição continua visível.
  const typeOptions: ProductType[] = useMemo(() => {
    const used = Array.from(new Set(products.map(pr => pr.type)));
    return resolveTypeOptions(profiles, BASE_TYPES, defaultType, [editingProduct?.type, ...used]);
  }, [editingProduct, profiles, defaultType, products]);

  const categories = useMemo(() => {
    const base = ["Todas", "Software", "Serviços", "Implantação", "Mentoria", "Físico"];
    profileCategories(profiles).forEach(c => { if (!base.includes(c)) base.push(c); });
    // categorias já usadas por produtos existentes (ex.: migrados das verticais)
    products.forEach(pr => { if (pr.category && !base.includes(pr.category)) base.push(pr.category); });
    return base;
  }, [profiles, products]);
  const types = useMemo(() => ["Todos", ...typeOptions], [typeOptions]);

  const filteredClients = useMemo(() => {
    if (!clienteBase) return [];
    const q = clientSearch.toLowerCase();
    return clienteBase.filter((c: any) =>
      (c.name || c.nome || "").toLowerCase().includes(q)
    ).slice(0, 30);
  }, [clienteBase, clientSearch]);

  function handleSelectClient(client: any) {
    const name = client.name || client.nome || "";
    setClientId(client.id);
    setClientName(name);
    setClientSearch(name);
    setShowClientDropdown(false);
  }

  function clearClient() {
    setClientId("");
    setClientName("");
    setClientSearch("");
  }

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setDraftProductId(crypto.randomUUID());
    setFormName("");
    setFormSKU("PROD-" + Math.floor(1000 + Math.random() * 9000));
    setFormCategory(defaultCategory);
    setFormType(defaultType);
    setFormTypeAttributes({});
    setFormPrice("");
    setFormCost("");
    setFormCommission("5");
    setFormStockMin("5");
    setFormStockMax("100");
    setFormProvider(varejoOn ? "" : "Interno");
    setFormTags(varejoOn ? "" : "novo, crm");
    setFormIsBestSeller(false);
    setFormDimensions("");
    setFormWeight("");
    setFormMaterial("");
    setFormDescription("");
    setFormCurrentStock("0");
    setFormIsRecurring(false);
    setFormBillingCycle("Mensal");
    setFormContractMonths("12");
    setFormHasImplementation(false);
    setFormImplementationFee("0");
    setFormHasLoyalty(false);
    setFormLoyaltyMonths("12");
    setFormEarlyTerminationFee("0");
    setActiveTab("info");
    setSimulateTax(false);
    setAttachments([]);
    setClientId("");
    setClientName("");
    setClientSearch("");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (p: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProduct(p);
    setFormName(p.name);
    setFormSKU(p.sku);
    setFormCategory(p.category);
    setFormType(p.type);
    setFormTypeAttributes(p.typeAttributes || {});
    setFormPrice(p.price.toString());
    setFormCost(p.cost.toString());
    setFormCommission(p.commission.toString());
    setFormStockMin(p.stockMin.toString());
    setFormStockMax(p.stockMax.toString());
    setFormProvider(p.provider || "Interno");
    setFormTags((p.tags ?? []).join(", "));
    setFormIsBestSeller(!!p.isBestSeller);
    setFormDimensions(p.dimensions || "");
    setFormWeight(p.weight?.toString() || "");
    setFormMaterial(p.material || "");
    setFormDescription(p.description || "");
    setFormCurrentStock(p.currentStock.toString());

    const isRec = !!(p.recurrence || p.typeAttributes?.isRecurring || p.type === "Assinatura");
    setFormIsRecurring(isRec);
    setFormBillingCycle(
      (p.billingCycle || p.typeAttributes?.billingCycle || p.typeAttributes?.cicloCobranca || "Mensal") as string
    );
    setFormContractMonths(String(p.contractMonths || p.typeAttributes?.contractMonths || "12"));
    setFormHasImplementation(
      !!(p.hasImplementation || p.typeAttributes?.hasImplementation || p.category === "Implantação")
    );
    setFormImplementationFee(String(p.implementationFee || p.typeAttributes?.implementationFee || "0"));

    setFormHasLoyalty(!!(p.hasLoyalty || p.typeAttributes?.hasLoyalty));
    setFormLoyaltyMonths(String(p.loyaltyMonths || p.typeAttributes?.loyaltyMonths || "12"));
    setFormEarlyTerminationFee(String(p.earlyTerminationFeePercent || p.typeAttributes?.earlyTerminationFeePercent || "0"));

    setActiveTab("info");
    setSimulateTax(false);
    setAttachments(p.attachments || []);
    setClientId((p as any).clientId || "");
    setClientName((p as any).clientName || "");
    setClientSearch((p as any).clientName || "");
    setIsModalOpen(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formName.trim() || !formSKU.trim() || !formPrice) {
      toast.error("Por favor, preencha todos os campos obrigatórios (Nome, SKU e Preço Venda)");
      return;
    }

    const priceNum = parseFloat(formPrice) || 0;
    const costNum = parseFloat(formCost) || 0;
    const commNum = parseFloat(formCommission) || 0;
    const stockMinNum = parseInt(formStockMin) || 0;
    const stockMaxNum = parseInt(formStockMax) || 0;
    const marginRatio = priceNum > 0 ? parseFloat((((priceNum - costNum) / priceNum) * 100).toFixed(1)) : 0;
    const parsedTags = formTags.split(",").map(t => t.trim().toLowerCase()).filter(t => t.length > 0);

    const contractMonthsNum = parseInt(formContractMonths) || 12;
    const implFeeNum = parseFloat(formImplementationFee) || 0;
    const loyaltyMonthsNum = parseInt(formLoyaltyMonths) || 12;
    const earlyTerminationFeeNum = parseFloat(formEarlyTerminationFee) || 0;
    const enrichedTypeAttributes = {
      ...formTypeAttributes,
      isRecurring: formIsRecurring,
      billingCycle: formBillingCycle,
      contractMonths: contractMonthsNum,
      hasImplementation: formHasImplementation,
      implementationFee: implFeeNum,
      hasLoyalty: formHasLoyalty,
      loyaltyMonths: loyaltyMonthsNum,
      earlyTerminationFeePercent: earlyTerminationFeeNum,
    };

    const tenantName = user?.tenantName || "";

    // Perfis de nicho: persiste os padrões exibidos nos selects/toggles e esconde assinatura/implantação/fidelidade.
    const noSubscription = hidesSubscription(profiles, formType);
    if (noSubscription) {
      const defs = persistDefaultsFor(profiles, formType);
      Object.keys(defs).forEach(k => { if (formTypeAttributes[k] === undefined) (enrichedTypeAttributes as Record<string, unknown>)[k] = defs[k]; });
      Object.assign(enrichedTypeAttributes, { isRecurring: false, hasImplementation: false, implementationFee: 0, hasLoyalty: false });
    }

    // Ativos únicos (imóvel, veículo): status de disponibilidade governa active/estoque,
    // sem recorrência, fidelidade ou taxa de implantação.
    const unique = isUniqueAssetType(formType);
    const uniqueInfo = unique ? statusToStock(formTypeAttributes.statusAtivo as string | undefined) : null;
    if (uniqueInfo) {
      Object.assign(enrichedTypeAttributes, {
        statusAtivo: uniqueInfo.status,
        isRecurring: false,
        hasImplementation: false,
        implementationFee: 0,
        hasLoyalty: false,
      });
    }
    const hideSub = unique || noSubscription;
    const finalRecurring = hideSub ? false : formIsRecurring;
    const finalHasImpl = hideSub ? false : formHasImplementation;
    const finalImplFee = hideSub ? 0 : implFeeNum;
    const finalHasLoyalty = hideSub ? false : formHasLoyalty;
    const finalStockMin = uniqueInfo ? uniqueInfo.stockMin : stockMinNum;
    const finalStockMax = uniqueInfo ? uniqueInfo.stockMax : stockMaxNum;
    const finalCurrentStock = uniqueInfo ? uniqueInfo.currentStock : (parseInt(formCurrentStock) || 0);

    if (editingProduct) {
      updateProduct(editingProduct.id, {
        sku: formSKU,
        name: formName,
        category: formCategory,
        type: formType,
        typeAttributes: enrichedTypeAttributes,
        recurrence: finalRecurring,
        billingCycle: formBillingCycle as any,
        contractMonths: contractMonthsNum,
        hasImplementation: finalHasImpl,
        implementationFee: finalImplFee,
        hasLoyalty: finalHasLoyalty,
        loyaltyMonths: loyaltyMonthsNum,
        earlyTerminationFeePercent: earlyTerminationFeeNum,
        price: priceNum,
        cost: costNum,
        margin: marginRatio,
        commission: commNum,
        stockMin: finalStockMin,
        stockMax: finalStockMax,
        currentStock: finalCurrentStock,
        provider: formProvider,
        tags: parsedTags,
        isBestSeller: formIsBestSeller,
        dimensions: formDimensions,
        weight: parseFloat(formWeight) || 0,
        material: formMaterial,
        description: formDescription,
        attachments,
        clientId: clientId || undefined,
        clientName: clientName || undefined,
        tenantName,
        ...(uniqueInfo ? { active: uniqueInfo.active } : {}),
      });
      toast.success("Produto atualizado com sucesso!");
    } else {
      const nProd: Product = {
        id: draftProductId || crypto.randomUUID(),
        sku: formSKU,
        name: formName,
        category: formCategory,
        type: formType,
        typeAttributes: enrichedTypeAttributes,
        recurrence: finalRecurring,
        billingCycle: formBillingCycle as any,
        contractMonths: contractMonthsNum,
        hasImplementation: finalHasImpl,
        implementationFee: finalImplFee,
        hasLoyalty: finalHasLoyalty,
        loyaltyMonths: loyaltyMonthsNum,
        earlyTerminationFeePercent: earlyTerminationFeeNum,
        price: priceNum,
        cost: costNum,
        margin: marginRatio,
        commission: commNum,
        active: uniqueInfo ? uniqueInfo.active : true,
        stockMin: finalStockMin,
        stockMax: finalStockMax,
        currentStock: finalCurrentStock,
        provider: formProvider,
        isBestSeller: formIsBestSeller,
        tags: parsedTags,
        dimensions: formDimensions,
        weight: parseFloat(formWeight) || 0,
        material: formMaterial,
        description: formDescription,
        attachments,
        clientId: clientId || undefined,
        clientName: clientName || undefined,
        tenantName,
      } as any;
      addProduct(nProd);
      toast.success("Novo produto adicionado ao catálogo!");
    }

    setIsModalOpen(false);
  };

  const toggleActiveStatus = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const product = products.find(p => p.id === id);
    if (product) {
      const nextState = !product.active;
      updateProduct(id, { active: nextState });
      toast.info(nextState ? `Produto '${product.name}' ativado.` : `Produto '${product.name}' inativado.`);
    }
  };

  const duplicateProduct = (p: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    const duplicated: Product = {
      ...p,
      id: crypto.randomUUID(),
      sku: p.sku + "-COPY",
      name: p.name + " (Cópia)",
      active: true
    };
    addProduct(duplicated);
    toast.success(`Dublicado: Novo SKU duplicado '${duplicated.sku}' gerado.`);
  };

  const deleteProductItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if(confirm("Deseja realmente excluir este item do catálogo?")) {
      deleteProduct(id);
      toast.success("Produto removido do catálogo.");
    }
  };

  const handleToggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const executeBulkStatus = (activate: boolean) => {
    if (selectedIds.length === 0) return;
    selectedIds.forEach(id => {
      updateProduct(id, { active: activate });
    });
    toast.success(`${selectedIds.length} produtos atualizados com sucesso.`);
    setSelectedIds([]);
  };

  const executeBulkDelete = () => {
    if (selectedIds.length === 0) return;
    if (confirm(`Excluir definitivamente os ${selectedIds.length} produtos selecionados?`)) {
      selectedIds.forEach(id => deleteProduct(id));
      toast.success(`${selectedIds.length} produtos excluídos.`);
      setSelectedIds([]);
    }
  };

  const handleSelectAll = (filteredProducts: Product[]) => {
    const visibleIds = filteredProducts.map(p => p.id);
    if (selectedIds.length === visibleIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(visibleIds);
    }
  };

  return {
    viewMode, setViewMode,
    searchTerm, setSearchTerm,
    selectedCategories, setSelectedCategories,
    selectedTypes, setSelectedTypes,
    selectedStatus, setSelectedStatus,
    sortBy, setSortBy,
    selectedIds, setSelectedIds,
    isModalOpen, setIsModalOpen,
    editingProduct, setEditingProduct,
    activeTab, setActiveTab,
    simulateTax, setSimulateTax,
    attachments, setAttachments,
    draftProductId,
    activeTenantId,
    // client
    clientSearch, setClientSearch,
    clientId, setClientId,
    clientName, setClientName,
    showClientDropdown, setShowClientDropdown,
    filteredClients,
    handleSelectClient,
    clearClient,
    // form fields
    formName, setFormName,
    formSKU, setFormSKU,
    formCategory, setFormCategory,
    formType, setFormType,
    formTypeAttributes, setFormTypeAttributes,
    formPrice, setFormPrice,
    formCost, setFormCost,
    formCommission, setFormCommission,
    formStockMin, setFormStockMin,
    formStockMax, setFormStockMax,
    formProvider, setFormProvider,
    formTags, setFormTags,
    formIsBestSeller, setFormIsBestSeller,
    formDimensions, setFormDimensions,
    formWeight, setFormWeight,
    formMaterial, setFormMaterial,
    formDescription, setFormDescription,
    formCurrentStock, setFormCurrentStock,
    // Recurrence & Implementation
    formIsRecurring, setFormIsRecurring,
    formBillingCycle, setFormBillingCycle,
    formContractMonths, setFormContractMonths,
    formHasImplementation, setFormHasImplementation,
    formImplementationFee, setFormImplementationFee,
    formHasLoyalty, setFormHasLoyalty,
    formLoyaltyMonths, setFormLoyaltyMonths,
    formEarlyTerminationFee, setFormEarlyTerminationFee,
    products, setProducts,
    categories, types, typeOptions, varejoOn, profiles,
    handleOpenAddModal,
    handleOpenEditModal,
    handleSaveProduct,
    toggleActiveStatus,
    duplicateProduct,
    deleteProduct: deleteProductItem,
    handleToggleSelection,
    executeBulkStatus,
    executeBulkDelete,
    handleSelectAll
  };
}
