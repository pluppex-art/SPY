import { useState, useMemo, useEffect } from "react";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import confetti from "canvas-confetti";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { FUNIS_DEFAULT } from "../settings/sections/crm/funisTypes";
import { parseCurrencyBR } from "../../lib/utils";
import { supabase } from "../../lib/supabase";
import { startImplementationForClient } from "../../lib/implementationAutoStart";

// Matches ETAPA_CORES in SettingsCRM
const ETAPA_DOT_COLORS: Record<string, string> = {
  slate: "#64748b", blue: "#3b82f6", orange: "#f97316",
  cyan: "#06b6d4", emerald: "#10b981", purple: "#a855f7",
  rose: "#f43f5e", amber: "#f59e0b", indigo: "#6366f1", pink: "#ec4899",
};

// Produces stable stageIds backward-compatible with existing lead data
function getStageId(funilId: string, idx: number): string {
  if (funilId === "funil-comercial-default") return String(idx + 1);
  if (funilId === "funil-sdr-ia-default") return `sdr-${idx + 1}`;
  return `${funilId}-${idx}`;
}

export function usePipeline() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [sellerFilter, setSellerFilter] = useState("Todos");
  const [companyFilter, setCompanyFilter] = useState("Todos");
  const [cityFilter, setCityFilter] = useState("Todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [tempDropdownId, setTempDropdownId] = useState<string | null>(null);
  const [webhookModalLead, setWebhookModalLead] = useState<any>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const { leads, updateLead, tasks, addTask, products, clienteBase, funis: dataFunis, colaboradores, appSettings, addImplementation, updateClienteBase } = useData();
  const { user } = useAuth();
  const { formatCurrency } = useLocalization();

  const [clientFilter, setClientFilter] = useState("Todos");
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  // `clienteBase` (useData) já vem escopado ao tenant ativo — um fetch próprio
  // de "clientes" aqui não filtrava por tenant_id e vazava linhas de outros
  // tenants pra contas de parceiro (has_tenant_access verdadeiro pra vários).
  const clientsList = useMemo(
    () => [...new Set((clienteBase as any[]).map((c: any) => c.name).filter(Boolean))].sort(),
    [clienteBase]
  );

  const [currentPipeline, setCurrentPipeline] = useState<"comercial" | "sdr">("comercial");
  const [selectedFunilId, setSelectedFunilId] = useState<string>("");

  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [draggedOverStageId, setDraggedOverStageId] = useState<string | null>(null);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);

  // Funis vêm do Supabase (crm_funis, via DataContext) em tempo real; sem
  // config salva ainda, cai nos padrões só em memória (nada é gravado sozinho).
  const funisConfig: any[] = dataFunis.length > 0 ? dataFunis : FUNIS_DEFAULT;

  const allActiveFunis = useMemo(() => {
    const active = funisConfig.filter((f) => f.ativo !== false);
    if (clientFilter === "Todos") return active;

    // Prefer client-specific funnels; fall back to globals if none exist for this client
    const clientSpecific = active.filter((f) => f.clientIds?.includes(clientFilter));
    if (clientSpecific.length > 0) return clientSpecific;
    return active.filter((f) => !f.clientIds || f.clientIds.length === 0);
  }, [funisConfig, clientFilter]);
  const comercialFunis = useMemo(() => allActiveFunis.filter((f) => f.tipo === "comercial"), [allActiveFunis]);
  const sdrFunis      = useMemo(() => allActiveFunis.filter((f) => f.tipo === "sdr_ia"),   [allActiveFunis]);
  const isSdrEnabled  = sdrFunis.length > 0;

  // Keep selectedFunilId pointing to a valid funil when the pool changes —
  // "__todos__" nunca é "corrigido" de volta pra um funil específico, já que
  // não é (e não precisa ser) um id de funil real.
  useEffect(() => {
    if (selectedFunilId === "__todos__") return;
    const pool = currentPipeline === "sdr" ? sdrFunis : comercialFunis;
    if (pool.length > 0 && !pool.find((f) => f.id === selectedFunilId)) {
      setSelectedFunilId(pool[0].id);
    }
  }, [currentPipeline, sdrFunis, comercialFunis]);

  // Wrapper that resets filters synchronously when switching pipelines
  const switchPipeline = (pipeline: "comercial" | "sdr") => {
    setCurrentPipeline(pipeline);
    setSellerFilter("Todos");
    setCompanyFilter("Todos");
    setCityFilter("Todos");
    setClientFilter("Todos");
    setSearchQuery("");
  };

  // "Todos" (ver todos os funis do pipeline atual combinados) — sentinela, não
  // um id de funil de verdade. Só faz sentido oferecer quando o tenant tem
  // MAIS de um funil do mesmo tipo (pedido real: tenant com 7 funis comerciais
  // migrados do Kommo, sem forma nenhuma de ver tudo junto).
  const isAllFunisSelected = selectedFunilId === "__todos__";

  const activeFunil = useMemo(() => {
    if (isAllFunisSelected) return null;
    const pool = currentPipeline === "sdr" ? sdrFunis : comercialFunis;
    return pool.find((f) => f.id === selectedFunilId) ?? pool[0] ?? null;
  }, [currentPipeline, selectedFunilId, sdrFunis, comercialFunis, isAllFunisSelected]);

  const buildStagesForFunil = (funil: any) => {
    const configs: any[] = funil.etapasConfig ??
      funil.etapas.map((nome: string, i: number) => ({
        nome,
        cor: ["cyan","indigo","purple","amber","emerald","pink","rose","blue","orange","slate"][i % 10],
        iniciarMinimizado: false,
      }));
    return configs.map((s: any, idx: number) => ({
      id: getStageId(funil.id, idx),
      name: s.nome,
      color: ETAPA_DOT_COLORS[s.cor] ?? "#64748b",
      iniciarMinimizado: s.iniciarMinimizado ?? false,
      funilId: funil.id,
    }));
  };

  // Build stages from the active funil's etapasConfig — em modo "Todos",
  // concatena as etapas de TODOS os funis do pipeline atual (cada stageId já
  // é único por funil via getStageId, então colunas de funis diferentes nunca
  // se confundem, mesmo com nomes de etapa repetidos entre eles).
  const activePipelineStages = useMemo(() => {
    if (isAllFunisSelected) {
      const pool = currentPipeline === "sdr" ? sdrFunis : comercialFunis;
      return pool.flatMap((f: any) => buildStagesForFunil(f));
    }
    if (!activeFunil) return [];
    return buildStagesForFunil(activeFunil);
  }, [activeFunil, isAllFunisSelected, currentPipeline, sdrFunis, comercialFunis]);

  // Anti-regressão: só restringe `filteredItemsList` por etapa quando existe
  // MAIS de 1 funil do mesmo tipo (ou "Todos" foi trocado por um específico) —
  // pra tenant com um funil só (a esmagadora maioria), nunca muda nada, mesmo
  // que algum lead tenha um stageId legado que não bate exatamente com as
  // etapas atuais do funil. Achado real: com múltiplos funis comerciais (ex.:
  // migração do Kommo, 7 funis pro mesmo tenant), escolher um funil específico
  // no seletor não filtrava NADA — Kanban por coluna funcionava (compara
  // stageId por etapa), mas o card "Total" e a visão de Lista usavam
  // `filteredItemsList` sem nenhum filtro de funil, sempre somando TODOS os
  // funis juntos independente do que estava selecionado.
  const activeFunilStageIds = useMemo(() => {
    if (isAllFunisSelected) return null;
    const pool = currentPipeline === "sdr" ? sdrFunis : comercialFunis;
    if (pool.length <= 1) return null;
    return new Set(activePipelineStages.map((s: any) => s.id));
  }, [currentPipeline, sdrFunis, comercialFunis, activePipelineStages, isAllFunisSelected]);

  // ─── Leads do pipeline atual (usado para montar os dropdowns de filtro) ──────
  // Filtra apenas por pipeline — sem seller/company/client — para que os
  // dropdowns mostrem só as opções relevantes ao pipeline que está sendo visto.
  // `leads` já vem escopado ao tenant/filial ativos via DataContext — não há mais
  // filtro de tenant aqui (era um combobox master-only quebrado, substituído pelo
  // seletor de cliente na sidebar).
  const pipelineLeads = useMemo(() => leads.filter((item: any) => {
    const matchesPipeline = currentPipeline === "sdr"
      ? item.pipelineId === "sdr"
      : !item.pipelineId || item.pipelineId === "comercial";
    return matchesPipeline;
  }), [leads, currentPipeline]);

  // Mapa clientName → clientId para filtrar leads que têm clientId mas não clientName
  const clientNameToId = useMemo(() => {
    const map: Record<string, string> = {};
    (clienteBase as any[])?.forEach((c: any) => {
      const name = c.name || c.nome;
      if (name && c.id) map[name] = c.id;
    });
    return map;
  }, [clienteBase]);

  // ─── Lists for dropdowns ──────────────────────────────────────────────────────
  // Dropdowns mostram apenas vendedores/empresas do pipeline atual
  const sellers      = useMemo(() => ["Todos", ...Array.from(new Set(pipelineLeads.map((l: any) => l.seller).filter(Boolean)))], [pipelineLeads]);
  const companiesList = useMemo(() => [
    "Todos",
    ...Array.from(new Set(pipelineLeads.map((l: any) => l.company).filter(Boolean))).sort() as string[],
  ], [pipelineLeads]);
  // Cidade real do lead (customFields.cidade, preenchida pelo autocomplete de
  // município na qualificação — ver CompanyBlock.tsx/NewLeadModal.tsx) — só
  // lista cidade que algum lead do pipeline atual realmente tem, nunca a
  // lista inteira de municípios do Brasil.
  const citiesList = useMemo(() => [
    "Todos",
    ...Array.from(new Set(pipelineLeads.map((l: any) => l.customFields?.cidade).filter(Boolean))).sort() as string[],
  ], [pipelineLeads]);

  // ─── Filtered leads ───────────────────────────────────────────────────────────
  const filteredItemsList = useMemo(() => leads
    .filter((item: any) => {
      const matchesPipeline = currentPipeline === "sdr"
        ? item.pipelineId === "sdr"
        : !item.pipelineId || item.pipelineId === "comercial";
      const matchesSeller  = sellerFilter  === "Todos" || item.seller  === sellerFilter;
      const matchesCompany = companyFilter === "Todos" || item.company === companyFilter;
      const matchesCity    = cityFilter    === "Todos" || item.customFields?.cidade === cityFilter;
      const clientId = clientNameToId[clientFilter];
      // Match by lead's own clientName/clientId OR via any linked product's client
      const matchesClient  = clientFilter  === "Todos"
        || item.clientName === clientFilter
        || (clientId && item.clientId === clientId)
        || (products as any[]).some((p: any) =>
            Array.isArray(item.productIds) && item.productIds.includes(p.id) &&
            (p.clientName === clientFilter || (clientId && p.clientId === clientId))
          );
      const q = searchQuery.toLowerCase();
      const matchesSearch  =
        (item.name     ?? "").toLowerCase().includes(q) ||
        (item.company  ?? "").toLowerCase().includes(q) ||
        (item.title    ?? "").toLowerCase().includes(q) ||
        (item.nicho    ?? "").toLowerCase().includes(q) ||
        (item.segmento ?? "").toLowerCase().includes(q) ||
        (item.vertical ?? "").toLowerCase().includes(q) ||
        (item.origem   ?? "").toLowerCase().includes(q) ||
        (item.email    ?? "").toLowerCase().includes(q);
      // `date` é a mesma data de cadastro usada no filtro do Dashboard —
      // string 'YYYY-MM-DD', comparável diretamente.
      const matchesDate =
        (!dateFrom || (item.date && item.date >= dateFrom)) &&
        (!dateTo || (item.date && item.date <= dateTo));
      const matchesFunil = !activeFunilStageIds || activeFunilStageIds.has(item.stageId);
      return matchesPipeline && matchesFunil && matchesSeller && matchesCompany && matchesCity && matchesClient && matchesSearch && matchesDate;
    })
    // Card sempre no topo de quem teve a atividade mais recente — tanto um lead recém-criado
    // quanto um já existente que só mudou de etapa/status/campo (updated_at é atualizado a cada
    // UPDATE por um trigger no banco, ver migration de leads). Prioriza updated_at sobre
    // created_at porque updated_at nunca é mais antigo (parte igual a created_at na criação e só
    // sobe a partir daí) — assim uma edição recente sobe o card mesmo sem mudar de coluna.
    // Lead recém-adicionado otimisticamente (ainda sem timestamp do banco) vai para o topo — é
    // mais provável ser o mais novo do que o mais antigo.
    .sort((a: any, b: any) => {
      const key = (l: any): string => l.updated_at ?? l.updatedAt ?? l.created_at ?? l.createdAt ?? "";
      const da = key(a);
      const db = key(b);
      if (!da && !db) return 0;
      if (!da) return -1;
      if (!db) return 1;
      return db > da ? 1 : db < da ? -1 : 0;
    }),
  [leads, currentPipeline, activeFunilStageIds, sellerFilter, searchQuery, companyFilter, cityFilter, clientFilter, clientNameToId, products, dateFrom, dateTo]);

  // ─── Metrics ─────────────────────────────────────────────────────────────────
  const analyticsData = useMemo(() =>
    activePipelineStages.map((s) => ({
      name: s.name,
      value: filteredItemsList.filter((l: any) => l.stageId === s.id).length,
      color: s.color,
    })),
    [activePipelineStages, filteredItemsList]
  );

  const hotLeadsCount = filteredItemsList.filter((l: any) =>
    (l.temperature === 'quente' || (l.scoreIA ?? 0) >= 80) && l.status !== 'Fechado' && l.status !== 'Perdido'
  ).length;

  // "Total de Ganhos" — soma só dos leads Fechados (mesmo filtro do card
  // "Ganhos" ao lado, que conta a quantidade). Antes somava TODO o pipeline
  // (aberto + ganho + perdido) sob o rótulo genérico "Valor Total", o que não
  // batia com o conceito de "ganhos" e inflava o número com negócios ainda
  // não fechados.
  //
  // BUG real (achado em produção 2026-09-21): quando o lead tinha productIds,
  // a soma preferia o preço ATUAL do catálogo desses produtos em vez de
  // item.value — ignorava quantidade, desconto negociado e qualquer diferença
  // entre o preço de catálogo hoje e o valor realmente fechado na venda (ex.:
  // 3 leads fechados por R$3.988/R$11.964/R$1.000 = R$16.952 reais, mas a
  // soma por catálogo dava R$3.991, porque cada um linka o mesmo produto de
  // R$997 sem multiplicar pela quantidade real vendida). item.value já é a
  // fonte de verdade (sincronizada com a proposta aceita, ver
  // syncAcceptedProposal em DataContext.tsx) — usa direto, sem esse fallback.
  const totalValueSum = filteredItemsList
    .filter((item: any) => item.status === 'Fechado')
    .reduce((sum, item) => sum + parseCurrencyBR(item.value ?? (item as any).valor), 0);

  const formattedTotalValue = formatCurrency(totalValueSum);

  const totalLeadsCount = filteredItemsList.length;
  const lastStageId = activePipelineStages.length > 0
    ? activePipelineStages[activePipelineStages.length - 1].id
    : null;

  const firstComercialStageId = useMemo(() => {
    const f = comercialFunis[0];
    if (!f) return "1";
    return getStageId(f.id, 0);
  }, [comercialFunis]);

  const firstSdrStageId = useMemo(() => {
    const f = sdrFunis[0];
    if (!f) return "sdr-1";
    return getStageId(f.id, 0);
  }, [sdrFunis]);
  const closedWonCount  = filteredItemsList.filter(
    (l: any) => (lastStageId && l.stageId === lastStageId) || l.status === "Fechado"
  ).length;
  const winRate = totalLeadsCount > 0 ? Math.round((closedWonCount / totalLeadsCount) * 100) : 0;

  // ─── Actions ─────────────────────────────────────────────────────────────────
  const triggerCelebration = () => {
    confetti({
      particleCount: 150, spread: 70, origin: { y: 0.6 },
      colors: ["#10B981", "#34D399", "#60A5FA"],
    });
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Relatório de Pipeline — ${activeFunil?.nome ?? currentPipeline}`, 14, 22);
    doc.setFontSize(10);
    doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, 14, 30);

    const tableData: string[][] = filteredItemsList.map((l: any) => [
      String(l.name ?? ""),
      String(l.company ?? ""),
      String(activePipelineStages.find((s) => s.id === l.stageId)?.name ?? "Sem Fase"),
      String(l.value ?? ""),
      String(l.seller ?? ""),
    ]);

    autoTable(doc, {
      startY: 40,
      head: [["Nome", "Empresa", "Fase", "Valor", "Responsável"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: "#1E293B", textColor: "#FFFFFF" },
    });

    doc.save(`pipeline_${currentPipeline}_${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success("PDF exportado com sucesso!");
  };

  const handleExportIAResume = (e: any, lead: any) => {
    e.stopPropagation();
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(37, 99, 235);
    doc.text(`Resumo de IA - ${lead.name}`, 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Empresa: ${lead.company} | Gerado em: ${new Date().toLocaleDateString()}`, 14, 28);

    doc.setDrawColor(226, 232, 240);
    doc.line(14, 32, 196, 32);

    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text("Resumo de Qualificação:", 14, 42);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const splitSummary = doc.splitTextToSize(
      lead.iaSummary || "Nenhuma análise de IA disponível para este lead.", 170
    );
    doc.text(splitSummary, 14, 50);

    let nextY = 50 + splitSummary.length * 6 + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Últimas 5 Atividades do CRM:", 14, nextY);
    nextY += 8;

    const leadTasks = tasks
      .filter((t: any) => t.lead_id === lead.id)
      .slice(0, 5);

    if (leadTasks.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("Nenhuma atividade recente encontrada.", 14, nextY);
    } else {
      autoTable(doc, {
        startY: nextY,
        head: [["Data", "Atividade", "Status"]],
        body: leadTasks.map((t: any) => [
          t.due_date ? new Date(t.due_date).toLocaleDateString('pt-BR') : "Recente",
          String(t.title ?? ""),
          String(t.status ?? ""),
        ]),
        theme: "grid",
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 9 },
      });
    }

    doc.save(`Resumo_IA_${lead.name.replace(/\s+/g, "_")}.pdf`);
    setOpenDropdownId(null);
  };

  // Promoção automática pra outro funil quando um negócio é ganho — genérico
  // (não amarrado a nenhum tenant/funil específico no código): um tenant
  // configura em app_settings (key "axis_win_funil_config", valor
  // { [funilIdDeOrigem]: funilIdDeDestino }) qual funil recebe automaticamente
  // os negócios ganhos de qual funil comercial. Sem config pra aquele funil,
  // não faz nada (comportamento de hoje, intacto).
  const WIN_FUNIL_CONFIG_KEY = "axis_win_funil_config";
  const handleWinStageDrop = (leadId: string, stage: any) => {
    const config = appSettings[WIN_FUNIL_CONFIG_KEY] as Record<string, string> | undefined;
    const targetFunilId = stage?.funilId ? config?.[stage.funilId] : undefined;
    if (!targetFunilId) return;
    const targetFunil = funisConfig.find((f: any) => f.id === targetFunilId);
    if (!targetFunil) return;
    const targetStageId = getStageId(targetFunilId, 0);
    updateLead(leadId, { stageId: targetStageId });
    toast.success(`Negócio ganho! Movido automaticamente para "${targetFunil.nome}".`);

    // Conecta com a página de Implementações (/app/crm/implementacoes): em vez
    // de esperar alguém clicar "Iniciar implementação" manualmente lá, já cria
    // a implementação de verdade no mesmo instante — mesma lógica daquele
    // botão (ver startImplementationForClient), só que disparada automática.
    // Só roda quando o lead já tem um cliente vinculado (clientId) — sem isso,
    // o cliente simplesmente aparece em "Aguardando início" como hoje.
    const lead = (leads as any[]).find((l: any) => l.id === leadId);
    const cliente = lead?.clientId ? (clienteBase as any[]).find((c: any) => c.id === lead.clientId) : null;
    if (cliente) {
      startImplementationForClient(cliente, lead, { supabase, addImplementation, updateClienteBase })
        .then((result) => {
          if (result && !result.alreadyExisted) {
            toast.success(`Implementação iniciada automaticamente para "${cliente.name}".`);
          }
        })
        .catch((err) => console.error("[Pipeline] Falha ao auto-iniciar implementação:", err));
    }
  };

  const handleTransferToComercial = (e: any, lead: any) => {
    e.stopPropagation();
    const targetStageId = firstComercialStageId || "1";
    updateLead(lead.id, { pipelineId: "comercial", stageId: targetStageId });
    // `responsible` não tem coluna própria em `tasks` — resolve o closer atual
    // (nome em `lead.seller`) pro colaborador correspondente. `assigned_to` FK
    // pra `users.id`, então usa `user_id` do colaborador — não `colaborador.id`
    // (que é texto e nem sequer é uuid).
    const assignedTo = (colaboradores as any[]).find(
      (c: any) => c.nome === lead.seller
    )?.user_id as string | undefined;
    addTask({
      title: "Bem-vindo ao Comercial",
      description: `Apresentação recebida do SDR. Lead: ${lead.name}`,
      status: "A Fazer",
      lead_id: lead.id,
      assigned_to: assignedTo,
    });
    toast.success("Transferência Inteligente: Lead movido para o Comercial e tarefa criada!");
    setOpenDropdownId(null);
    // Switch to comercial view so the user sees the lead immediately
    setCurrentPipeline("comercial");
    if (comercialFunis[0]) setSelectedFunilId(comercialFunis[0].id);
  };

  return {
    isModalOpen, setIsModalOpen,
    selectedLead, setSelectedLead,
    sellerFilter, setSellerFilter,
    companyFilter, setCompanyFilter,
    cityFilter, setCityFilter, citiesList,
    searchQuery, setSearchQuery,
    showAnalytics, setShowAnalytics,
    openDropdownId, setOpenDropdownId,
    tempDropdownId, setTempDropdownId,
    webhookModalLead, setWebhookModalLead,
    webhookUrl, setWebhookUrl,
    leads, updateLead, tasks, addTask,
    clientFilter, setClientFilter, clientsList,
    dateFrom, setDateFrom, dateTo, setDateTo,
    currentPipeline, setCurrentPipeline, switchPipeline,
    selectedFunilId, setSelectedFunilId,
    activeFunil,
    comercialFunis, sdrFunis,
    isSdrEnabled,
    firstComercialStageId,
    firstSdrStageId,
    draggedLeadId, setDraggedLeadId,
    draggedOverStageId, setDraggedOverStageId,
    draggedColumnId, setDraggedColumnId,
    companiesList,
    activePipelineStages,
    sellers,
    allSellersFullList: sellers.filter((s) => s !== "Todos"),
    filteredItemsList,
    analyticsData,
    hotLeadsCount,
    formattedTotalValue,
    winRate,
    triggerCelebration,
    exportPDF,
    handleExportIAResume,
    handleWinStageDrop,
    handleTransferToComercial,
  };
}
