import { useState, useEffect, useMemo } from "react";
import { useData } from "../../../contexts/DataContext";
import { useLocalization } from "../../../contexts/LocalizationContext";
import { supabase } from "../../../lib/supabase";
import { toast } from "sonner";
import { calculateLeadScore } from "../../../lib/leadScore";
import { aoGanharNegocio } from "../../../lib/implementationAutoStart";
import { useAuth } from "../../../contexts/AuthContext";
import { getStageId, findWonStage } from "../../../lib/funilStages";
import { WIN_FUNIL_CONFIG_KEY } from "../../../lib/implementationStage";

// ─── Stage helpers ────────────────────────────────────────────────────────────

function buildStages(funis: any[], isSDR: boolean) {
  const funil = funis.find(
    (f: any) => f.ativo !== false && (isSDR ? f.tipo === "sdr_ia" : f.tipo === "comercial")
  );
  if (!funil) return [];
  return (funil.etapas as string[]).map((name, idx) => ({
    id: getStageId(funil.id, idx),
    name,
    status: idx === 0 ? "Novo" : idx === funil.etapas.length - 1 ? "Fechado" : "Em Negociação",
    funilId: funil.id,
  }));
}


// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLeadDetails(lead: any, onClose: () => void) {
  const { activeTenantId } = useAuth();
  const { leadActivities, addLeadActivity, updateLead, deleteLead, customLeadFields, products, addProduct, turmas, addTurma, funis, students, addStudent, proposals, appSettings, clienteBase, addImplementation, updateClienteBase } = useData();
  const { formatCurrency } = useLocalization();

  // ── Exclusão ─────────────────────────────────────────────────────────────────
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  // ── Campos customizados ──────────────────────────────────────────────────────
  const [customFieldsState, setCustomFieldsState] = useState<Record<string, string | number>>({});

  // ── Formulário de atividade (aba Histórico) ───────────────────────────────────
  const [activityType, setActivityType]   = useState<"Ligação" | "E-mail" | "Reunião" | "Outro">("Ligação");
  const [activityDesc, setActivityDesc]   = useState("");
  const [activityTitle, setActivityTitle] = useState("");
  const [activityDate, setActivityDate]   = useState(() => {
    const offset = new Date().getTimezoneOffset() * 60000;
    return new Date(Date.now() - offset).toISOString().slice(0, 10);
  });
  const [activityTime, setActivityTime]   = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [activityError, setActivityError] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<{ name: string; size: string }[]>([]);

  // ── Campos editáveis do lead ──────────────────────────────────────────────────
  const [isEditingInline, setIsEditingInline] = useState(false);
  const [leadName, setLeadName]       = useState("");
  const [companyName, setCompanyName] = useState("");
  const [cnpj, setCnpj]               = useState("");
  const [phone, setPhone]             = useState("");
  const [email, setEmail]             = useState("");
  const [title, setTitle]             = useState("");
  const [value, setValue]             = useState("");
  const [seller, setSeller]           = useState("");
  const [priority, setPriority]       = useState<"Alta" | "Média" | "Baixa">("Média");

  // ── Inteligência do lead ─────────────────────────────────────────────────────
  const [score, setScore]             = useState(0);
  const [temperature, setTemperature] = useState<"Quente" | "Morno" | "Frio">("Frio");
  const [probability, setProbability] = useState(0);
  const [slaStatus]                   = useState<"Em Dia" | "Crítico" | "Atrasado">("Em Dia");
  const [timeIdle]                    = useState("");

  // ── Tags personalizadas ───────────────────────────────────────────────────────
  const [customTags, setCustomTags]   = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");

  // ── Log de alterações ─────────────────────────────────────────────────────────
  const [alterationLogs, setAlterationLogs] = useState<
    Array<{ id: string; author: string; desc: string; time: string }>
  >([]);

  // ── Contexto do relatório IA ──────────────────────────────────────────────────
  const [reportContextOverride, setReportContextOverride] =
    useState<"auto" | "normal" | "educacao" | "posvenda">("auto");

  // ── Produtos vinculados ──────────────────────────────────────────────────────
  const availableProducts = useMemo(
    () =>
      (products || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        price: typeof p.price === "number" ? p.price : parseFloat(String(p.price || "0")),
        cost: typeof p.cost === "number" ? p.cost : parseFloat(String(p.cost || "0")),
        commission: typeof p.commission === "number" ? p.commission : parseFloat(String(p.commission || "0")),
        recurrence: p.type === "Assinatura",
        category: p.category || "Geral",
      })),
    [products]
  );

  const [linkedProductIds, setLinkedProductIds] = useState<string[]>([]);
  const [productQuantities, setProductQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    if (lead?.customFields?.productQuantities) {
      setProductQuantities(lead.customFields.productQuantities);
    } else {
      setProductQuantities({});
    }
  }, [lead?.id]);

  const estimatedSum = useMemo(
    () =>
      linkedProductIds.reduce((sum, id) => {
        const p = availableProducts.find(prod => prod.id === id);
        const qty = productQuantities[id] || 1;
        return sum + (p ? p.price * qty : 0);
      }, 0),
    [linkedProductIds, availableProducts, productQuantities]
  );

  // Proposta comercial vinculada a este lead (proposals.lead_id) — usada como
  // fallback de valor quando o lead ainda não tem `productIds` preenchido
  // (ex.: a proposta foi criada/vinculada por um fluxo que só grava o vínculo
  // do lado da proposta, sem sincronizar de volta o array de produtos do lead).
  // Mesma lógica de "proposta mais recente vinculada" usada em ProductsSection.
  const linkedProposal = useMemo(() => {
    if (!lead?.id) return null;
    const linked = (proposals || []).filter((p: any) => p.lead_id === lead.id);
    if (linked.length === 0) return null;
    return [...linked].sort((a: any, b: any) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    )[0];
  }, [proposals, lead?.id]);

  // Sincroniza o campo value com o total dos produtos vinculados (view e edição);
  // se não há productIds mas existe proposta vinculada, usa o valor dela.
  useEffect(() => {
    if (linkedProductIds.length > 0) {
      setValue(formatCurrency(estimatedSum));
    } else if (linkedProposal?.valor && Number(linkedProposal.valor) > 0) {
      setValue(formatCurrency(Number(linkedProposal.valor)));
    }
  }, [linkedProductIds, estimatedSum, linkedProposal, formatCurrency]);

  // ── Estágios do funil ─────────────────────────────────────────────────────────
  // Funis vêm do Supabase (crm_funis, via DataContext) — nada de localStorage.
  const isSDR = lead?.pipelineId === "sdr";
  const [currentStageId, setCurrentStageId] = useState<string>(lead?.stageId ?? "");
  const stagesDef = useMemo(() => buildStages(funis, isSDR), [funis, isSDR]);

  // Sincroniza campos ao abrir/trocar lead
  useEffect(() => {
    if (!lead) return;
    setLeadName(lead.name || "");
    setCompanyName(lead.company || "");
    setCnpj(lead.cnpj || "");
    setPhone(lead.phone || "");
    setEmail(lead.email || "");
    setTitle(lead.title || "");
    setValue(lead.value || "");
    setSeller(lead.seller || "");
    setPriority(lead.priority || "Média");
    setCustomFieldsState(lead.customFields || {});
    // Se a proposta vinculada já foi Aceita, os produtos pertencem à proposta fechada
    // e não devem ficar ativos no carrinho de nova proposta do Mini PDV.
    const isAccepted = linkedProposal?.status === "Aceita";
    setLinkedProductIds(isAccepted ? [] : (Array.isArray(lead.productIds) ? lead.productIds : []));
    setCustomTags(Array.isArray(lead.customFields?.tags) ? lead.customFields.tags : []);

    // Calcula score dinâmico considerando a etapa e as notas do cliente
    const calculated = calculateLeadScore(lead);
    const effectiveScore = typeof lead.scoreIA === "number" && lead.scoreIA !== 50
      ? lead.scoreIA
      : calculated.score;

    const t = (lead.temperature ?? "").toLowerCase();
    const derivedTemp: "Quente" | "Morno" | "Frio" =
      t === "quente" ? "Quente"
      : t === "morno" ? "Morno"
      : t === "frio" ? "Frio"
      : calculated.temperature;

    setScore(effectiveScore);
    setTemperature(derivedTemp);
    setProbability(effectiveScore >= 80 ? 85 : effectiveScore >= 70 ? 70 : effectiveScore >= 40 ? 45 : 20);
  }, [lead, linkedProposal?.status]);

  // Garante que propostas já aceitas não deixem produtos pendentes no carrinho do PDV
  useEffect(() => {
    if (linkedProposal?.status === "Aceita") {
      setLinkedProductIds([]);
    }
  }, [linkedProposal?.status]);

  // Reseta stageId e modo de edição quando muda de lead
  useEffect(() => {
    setCurrentStageId(lead?.stageId ?? "");
    setIsEditingInline(false);
  }, [lead?.id]);

  // Popula log de alterações com atividades reais
  useEffect(() => {
    if (!lead?.id || !leadActivities) return;
    setAlterationLogs(
      (leadActivities as any[])
        .filter(a => a.leadId === lead.id)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map(a => ({
          id: a.id,
          author: a.seller || "Sistema",
          desc: a.title || a.description || "Atividade registrada",
          time: a.date || "Recente",
        }))
    );
  }, [lead?.id, leadActivities]);

  // ─── Helpers de turma ────────────────────────────────────────────────────────

  const EDUCATION_CATEGORIES = ["mentoria", "curso", "treinamento", "workshop", "capacitação", "aula", "ead"];

  const isEducationProduct = (product: { category?: string }) =>
    EDUCATION_CATEGORIES.some(c => (product.category || "").toLowerCase().includes(c));

  const enrollInLinkedTurmas = () => {
    const educationProducts = availableProducts.filter(
      p => linkedProductIds.includes(p.id) && isEducationProduct(p)
    );
    for (const product of educationProducts) {
      const turma = (turmas as any[]).find(t => t.curso === product.name);
      if (!turma) continue;
      // `turmas` não tem coluna `students` — matrícula é uma linha na tabela real
      // `students`, ligada por `turma_id`. Não existe FK pra `leads` nessa tabela,
      // então o dedupe de "já matriculado" é feito por e-mail dentro da turma.
      const alreadyEnrolled = (students as any[]).some(
        s => s.turma_id === turma.id && !!email && s.email === email
      );
      if (!alreadyEnrolled) {
        addStudent({
          turma_id: turma.id,
          nome: leadName || companyName,
          email: email || null,
          telefone: phone || null,
          status: "Ativo",
        });
        toast.success(`${leadName || companyName} matriculado em ${turma.nome || turma.name}!`);
      }
    }
  };

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleAddTag = () => {
    const tag = newTagInput.trim();
    if (!tag) return;
    if (customTags.includes(tag)) { toast.error("Tag já adicionada."); return; }
    const next = [...customTags, tag];
    setCustomTags(next);
    setNewTagInput("");
    // `leads` não tem coluna `tags` própria — guardamos dentro de `customFields`
    // (jsonb), a mesma abordagem usada pra `productIds`.
    updateLead(lead.id, { customFields: { ...(lead.customFields || {}), tags: next } });
    toast.success("Tag adicionada!");
  };

  const handleRemoveTag = (tag: string) => {
    const next = customTags.filter(t => t !== tag);
    setCustomTags(next);
    updateLead(lead.id, { customFields: { ...(lead.customFields || {}), tags: next } });
    toast.info("Tag removida.");
  };

  const handleConvertLead = () => {
    const wonStage = findWonStage(stagesDef);
    updateLead(lead.id, { stageId: wonStage?.id ?? "5", status: "Fechado" });

    const winConfig = appSettings[WIN_FUNIL_CONFIG_KEY] as Record<string, string> | undefined;
    const targetFunilId = wonStage?.funilId ? winConfig?.[wonStage.funilId] : undefined;
    const targetFunil = targetFunilId ? (funis as any[]).find((f: any) => f.id === targetFunilId) : null;
    if (targetFunil) {
      updateLead(lead.id, { stageId: getStageId(targetFunilId!, 0) });
      toast.success(`Lead ${leadName} ganho! Movido automaticamente para "${targetFunil.nome}".`);
    } else {
      toast.success(`Lead ${leadName} convertido para Cliente Fechado!`);
    }

    // Mesma conexão com Implementações + Ordem de Serviço usada no drag-and-drop do Kanban (ver
    // handleWinStageDrop em usePipeline.ts) — sem isso, convertido por aqui não gerava a implementação/OS.
    const cliente = lead?.clientId ? (clienteBase as any[]).find((c: any) => c.id === lead.clientId) : null;
    if (cliente) {
      aoGanharNegocio(cliente, lead, {
        supabase, addImplementation, updateClienteBase, produtos: products as any[], tenantId: activeTenantId, legacy: !!targetFunil,
      })
        .then((result) => {
          if (!result) return;
          if (result.implementacaoCriada) toast.success(`Implementação iniciada automaticamente para "${cliente.name}".`);
          if (result.ordem === "criada") toast.success(`Ordem de serviço gerada em Implementação para "${cliente.name}".`);
        })
        .catch((err) => console.error("[LeadDetails] Falha ao gerar implementação/OS ao ganhar:", err));
    }
    setAlterationLogs(prev => [
      { id: Date.now().toString(), author: seller || "Sistema", desc: "Lead convertido em Cliente Ativo", time: "Agora" },
      ...prev,
    ]);
    enrollInLinkedTurmas();
  };

  const handleRegisterActivity = () => {
    if (!activityDesc.trim()) {
      setActivityError("A descrição da atividade é obrigatória.");
      toast.error("Insira uma descrição para registrar a atividade!");
      return;
    }
    const titleMap: Record<string, string> = {
      Ligação: "Ligação Telefônica realizada",
      "E-mail": "E-mail Comercial enviado",
      Reunião: "Apresentação/Reunião executada",
      Outro: "Observação Geral do Consultor",
    };
    const finalTitle = activityTitle.trim() || titleMap[activityType];

    let finalDate = `${activityDate} ${activityTime}`;
    try {
      const [y, m, d] = activityDate.split("-").map(Number);
      const [h, min] = activityTime.split(":").map(Number);
      const dt = new Date(y, m - 1, d, h, min);
      const today = new Date();
      const isToday =
        dt.getDate() === today.getDate() &&
        dt.getMonth() === today.getMonth() &&
        dt.getFullYear() === today.getFullYear();
      const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
      finalDate = isToday ? `Hoje, ${activityTime}` : `${dt.getDate()} ${months[dt.getMonth()]} às ${activityTime}`;
    } catch {}

    addLeadActivity(
      lead.id, activityType, finalTitle, activityDesc,
      seller || "Sistema", finalDate,
      selectedFiles.length > 0 ? selectedFiles : undefined
    );
    setAlterationLogs(prev => [
      { id: Date.now().toString(), author: seller || "Sistema", desc: `Registrou: ${finalTitle}`, time: "Agora" },
      ...prev,
    ]);
    setActivityDesc("");
    setActivityTitle("");
    setActivityError("");
    setSelectedFiles([]);
    toast.success("Histórico atualizado com sucesso!");
  };

  const handleSaveAll = () => {
    // `value` NÃO entra aqui de propósito: o valor do lead é derivado (soma das
    // propostas vinculadas, recalculado em DataContext.tsx) e só pode ser
    // alterado editando a proposta em si — ver ProfileDataForm ("Valor da
    // Proposta", campo trancado).
    updateLead(lead.id, {
      name: leadName, company: companyName, cnpj, phone, email, title, seller, priority,
      customFields: customFieldsState, productIds: linkedProductIds,
    });
    setAlterationLogs(prev => [
      { id: Date.now().toString(), author: seller || "Sistema", desc: "Informações do lead atualizadas", time: "Agora" },
      ...prev,
    ]);
    toast.success("Alterações salvas!");
    setIsEditingInline(false);
  };

  const handleConfirmDelete = () => {
    deleteLead(lead.id);
    toast.success("Lead removido.");
    onClose();
  };

  const applyMessageTemplate = (tpl: string) =>
    tpl
      .replace("{client}", leadName)
      .replace("{company}", companyName)
      .replace("{seller}", seller || "Consultor");

  const toggleProductLink = (prodId: string) => {
    const isAdding = !linkedProductIds.includes(prodId);
    const newIds = isAdding
      ? [...linkedProductIds, prodId]
      : linkedProductIds.filter(id => id !== prodId);
    setLinkedProductIds(newIds);
    updateLead(lead.id, { productIds: newIds });

    if (isAdding) {
      const product = availableProducts.find(p => p.id === prodId);
      if (product && isEducationProduct(product)) {
        // `turmas` não tem coluna `productId` — o vínculo com o produto é feito por
        // nome (`curso === product.name`), já que não existe FK própria pra isso.
        const existing = (turmas as any[]).find(t => t.curso === product.name);
        if (!existing) {
          addTurma({
            nome: `Turma — ${product.name}`,
            curso: product.name,
            professor: "Não definido",
            vagas: 30,
            shift: "Manhã",
            data_inicio: new Date().toISOString().slice(0, 10),
            status: "Planejamento",
            progress: 0,
          });
          toast.success(`Turma criada automaticamente para ${product.name}!`);
        }
      }
    }

    toast[isAdding ? "success" : "info"](
      isAdding ? "Produto adicionado ao orçamento!" : "Produto removido do orçamento."
    );
  };

  const updateProductQuantity = (prodId: string, qty: number) => {
    const cleanQty = Math.max(1, Math.round(qty));
    setProductQuantities(prev => {
      const next = { ...prev, [prodId]: cleanQty };
      updateLead(lead.id, {
        customFields: {
          ...(customFieldsState || {}),
          productQuantities: next,
        },
      });
      return next;
    });
  };

  const handleCreateAndLinkProduct = async (data: {
    name: string;
    price: number;
    cost?: number;
    commission?: number;
    category?: string;
    type?: string;
    sku?: string;
    description?: string;
    recurrence?: boolean;
    contractMonths?: number;
    hasImplementation?: boolean;
    implementationFee?: number;
    currentStock?: number;
    stockMin?: number;
    stockMax?: number;
  }) => {
    const sku = data.sku?.trim() || `PROD-${Math.floor(1000 + Math.random() * 9000)}`;
    const priceNum = Number(data.price) || 0;
    const costNum = Number(data.cost) || 0;
    const commNum = Number(data.commission) || 0;
    const marginRatio = priceNum > 0 ? parseFloat((((priceNum - costNum) / priceNum) * 100).toFixed(1)) : 0;

    const newProd = {
      id: crypto.randomUUID(),
      sku,
      name: data.name.trim(),
      category: data.category || "Serviços",
      type: data.type || "Digital",
      price: priceNum,
      cost: costNum,
      margin: marginRatio,
      commission: commNum,
      active: true,
      stockMin: data.stockMin !== undefined ? data.stockMin : 1,
      stockMax: data.stockMax !== undefined ? data.stockMax : 100,
      currentStock: data.currentStock !== undefined ? data.currentStock : 10,
      description: data.description || "",
      provider: seller || "Interno",
      tags: ["crm", "lead"],
      recurrence: data.recurrence ?? false,
      contractMonths: data.contractMonths ?? 12,
      hasImplementation: data.hasImplementation ?? false,
      implementationFee: data.implementationFee ?? 0,
      type_attributes: {
        isRecurring: data.recurrence ?? false,
        contractMonths: data.contractMonths ?? 12,
        hasImplementation: data.hasImplementation ?? false,
        implementationFee: data.implementationFee ?? 0,
      },
    };

    await addProduct(newProd);

    // Link immediately to current lead
    const nextIds = linkedProductIds.includes(newProd.id) ? linkedProductIds : [...linkedProductIds, newProd.id];
    setLinkedProductIds(nextIds);
    setProductQuantities(prev => ({ ...prev, [newProd.id]: 1 }));
    updateLead(lead.id, {
      productIds: nextIds,
      customFields: {
        ...(customFieldsState || {}),
        productIds: nextIds,
        productQuantities: {
          ...(productQuantities || {}),
          [newProd.id]: 1,
        },
      },
    });

    setAlterationLogs(prev => [
      {
        id: Date.now().toString(),
        author: seller || "Sistema",
        desc: `Cadastrou e vinculou produto '${newProd.name}' (${formatCurrency(priceNum)})`,
        time: "Agora",
      },
      ...prev,
    ]);

    toast.success(`Produto "${newProd.name}" cadastrado no banco e vinculado!`);
    return newProd.id;
  };

  const handleUpdateScore = (newScore: number, customTemp?: "Quente" | "Morno" | "Frio") => {
    const clampedScore = Math.max(0, Math.min(100, Math.round(newScore)));
    const derivedTemp: "Quente" | "Morno" | "Frio" = customTemp || (
      clampedScore >= 70 ? "Quente" : clampedScore >= 40 ? "Morno" : "Frio"
    );
    const newProb = clampedScore >= 80 ? 85 : clampedScore >= 70 ? 70 : clampedScore >= 40 ? 45 : 20;

    setScore(clampedScore);
    setTemperature(derivedTemp);
    setProbability(newProb);

    updateLead(lead.id, {
      scoreIA: clampedScore,
      temperature: derivedTemp.toLowerCase() as any,
      probability: newProb,
    });

    if (supabase) {
      supabase.from("leads").update({
        scoreIA: clampedScore,
        score_ia: clampedScore,
        temperature: derivedTemp.toLowerCase(),
      }).eq("id", lead.id).then(() => {});
    }

    setAlterationLogs(prev => [
      {
        id: Date.now().toString(),
        author: seller || "Sistema",
        desc: `Score do lead atualizado para ${clampedScore}/100 (${derivedTemp})`,
        time: "Agora",
      },
      ...prev,
    ]);
  };

  // ─── Visual helpers ───────────────────────────────────────────────────────────

  const tempColors = {
    Quente: "bg-rose-500/10 border-rose-500/30 text-rose-400 font-bold",
    Morno:  "bg-amber-500/10 border-amber-500/30 text-amber-400 font-bold",
    Frio:   "bg-blue-500/10 border-blue-500/30 text-blue-400 font-bold",
  };

  // ─── Return ───────────────────────────────────────────────────────────────────

  return {
    // Delete
    isConfirmDeleteOpen, setIsConfirmDeleteOpen,
    // Custom fields
    customFieldsState, setCustomFieldsState,
    // Activity form
    activityType, setActivityType,
    activityDesc, setActivityDesc,
    activityTitle, setActivityTitle,
    activityDate, setActivityDate,
    activityTime, setActivityTime,
    activityError, setActivityError,
    selectedFiles, setSelectedFiles,
    // Products
    availableProducts,
    linkedProductIds, setLinkedProductIds,
    productQuantities, setProductQuantities,
    updateProductQuantity,
    handleCreateAndLinkProduct,
    estimatedSum,
    toggleProductLink,
    // Lead editable fields
    isEditingInline, setIsEditingInline,
    leadName, setLeadName,
    companyName, setCompanyName,
    cnpj, setCnpj,
    phone, setPhone,
    email, setEmail,
    title, setTitle,
    value, setValue,
    seller, setSeller,
    priority, setPriority,
    // Intelligence
    score, setScore,
    temperature, setTemperature,
    probability, setProbability,
    slaStatus, timeIdle,
    handleUpdateScore,
    // Tags
    customTags, newTagInput, setNewTagInput,
    // Logs
    alterationLogs, setAlterationLogs,
    // Stages
    stagesDef,
    currentStageId, setCurrentStageId,
    // Report
    reportContextOverride, setReportContextOverride,
    // Custom fields config
    customLeadFields,
    // Visual
    tempColors,
    // Handlers
    handleAddTag,
    handleRemoveTag,
    handleConvertLead,
    handleRegisterActivity,
    handleSaveAll,
    handleConfirmDelete,
    applyMessageTemplate,
    enrollInLinkedTurmas,
  };
}
