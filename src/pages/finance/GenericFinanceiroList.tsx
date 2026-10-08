import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import {
  Download, Calendar, CheckCircle2,
  Clock, AlertTriangle, Plus, Trash2, DollarSign, Pencil, Lock, Repeat, Layers, User, Landmark, HelpCircle,
  TrendingUp, TrendingDown, BarChart3, HourglassIcon, Copy, ArrowUpRight, ArrowDownRight, Tag, Search, X, ArrowUpDown, LayoutGrid, List as ListIcon, FileText, AlignLeft, FolderOpen, CreditCard, ArrowLeftRight, Save, Paperclip, Info, Activity, Eye,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { Switch } from "../../components/ui/switch";
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid, AreaChart, Area, Legend } from "recharts";
import { useData } from "../../contexts/DataContext";
import { toast } from "sonner";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { downloadCsv } from "../../lib/csvExport";
import { useLocalization } from "../../contexts/LocalizationContext";
import { RateioModal, type RateioDivisao } from "./components/RateioModal";
import { FinanceiroAnexosTab } from "./components/FinanceiroAnexosTab";
import { ViewModal, type ViewSection } from "./components/ViewModal";
import { parseEntryDate } from "./lib/financeDates";
import { useFinanceEntriesList } from "./useFinanceEntriesList";
import { Pagination } from "../../components/ui/Pagination";
import { type Frequencia, addPeriodo, splitInstallments } from "../../lib/saleCalculator";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { DateRangeFilter } from "../../components/ui/DateRangeFilter";
import { FinanceKpiGrid } from "./components/FinanceKpiGrid";
import { isInMonth, pctDelta, getMonthlyRealizedSeries } from "./lib/financeEngine";
import { DrillDownPanel } from "../../components/ui/DrillDownPanel";
import { financeEntryDrillColumns } from "../../components/ui/drillColumns";

type RepeatMode = "none" | "recorrente" | "parcelado";

const PAYMENT_METHODS = ["Pix", "Boleto", "Cartão de Crédito", "Cartão de Débito", "Transferência/TED", "Dinheiro", "Cheque", "Outro"];

const parseTags = (raw: string): string[] => raw.split(",").map(t => t.trim()).filter(Boolean);

interface GenericProps {
  title: string;
  desc: string;
  type: 'Pagar' | 'Receber';
  /** Quando definido, a lista só mostra lançamentos nesse status — usado
   * para separar Receitas/Despesas (só o que já foi realizado) de Contas a
   * Receber/Pagar (pipeline completo, qualquer status). Sem isso as duas
   * telas mostravam exatamente os mesmos dados. */
  statusFilter?: 'Pago';
  /** Status inicial de um lançamento único criado por aqui (parcelas e
   * recorrências futuras continuam sempre "A Vencer", nunca já realizadas). */
  defaultStatus?: 'Pago' | 'A Vencer';
}

export default function GenericFinanceiroList({ title, desc, type, statusFilter, defaultStatus }: GenericProps) {
  const { financeEntries, addFinanceEntry, deleteFinanceEntry, updateFinanceEntry, financeCategories, addFinanceCategory, financeBankAccounts, financeCentrosCusto, clienteBase, financeAttachments } = useData();
  const { formatCurrency } = useLocalization();
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Período global da tela (seletor "Período: Tudo" do cabeçalho): filtra a tabela (servidor), os cards e o gráfico.
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");

  // Categoria é vinculada de verdade (category_id → finance_categories), não
  // mais texto livre — sem isso o DRE não sabe em qual linha somar o
  // lançamento. Filtra pelo tipo do lançamento (receita só oferece
  // categorias de Receita).
  const categoriasDoTipo = useMemo(
    () => (financeCategories as any[]).filter(c => c.tipo === (type === "Receber" ? "Receita" : "Despesa")),
    [financeCategories, type]
  );
  const contasAtivas = useMemo(() => (financeBankAccounts as any[]).filter(c => !c.arquivada), [financeBankAccounts]);
  const contaPrincipalId = useMemo(() => contasAtivas.find(c => c.is_principal)?.id || "", [contasAtivas]);

  // Sugestão de contatos já cadastrados (Clientes pra receita, Fornecedores
  // pra despesa) via <datalist> — mantém o campo livre (nem todo lançamento
  // precisa de ficha completa) mas liga contato_id quando o nome bate exato.
  const tipoContato = type === "Receber" ? "CLIENTE" : "FORNECEDOR";
  const contatosSugeridos = useMemo(
    () => (clienteBase as any[]).filter(c => c.tipos?.includes(tipoContato)),
    [clienteBase, tipoContato]
  );
  const resolverContatoId = (nome: string): string | null => contatosSugeridos.find(c => c.name?.toLowerCase() === nome.trim().toLowerCase())?.id || null;

  // KPIs/gráfico do topo — sempre sobre o panorama GERAL deste tipo+status
  // (não sobre os filtros da tabela abaixo, que são pra achar um lançamento
  // específico). Pago/Receitas usa regime de caixa (só o realizado);
  // Receber/Pagar mostra o pipeline completo por status.
  const periodoAtivo = !!(filtroDataInicio || filtroDataFim);
  const { rangeFrom, rangeTo } = useMemo(() => ({
    rangeFrom: filtroDataInicio ? new Date(filtroDataInicio + "T00:00:00") : null,
    rangeTo: filtroDataFim ? new Date(filtroDataFim + "T23:59:59") : null,
  }), [filtroDataInicio, filtroDataFim]);
  const inRange = (e: any, from: Date | null, to: Date | null) => {
    if (!from && !to) return true;
    const d = parseEntryDate(e.date);
    if (!d) return false;
    return (!from || d >= from) && (!to || d <= to);
  };
  // Janela anterior de mesma duração (só existe com início e fim definidos).
  const prevRange = useMemo(() => {
    if (!rangeFrom || !rangeTo) return null;
    const dias = Math.round((rangeTo.getTime() - rangeFrom.getTime()) / 86400000) + 1;
    const from = new Date(rangeFrom); from.setDate(from.getDate() - dias);
    const to = new Date(rangeFrom); to.setDate(to.getDate() - 1); to.setHours(23, 59, 59);
    return { from, to };
  }, [rangeFrom, rangeTo]);

  // Meses exibidos no gráfico e nas minis dos cards: o período escolhido (até 24 meses) ou, em "Tudo", os últimos 6.
  const mesesDoGrafico = useMemo(() => {
    const now = new Date();
    let start: Date, end: Date;
    if (rangeFrom || rangeTo) {
      end = rangeTo ?? now;
      start = rangeFrom ?? new Date(end.getFullYear(), end.getMonth() - 5, 1);
    } else {
      end = now;
      start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    }
    const out: { y: number; m: number }[] = [];
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end && out.length < 24) {
      out.push({ y: cursor.getFullYear(), m: cursor.getMonth() });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return out.length >= 2 ? out : [{ y: start.getFullYear(), m: start.getMonth() - 1 }, ...out].map((x) => { const d = new Date(x.y, x.m, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  }, [rangeFrom, rangeTo]);

  // KPIs/gráfico do topo — seguem o período escolhido no cabeçalho (sem período = visão geral).
  // Pago/Receitas usa regime de caixa (só o realizado); Receber/Pagar mostra o pipeline completo por status.
  const kpis = useMemo(() => {
    const entriesDoTipo = (financeEntries as any[]).filter((e: any) => e.type === type);
    if (statusFilter === "Pago") {
      const now = new Date();
      const y = now.getFullYear(), m = now.getMonth();
      const prevRef = new Date(y, m - 1, 1);
      const py = prevRef.getFullYear(), pm = prevRef.getMonth();
      const pagos = entriesDoTipo.filter((e: any) => e.status === "Pago");
      const soma = (rows: any[]) => rows.reduce((acc: number, e: any) => acc + e.value, 0);
      let rowsMesAtual: any[], totalMes: number, totalMesAnterior: number;
      if (periodoAtivo) {
        rowsMesAtual = pagos.filter((e: any) => inRange(e, rangeFrom, rangeTo));
        totalMes = soma(rowsMesAtual);
        totalMesAnterior = prevRange ? soma(pagos.filter((e: any) => inRange(e, prevRange.from, prevRange.to))) : 0;
      } else {
        rowsMesAtual = pagos.filter((e: any) => isInMonth(e.date, y, m));
        totalMes = soma(rowsMesAtual);
        totalMesAnterior = soma(pagos.filter((e: any) => isInMonth(e.date, py, pm)));
      }
      const totalGeral = soma(pagos);
      return {
        kind: "realizado" as const,
        totalMes, totalMesAnterior, deltaPct: pctDelta(totalMes, totalMesAnterior), temComparacao: !periodoAtivo || !!prevRange,
        totalGeral, ticketMedio: rowsMesAtual.length > 0 ? totalMes / rowsMesAtual.length : (pagos.length > 0 ? totalGeral / pagos.length : 0),
        count: pagos.length, countPeriodo: rowsMesAtual.length,
        rowsMesAtual, rowsGeral: pagos,
      };
    }
    const base = periodoAtivo ? entriesDoTipo.filter((e: any) => inRange(e, rangeFrom, rangeTo)) : entriesDoTipo;
    const prevBase = prevRange ? entriesDoTipo.filter((e: any) => inRange(e, prevRange.from, prevRange.to)) : null;
    const filterStatus = (status: string) => base.filter((e: any) => e.status === status);
    const sumStatus = (status: string) => filterStatus(status).reduce((acc: number, e: any) => acc + e.value, 0);
    const prevSum = (status: string) => (prevBase ? prevBase.filter((e: any) => e.status === status).reduce((acc: number, e: any) => acc + e.value, 0) : null);
    const countStatus = (status: string) => filterStatus(status).length;
    return {
      kind: "pipeline" as const,
      pago: sumStatus("Pago"), aVencer: sumStatus("A Vencer"), atrasado: sumStatus("Atrasado"), pendente: sumStatus("Pendente"),
      prevPago: prevSum("Pago"), prevAVencer: prevSum("A Vencer"), prevAtrasado: prevSum("Atrasado"), prevPendente: prevSum("Pendente"),
      countPago: countStatus("Pago"), countAVencer: countStatus("A Vencer"), countAtrasado: countStatus("Atrasado"), countPendente: countStatus("Pendente"),
      rowsPago: filterStatus("Pago"), rowsAVencer: filterStatus("A Vencer"), rowsAtrasado: filterStatus("Atrasado"), rowsPendente: filterStatus("Pendente"),
    };
  }, [financeEntries, type, statusFilter, periodoAtivo, rangeFrom, rangeTo, prevRange]);

  const contrapartesOpcoes = useMemo(
    () => Array.from(new Set((financeEntries as any[]).filter((e: any) => e.type === type).map((e: any) => e.counterparty).filter(Boolean))).sort((a: any, b: any) => String(a).localeCompare(String(b), "pt-BR")) as string[],
    [financeEntries, type]
  );
  const [drillKey, setDrillKey] = useState<string | null>(null);
  const drillColumns = financeEntryDrillColumns(formatCurrency);

  const STATUS_CHART_COLORS: Record<string, string> = { Pago: "var(--color-success)", "A Vencer": "var(--color-text-muted)", Atrasado: "var(--color-danger)", Pendente: "var(--color-warning)" };
  const statusBreakdown = useMemo(() => {
    if (kpis.kind !== "pipeline") return [];
    return [
      { status: "Pago", value: kpis.pago, fill: STATUS_CHART_COLORS.Pago },
      { status: "A Vencer", value: kpis.aVencer, fill: STATUS_CHART_COLORS["A Vencer"] },
      { status: "Atrasado", value: kpis.atrasado, fill: STATUS_CHART_COLORS.Atrasado },
      { status: "Pendente", value: kpis.pendente, fill: STATUS_CHART_COLORS.Pendente },
    ].filter(s => s.value > 0);
  }, [kpis]);

  const NOMES_MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const rotuloMes = (x: { y: number; m: number }) => (mesesDoGrafico.length > 12 || new Set(mesesDoGrafico.map((z) => z.y)).size > 1 ? `${NOMES_MES[x.m]}/${String(x.y).slice(2)}` : NOMES_MES[x.m]);
  const monthlySeries = useMemo(() => {
    if (statusFilter !== "Pago") return [];
    const pagos = (financeEntries as any[]).filter((e: any) => e.type === type && e.status === "Pago");
    return mesesDoGrafico.map((x) => ({ label: rotuloMes(x), value: pagos.filter((e: any) => isInMonth(e.date, x.y, x.m)).reduce((acc: number, e: any) => acc + e.value, 0) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [financeEntries, type, statusFilter, mesesDoGrafico]);
  // Contas a Pagar/Receber: valor por mês de vencimento e por status (status atual de cada título).
  const statusMonthly = useMemo(() => {
    if (statusFilter === "Pago") return [];
    const doTipo = (financeEntries as any[]).filter((e: any) => e.type === type);
    return mesesDoGrafico.map((x) => {
      const soma = (st: string) => doTipo.filter((e: any) => e.status === st && isInMonth(e.date, x.y, x.m)).reduce((acc: number, e: any) => acc + e.value, 0);
      return { label: rotuloMes(x), Pago: soma("Pago"), "A Vencer": soma("A Vencer"), Atrasado: soma("Atrasado"), Pendente: soma("Pendente") };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [financeEntries, type, statusFilter, mesesDoGrafico]);
  const periodoGraficoLabel = periodoAtivo ? "no período selecionado" : "nos últimos 6 meses";
  const [showNovaCategoria, setShowNovaCategoria] = useState(false);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState("");
  const [novaCategoriaSubtipo, setNovaCategoriaSubtipo] = useState<"DESPESA_FIXA" | "DESPESA_VARIAVEL" | "PESSOAS" | "IMPOSTOS">("DESPESA_VARIAVEL");

  const handleCriarCategoria = async (): Promise<string | null> => {
    const nome = novaCategoriaNome.trim();
    if (!nome) return null;
    const created = await addFinanceCategory({
      nome,
      tipo: type === "Receber" ? "Receita" : "Despesa",
      subtipo: type === "Receber" ? null : novaCategoriaSubtipo,
    });
    setShowNovaCategoria(false);
    setNovaCategoriaNome("");
    return created?.id ?? null;
  };

  // New entry form
  const [newDesc, setNewDesc] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newContaBancariaId, setNewContaBancariaId] = useState("");
  const [newCentroCustoId, setNewCentroCustoId] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newCounterparty, setNewCounterparty] = useState("");
  const [newPaymentMethod, setNewPaymentMethod] = useState("");
  // Lançamento de Notas Fiscais: número do documento fiscal do lançamento
  // (coluna `numero_documento` já existia no banco, usada só na importação
  // de extrato bancário — agora também editável no lançamento manual).
  const [newNumeroDocumento, setNewNumeroDocumento] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newRepeatMode, setNewRepeatMode] = useState<RepeatMode>("none");
  const [newFrequency, setNewFrequency] = useState<Frequencia>("mensal");
  const [newOcorrencias, setNewOcorrencias] = useState("12");
  const [newParcelas, setNewParcelas] = useState("2");

  // Edit entry form
  const [viewingItem, setViewingItem] = useState<any | null>(null);
  const [editingItem, setEditingItem] = useState<(typeof financeEntries)[number] | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editContaBancariaId, setEditContaBancariaId] = useState("");
  const [editCentroCustoId, setEditCentroCustoId] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editCounterparty, setEditCounterparty] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("");
  const [editNumeroDocumento, setEditNumeroDocumento] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStatus, setEditStatus] = useState<"Pago" | "A Vencer" | "Atrasado" | "Pendente">("A Vencer");
  const [editIsRecurring, setEditIsRecurring] = useState(false);
  const [editFrequency, setEditFrequency] = useState<Frequencia>("mensal");
  const [rateioOpen, setRateioOpen] = useState(false);
  const [editModalTab, setEditModalTab] = useState<"detalhes" | "arquivos">("detalhes");

  // Confirma o rateio: apaga o lançamento original e cria uma linha por
  // divisão, todas compartilhando division_group_id — mesma convenção já
  // usada pelo parcelamento (installment_group_id), nenhuma soma do sistema
  // precisa aprender a "pular" o pai porque ele deixa de existir.
  const handleConfirmRateio = async (divisoes: RateioDivisao[]) => {
    if (!editingItem) return;
    const groupId = crypto.randomUUID();
    const parentId = editingItem.id;
    await Promise.all(divisoes.map((d, i) => {
      const categoria = categoriasDoTipo.find(c => c.id === d.categoryId);
      return addFinanceEntry({
        description: d.description || "Sem descrição",
        category: categoria?.nome || "Geral",
        category_id: d.categoryId,
        counterparty: d.counterparty || null,
        value: parseFloat(d.valor) || 0,
        date: d.date ? new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR") : editingItem.date,
        status: d.pago ? "Pago" : "A Vencer",
        type,
        division_group_id: groupId,
      }, { silent: i > 0 });
    }));
    await deleteFinanceEntry(parentId);
    setEditingItem(null);
    toast.success(`Lançamento dividido em ${divisoes.length} linhas.`);
    setTimeout(refetchEntries, 300);
  };

  // Filtros do usuário — busca, categoria, contraparte, conta, centro de
  // custo, período e (quando a tela mostra todos os status) status. Sem
  // isso, Contas a Pagar/Receber viravam uma lista infinita sem jeito de
  // achar um lançamento específico.
  const [filtroBusca, setFiltroBusca] = useState("");
  const [filtroCategoriaId, setFiltroCategoriaId] = useState("");
  // `?status=A Vencer` (links do Painel Financeiro) já abre na aba certa.
  const [searchParams] = useSearchParams();
  const statusParam = searchParams.get("status") as "Pago" | "A Vencer" | "Atrasado" | "Pendente" | null;
  const [filtroStatus, setFiltroStatus] = useState<"" | "Pago" | "A Vencer" | "Atrasado" | "Pendente">(statusParam ?? "");
  useEffect(() => { setFiltroStatus(statusParam ?? ""); }, [statusParam, type]);
  const [filtroContaBancariaId, setFiltroContaBancariaId] = useState("");
  const [filtroCentroCustoId, setFiltroCentroCustoId] = useState("");
  const [pageSizeSel, setPageSizeSel] = useState(10);
  const [ordem, setOrdem] = useState<"data_desc" | "data_asc" | "valor_desc" | "valor_asc">("data_desc");
  const [filtroContraparte, setFiltroContraparte] = useState("");
  const [viewMode, setViewMode] = useState<"lista" | "grade">("lista");
  // Achado de UX 2026-09-21: os 7 filtros ficavam sempre visíveis antes de
  // qualquer dado — quem só quer ver "o que tenho a receber esse mês" caía
  // direto num formulário de 7 campos. Conta Bancária/Centro de Custo/período
  // agora ficam atrás de "Mais filtros".

  const temFiltrosAtivos = !!(filtroContraparte || filtroBusca || filtroCategoriaId || filtroStatus || filtroContaBancariaId || filtroCentroCustoId || filtroDataInicio || filtroDataFim);
  const limparFiltros = () => {
    setFiltroBusca(""); setFiltroCategoriaId(""); setFiltroStatus(""); setFiltroContraparte("");
    setFiltroContaBancariaId(""); setFiltroCentroCustoId(""); setFiltroDataInicio(""); setFiltroDataFim("");
  };

  // Busca/pagina direto no Supabase (50 por vez), ordenado/filtrado por
  // date_normalized (coluna gerada — ver
  // supabase/migrations/20260920_finance_entries_date_normalized.sql) em vez
  // de carregar todo o array `financeEntries` do DataContext e filtrar no
  // navegador. `filtroDataInicio`/`filtroDataFim` já vêm de <input
  // type="date"> em formato YYYY-MM-DD, comparável direto com date_normalized.
  const {
    entries: filteredData, total: filteredTotal, totalValue,
    page, setPage, totalPages, pageSize, loading: entriesLoading,
    refetch: refetchEntries, fetchAllForExport, statusCounts,
  } = useFinanceEntriesList({
    type, statusFilter,
    search: filtroBusca,
    categoriaId: filtroCategoriaId,
    status: filtroStatus,
    contaBancariaId: filtroContaBancariaId,
    centroCustoId: filtroCentroCustoId,
    dataInicio: filtroDataInicio,
    dataFim: filtroDataFim,
    pageSize: pageSizeSel,
    contraparte: filtroContraparte,
    ordem,
  });

  useEffect(() => { setSelecionados(new Set()); }, [filteredData]);

  const [formErrors, setFormErrors] = useState<{ desc?: string; value?: string; category?: string }>({});
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const resetAddForm = () => {
    setNewDesc("");
    setNewNotes("");
    setNewCategoryId("");
    setNewContaBancariaId(contaPrincipalId);
    setNewCentroCustoId("");
    setNewTags("");
    setNewCounterparty("");
    setNewPaymentMethod("");
    setNewNumeroDocumento("");
    setNewValue("");
    setNewDate("");
    setNewRepeatMode("none");
    setNewFrequency("mensal");
    setNewOcorrencias("12");
    setNewParcelas("2");
    setFormErrors({});
    setShowNovaCategoria(false);
    setNovaCategoriaNome("");
  };

  // Descrição, valor > 0 e categoria são obrigatórios — sem isso o
  // formulário salvava lançamentos vazios (sem descrição, categoria ou
  // valor) que só poluíam a base. Cada campo mostra seu próprio erro.
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const totalValor = parseFloat(newValue) || 0;
    let categoryId = newCategoryId;
    if (showNovaCategoria && novaCategoriaNome.trim()) {
      categoryId = (await handleCriarCategoria()) || "";
    }

    const errors: typeof formErrors = {};
    if (!newDesc.trim()) errors.desc = "Informe a descrição do lançamento.";
    if (totalValor <= 0) errors.value = "Informe um valor maior que zero.";
    if (!categoryId) errors.category = "Selecione ou crie uma categoria.";
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const categoriaSelecionada = categoriasDoTipo.find(c => c.id === categoryId);
    const baseDate = newDate ? new Date(newDate + "T12:00:00") : new Date();
    const baseFields = {
      description: newDesc,
      notes: newNotes || null,
      category: categoriaSelecionada?.nome || "Geral",
      category_id: categoryId,
      conta_bancaria_id: newContaBancariaId || null,
      centro_custo_id: newCentroCustoId || null,
      tags: parseTags(newTags),
      counterparty: newCounterparty || null,
      contato_id: newCounterparty ? resolverContatoId(newCounterparty) : null,
      payment_method: newPaymentMethod || null,
      numero_documento: newNumeroDocumento || null,
      status: "A Vencer" as const,
      type: type,
    };

    if (newRepeatMode === "recorrente") {
      // Recorrência gera N lançamentos já na criação (um por período), com o
      // MESMO valor em cada um — assim aparecem de verdade no fluxo de caixa
      // e nas contas a pagar/receber de cada mês, sem precisar cadastrar de
      // novo toda vez. Todas compartilham `recurring_group_id`.
      const ocorrencias = Math.max(1, parseInt(newOcorrencias, 10) || 1);
      const groupId = crypto.randomUUID();
      for (let i = 0; i < ocorrencias; i++) {
        const dataOcorrencia = i === 0 ? baseDate : addPeriodo(baseDate, newFrequency, i);
        addFinanceEntry({
          ...baseFields,
          value: totalValor,
          date: dataOcorrencia.toLocaleDateString("pt-BR"),
          is_recurring: true,
          recurring_frequency: newFrequency,
          recurring_group_id: groupId,
        }, { silent: i > 0 });
      }
      if (ocorrencias > 1) toast.success(`${ocorrencias} lançamentos recorrentes gerados.`);
    } else if (newRepeatMode === "parcelado") {
      // Parcelamento divide o VALOR TOTAL em N partes (diferente de
      // recorrente, que repete o mesmo valor) — cada parcela vence um
      // período depois da anterior.
      const numParcelas = Math.max(2, parseInt(newParcelas, 10) || 2);
      const valores = splitInstallments(totalValor, numParcelas);
      const groupId = crypto.randomUUID();
      valores.forEach((valorParcela, i) => {
        const dataParcela = i === 0 ? baseDate : addPeriodo(baseDate, newFrequency, i);
        addFinanceEntry({
          ...baseFields,
          value: valorParcela,
          date: dataParcela.toLocaleDateString("pt-BR"),
          installment_group_id: groupId,
          installment_number: i + 1,
          installment_total: numParcelas,
        }, { silent: i > 0 });
      });
      toast.success(`${numParcelas} parcelas geradas (${formatCurrency(valores[0])} cada, ajustado na última).`);
    } else {
      addFinanceEntry({
        ...baseFields,
        // Criado com a aba "Pago" ativa = lançamento já realizado; nas demais abas, a vencer.
        status: filtroStatus === "Pago" ? "Pago" : (defaultStatus ?? baseFields.status),
        value: totalValor,
        date: baseDate.toLocaleDateString("pt-BR"),
      });
    }

    setIsModalOpen(false);
    resetAddForm();
    setTimeout(refetchEntries, 300);
  };

  // Exportação precisa de TODOS os lançamentos que batem o filtro, não só a
  // página atual visível na tela — busca à parte, sem paginação.
  const handleExport = async () => {
    const allFiltered = selecionados.size > 0 ? filteredData.filter((r: any) => selecionados.has(r.id)) : await fetchAllForExport();
    downloadCsv(
      `${type === 'Pagar' ? 'contas_a_pagar' : 'contas_a_receber'}_${Date.now()}.csv`,
      ["Nome", "Categoria", "Cliente/Fornecedor", "Forma de Pagamento", "Vencimento", "Status", "Valor"],
      allFiltered.map((item: any) => [item.description, item.category, item.counterparty || "", item.payment_method || "", item.date, item.status, item.value])
    );
  };

  const handleDelete = async (item: (typeof financeEntries)[number]) => {
    if (!(await confirmDialog({
      title: "Excluir lançamento",
      description: `Excluir "${item.description}"? Essa ação não pode ser desfeita.`,
    }))) return;
    deleteFinanceEntry(item.id);
    toast.success("Lançamento excluído.");
    setTimeout(refetchEntries, 300);
  };

  // Duplicar: novo lançamento "A Vencer" com os mesmos dados (sem herdar parcelas/recorrência/rateio).
  const handleDuplicate = async (item: (typeof financeEntries)[number]) => {
    await addFinanceEntry({
      description: item.description,
      notes: item.notes || null,
      category: item.category,
      category_id: (item as any).category_id || null,
      conta_bancaria_id: (item as any).conta_bancaria_id || null,
      centro_custo_id: (item as any).centro_custo_id || null,
      tags: (item as any).tags || [],
      counterparty: item.counterparty || null,
      contato_id: (item as any).contato_id || null,
      payment_method: item.payment_method || null,
      value: item.value,
      date: item.date,
      status: "A Vencer",
      type,
    } as any);
    toast.success("Lançamento duplicado como \"A Vencer\".");
    setTimeout(refetchEntries, 300);
  };

  const openEdit = (item: (typeof financeEntries)[number]) => {
    setEditingItem(item);
    setEditModalTab("detalhes");
    setEditDesc(item.description);
    setEditNotes(item.notes || "");
    setEditCategoryId((item as any).category_id || "");
    setEditContaBancariaId((item as any).conta_bancaria_id || "");
    setEditCentroCustoId((item as any).centro_custo_id || "");
    setEditTags(Array.isArray((item as any).tags) ? (item as any).tags.join(", ") : "");
    setEditCounterparty(item.counterparty || "");
    setEditPaymentMethod(item.payment_method || "");
    setEditNumeroDocumento((item as any).numero_documento || "");
    setEditValue(String(item.value));
    setEditDate(item.date);
    setEditStatus((item.status as "Pago" | "A Vencer" | "Atrasado" | "Pendente") || "A Vencer");
    setEditIsRecurring(!!item.is_recurring);
    setEditFrequency((item.recurring_frequency as Frequencia) || "mensal");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const statusChanged = editStatus !== editingItem.status;
    if (statusChanged && !(await confirmDialog({
      title: "Alterar status do lançamento",
      description: `Confirmar alteração de status de "${editingItem.description}" para "${editStatus}"?`,
      confirmText: "Confirmar",
    }))) {
      return;
    }

    const categoriaSelecionada = categoriasDoTipo.find(c => c.id === editCategoryId);
    updateFinanceEntry(editingItem.id, {
      // Nenhum campo é obrigatório na edição: nome vazio vira "Sem descrição", valor vazio vira 0, categoria pode ficar em branco.
      description: editDesc.trim() || "Sem descrição",
      notes: editNotes || null,
      category: categoriaSelecionada?.nome || "Sem categoria",
      category_id: editCategoryId || null,
      conta_bancaria_id: editContaBancariaId || null,
      centro_custo_id: editCentroCustoId || null,
      tags: parseTags(editTags),
      counterparty: editCounterparty || null,
      contato_id: editCounterparty ? resolverContatoId(editCounterparty) : null,
      payment_method: editPaymentMethod || null,
      numero_documento: editNumeroDocumento || null,
      value: parseFloat(editValue) || 0,
      date: editDate.trim() || editingItem.date,
      status: editStatus,
      is_recurring: editIsRecurring,
      recurring_frequency: editIsRecurring ? editFrequency : null,
    });
    toast.success("Lançamento atualizado.");
    setEditingItem(null);
    setTimeout(refetchEntries, 300);
  };

  // Visão "Por categoria / Por cliente": soma o realizado do histórico por agrupador.
  const agruparPor = (rows: any[], campo: "category" | "counterparty") => {
    const mapa = new Map<string, { id: string; nome: string; count: number; total: number }>();
    for (const r of rows) {
      const nome = (r[campo] as string) || (campo === "category" ? "Sem categoria" : "Sem identificação");
      const cur = mapa.get(nome) || { id: nome, nome, count: 0, total: 0 };
      cur.count++; cur.total += Number(r.value) || 0;
      mapa.set(nome, cur);
    }
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
  };
  const agrupadoColumns = [
    { header: "Nome", render: (r: any) => <span className="font-bold text-[var(--color-text-primary)]">{r.nome}</span> },
    { header: "Lançamentos", render: (r: any) => r.count, className: "text-right" },
    { header: "Total", render: (r: any) => <span className="font-mono">{formatCurrency(r.total)}</span>, className: "text-right" },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Pago': return <CheckCircle2 className="w-3 h-3 mr-1" />;
      case 'A Vencer': return <Clock className="w-3 h-3 mr-1" />;
      // "Pendente" — pagamento retornado como em processamento por um gateway
      // (ex.: Mercado Pago "in_process"), nem aprovado nem rejeitado ainda.
      case 'Pendente': return <HelpCircle className="w-3 h-3 mr-1" />;
      default: return <AlertTriangle className="w-3 h-3 mr-1" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pago': return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-transparent";
      case 'A Vencer': return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-transparent";
      case 'Atrasado': return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-transparent";
      case 'Pendente': return "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-transparent";
      default: return "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border-transparent";
    }
  };

  // Cards: valor do período (ou visão geral) + variação contra o período anterior de mesma duração
  // (sem período: mês corrente x mês anterior) e mini gráfico mensal.
  const serieStatus = (status: string): number[] => {
    const doTipo = (financeEntries as any[]).filter((e: any) => e.type === type && e.status === status);
    return mesesDoGrafico.map(({ y, m }) => doTipo.filter((e: any) => isInMonth(e.date, y, m)).reduce((acc: number, e: any) => acc + e.value, 0));
  };
  const deltaSerie = (serie: number[]) => (serie.length >= 2 && serie[serie.length - 2] > 0 ? ((serie[serie.length - 1] - serie[serie.length - 2]) / serie[serie.length - 2]) * 100 : null);

  type KpiCard = { label: string; value: string; hint?: string; icon: typeof CheckCircle2; delta: number | null; goodUp: boolean | null; series: number[]; drill?: string; danger?: boolean; hideDelta?: boolean };
  const kpiCards: KpiCard[] = kpis.kind === "pipeline"
    ? (() => {
        const sPago = serieStatus("Pago"), sAV = serieStatus("A Vencer"), sAt = serieStatus("Atrasado"), sPe = serieStatus("Pendente");
        const d = (atual: number, ant: number | null, serie: number[]) => (periodoAtivo ? (ant !== null ? pctDelta(atual, ant) : null) : deltaSerie(serie));
        return [
          { label: type === "Receber" ? "Recebido no período" : "Pago no período", value: formatCurrency(kpis.pago), hint: `${kpis.countPago} lançamento(s)`, icon: CheckCircle2, delta: d(kpis.pago, kpis.prevPago, sPago), goodUp: true, series: sPago, drill: "pago" },
          { label: "A Vencer", value: formatCurrency(kpis.aVencer), hint: `${kpis.countAVencer} lançamento(s)`, icon: Clock, delta: d(kpis.aVencer, kpis.prevAVencer, sAV), goodUp: null, series: sAV, drill: "aVencer" },
          { label: "Atrasado", value: formatCurrency(kpis.atrasado), hint: `${kpis.countAtrasado} lançamento(s)`, icon: AlertTriangle, delta: d(kpis.atrasado, kpis.prevAtrasado, sAt), goodUp: false, series: sAt, drill: "atrasado", danger: kpis.atrasado > 0 },
          { label: "Pendente", value: formatCurrency(kpis.pendente), hint: `${kpis.countPendente} lançamento(s)`, icon: HourglassIcon, delta: d(kpis.pendente, kpis.prevPendente, sPe), goodUp: null, series: sPe, drill: "pendente" },
        ];
      })()
    : (() => {
        const serie = monthlySeries.map((x: any) => x.value);
        const rotulo = periodoAtivo ? "no período" : "no mês";
        return [
          { label: (type === "Pagar" ? "Gasto " : "Recebido ") + rotulo, value: formatCurrency(kpis.totalMes), icon: type === "Pagar" ? TrendingDown : TrendingUp, delta: kpis.temComparacao ? kpis.deltaPct : null, goodUp: type !== "Pagar", series: serie, drill: "mes", hint: `${kpis.countPeriodo} lançamento(s)` },
          { label: periodoAtivo ? "Vs. período anterior" : "Vs. mês anterior", value: `${kpis.totalMes - kpis.totalMesAnterior > 0 ? "+" : kpis.totalMes - kpis.totalMesAnterior < 0 ? "−" : ""}${formatCurrency(Math.abs(kpis.totalMes - kpis.totalMesAnterior))}`, hint: kpis.temComparacao ? `${periodoAtivo ? "Período" : "Mês"} anterior: ${formatCurrency(kpis.totalMesAnterior)}` : "Informe início e fim p/ comparar", icon: type === "Pagar" ? TrendingUp : TrendingDown, delta: kpis.temComparacao ? kpis.deltaPct : null, goodUp: type !== "Pagar", series: [], drill: "mes" },
          { label: "Ticket médio", value: formatCurrency(kpis.ticketMedio), hint: periodoAtivo ? `${kpis.countPeriodo} lançamento(s) no período` : `${kpis.count} lançamento(s) no histórico`, icon: DollarSign, delta: null, goodUp: null, series: [], hideDelta: true },
          { label: "Total geral (histórico)", value: formatCurrency(kpis.totalGeral), hint: `${kpis.count} lançamento(s)`, icon: Layers, delta: null, goodUp: null, series: [], drill: "geral", hideDelta: true },
        ];
      })();
  const ICON_COLORS = ["text-[var(--color-primary-blue)]", "text-emerald-500", "text-cyan-500", "text-rose-500"];
  const filtrosAtivosCount = [filtroContraparte, filtroBusca, filtroCategoriaId, filtroStatus, filtroContaBancariaId, filtroCentroCustoId, filtroDataInicio, filtroDataFim].filter(Boolean).length;

  const RepeatBadge = ({ item }: { item: (typeof financeEntries)[number] }) => {
    if (item.is_recurring) {
      return (
        <span title={`Recorrente (${item.recurring_frequency})`} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[8px] font-bold uppercase rounded-md bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border border-[var(--color-primary-blue)]/25">
          <Repeat className="w-2.5 h-2.5" /> {item.recurring_frequency}
        </span>
      );
    }
    if (item.installment_total && item.installment_total > 1) {
      return (
        <span title={`Parcela ${item.installment_number} de ${item.installment_total}`} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[8px] font-bold uppercase rounded-md bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border border-[var(--color-border-default)]">
          <Layers className="w-2.5 h-2.5" /> {item.installment_number}/{item.installment_total}
        </span>
      );
    }
    if ((item as any).division_group_id) {
      return (
        <span title="Parte de um lançamento detalhado (rateio)" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[8px] font-bold uppercase rounded-md bg-[var(--color-surface-sunken)] text-[var(--color-text-faint)] border border-[var(--color-border-subtle)]">
          <Layers className="w-2.5 h-2.5" /> Rateio
        </span>
      );
    }
    return null;
  };

  const openNewFromView = () => { setViewingItem(null); setNewContaBancariaId(contaPrincipalId); setIsModalOpen(true); };
  const viewSections = (it: any): ViewSection[] => {
    const conta = (financeBankAccounts as any[]).find(c => c.id === it.conta_bancaria_id)?.nome;
    const cc = (financeCentrosCusto as any[]).find(c => c.id === it.centro_custo_id)?.nome;
    const dt = parseEntryDate(it.date)?.toLocaleDateString("pt-BR") ?? it.date;
    const tags = Array.isArray(it.tags) && it.tags.length > 0 ? it.tags.join(", ") : null;
    const parcela = it.installment_total && it.installment_total > 1 ? `Parcela ${it.installment_number} de ${it.installment_total}` : null;
    const recorr = it.is_recurring ? `Recorrente (${it.recurring_frequency})` : null;
    const nAnexos = (financeAttachments as any[]).filter(a => a.transacao_id === it.id).length;
    return [
      { icon: FileText, title: "Lançamento", rows: [
        { label: "Descrição", value: it.description },
        { label: type === "Pagar" ? "Fornecedor" : "Cliente", value: it.counterparty || null },
        { label: "Categoria", value: it.category || null },
        { label: "Data", value: dt, mono: true },
        { label: "Status", value: it.status },
      ] },
      { icon: Landmark, title: "Pagamento", rows: [
        { label: "Forma de pagamento", value: it.payment_method || null },
        { label: "Conta", value: conta || null },
        { label: "Centro de custo", value: cc || null },
        { label: "Nº do documento", value: it.numero_documento || null, mono: true },
      ] },
      { icon: Repeat, title: "Repetição", rows: [
        { label: "Parcelamento", value: parcela },
        { label: "Recorrência", value: recorr },
        { label: "Rateio", value: it.division_group_id ? "Parte de um lançamento detalhado" : null },
      ] },
      { icon: Tag, title: "Outros", rows: [
        { label: "Tags", value: tags },
        { label: "Observações", value: it.notes || null },
        { label: "Anexos", value: nAnexos > 0 ? String(nAnexos) : null },
      ] },
    ];
  };

  const chartsJsx = (
    <>
{kpis.kind === "pipeline" ? (
        <>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[var(--color-primary-blue)]" /> {type === "Pagar" ? "Pagamentos" : "Recebimentos"} por Status
                </h3>
                <p className="text-[11px] text-[var(--color-text-faint)] mt-0.5 ml-6">Valores {type === "Pagar" ? "pagos e a pagar" : "recebidos e a receber"} {periodoGraficoLabel}.</p>
              </div>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={statusMonthly} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    {[["Pago", "#10b981"], ["A Vencer", "#f59e0b"], ["Atrasado", "#f43f5e"], ["Pendente", "#3b82f6"]].map(([k, c]) => (
                      <linearGradient key={k} id={`st-${type}-${k.replace(" ", "")}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={c} stopOpacity={0.02} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-control)" }} itemStyle={{ fontSize: "11px" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="Pago" stroke="#10b981" strokeWidth={2} fill={`url(#st-${type}-Pago)`} dot={{ r: 3 }} />
                  <Area type="monotone" dataKey="A Vencer" stroke="#f59e0b" strokeWidth={2} fill={`url(#st-${type}-AVencer)`} dot={{ r: 3 }} />
                  <Area type="monotone" dataKey="Atrasado" stroke="#f43f5e" strokeWidth={2} fill={`url(#st-${type}-Atrasado)`} dot={{ r: 3 }} />
                  <Area type="monotone" dataKey="Pendente" stroke="#3b82f6" strokeWidth={2} fill={`url(#st-${type}-Pendente)`} dot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      ) : (
        <>
          <Card className="p-4">
            <h3 className="text-xs font-bold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[var(--color-text-faint)]" /> {title} — {periodoAtivo ? "Período selecionado" : "Últimos 6 Meses"}
            </h3>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlySeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`grad-${type}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={type === "Pagar" ? "#f43f5e" : "#10b981"} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={type === "Pagar" ? "#f43f5e" : "#10b981"} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-control)" }} itemStyle={{ fontSize: "11px" }} />
                  <Area type="monotone" dataKey="value" name={type === "Pagar" ? "Pago" : "Recebido"} stroke={type === "Pagar" ? "#f43f5e" : "#10b981"} strokeWidth={2} fill={`url(#grad-${type})`} dot={{ r: 3, fill: type === "Pagar" ? "#f43f5e" : "#10b981" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </>
  );

  return (
    <PageContainer
      title={title}
      description={desc}
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: title }]}
      actions={
        <div className="flex items-center gap-2">
          <DateRangeFilter dateFrom={filtroDataInicio || null} setDateFrom={(v) => setFiltroDataInicio(v ?? "")} dateTo={filtroDataFim || null} setDateTo={(v) => setFiltroDataFim(v ?? "")} className="!h-9 !rounded-lg" />
          <Button
            variant="outline"
            onClick={handleExport}
            className="h-9 px-4 text-xs font-bold gap-1.5 border-[var(--color-border-default)]"
          >
            <Download className="w-3.5 h-3.5" /> Exportar{selecionados.size > 0 ? ` (${selecionados.size})` : ""}
          </Button>
          <Button
            onClick={() => { setNewContaBancariaId(contaPrincipalId); setIsModalOpen(true); }}
            className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Novo Lançamento
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
      <FinanceKpiGrid
        noDeltaLabel="Sem base p/ comparação"
        cards={kpiCards.map((k) => ({
          label: k.label, value: k.value, icon: k.icon, delta: k.delta, goodUp: k.goodUp, series: k.series, danger: k.danger, hideDelta: k.hideDelta,
          footer: k.hint ?? (k.delta !== null ? "vs. mês anterior" : ""),
          onClick: k.drill ? () => setDrillKey(k.drill!) : undefined,
        }))}
      />

      <Card className="p-2.5 rounded-xl">
        <div className="flex flex-col xl:flex-row xl:items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
            <input
              type="text"
              value={filtroBusca}
              onChange={(e) => setFiltroBusca(e.target.value)}
              placeholder="Buscar por nome, categoria ou cliente/fornecedor..."
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40"
            />
          </div>
          <select value={filtroCategoriaId} onChange={(e) => setFiltroCategoriaId(e.target.value)} className="h-9 px-3 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-xs font-bold text-[var(--color-text-primary)] focus:outline-none cursor-pointer max-w-[200px]">
            <option value="">Categoria: Todas</option>
            {categoriasDoTipo.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select value={filtroContaBancariaId} onChange={(e) => setFiltroContaBancariaId(e.target.value)} className="h-9 px-3 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-xs font-bold text-[var(--color-text-primary)] focus:outline-none cursor-pointer max-w-[180px]">
            <option value="">Conta: Todas</option>
            {contasAtivas.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select value={filtroCentroCustoId} onChange={(e) => setFiltroCentroCustoId(e.target.value)} className="h-9 px-3 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-xs font-bold text-[var(--color-text-primary)] focus:outline-none cursor-pointer max-w-[200px]">
            <option value="">Centro de custo: Todos</option>
            {(financeCentrosCusto as any[]).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select value={filtroContraparte} onChange={(e) => setFiltroContraparte(e.target.value)} className="h-9 px-3 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-xs font-bold text-[var(--color-text-primary)] focus:outline-none cursor-pointer max-w-[220px]">
            <option value="">Cliente / Fornecedor: Todos</option>
            {contrapartesOpcoes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {temFiltrosAtivos && (
            <button type="button" onClick={limparFiltros} className="flex items-center gap-1 px-2 h-9 text-xs font-bold text-[var(--color-text-muted)] hover:text-rose-500 bg-transparent border-none cursor-pointer whitespace-nowrap">
              <X className="w-3 h-3" /> Limpar ({filtrosAtivosCount})
            </button>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {statusFilter === "Pago" ? (
            [
              { key: "mes", label: type === "Pagar" ? "Gasto no mês" : "Recebido no mês" },
              { key: "geral", label: "Total geral" },
              { key: "categoria", label: "Por categoria" },
              { key: "contraparte", label: type === "Pagar" ? "Por fornecedor" : "Por cliente" },
            ].map((d) => (
              <button key={d.key} type="button" onClick={() => setDrillKey(d.key)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] border-[var(--color-border-default)] hover:text-[var(--color-text-primary)] transition-all cursor-pointer">
                {d.label}
              </button>
            ))
          ) : (
            ([
              { id: "", label: "Todos", icon: ListIcon, count: Object.values(statusCounts).reduce((a, b) => a + b, 0) },
              { id: "Pago", label: "Pago", icon: CheckCircle2, count: statusCounts["Pago"] || 0 },
              { id: "A Vencer", label: "A Vencer", icon: Clock, count: statusCounts["A Vencer"] || 0 },
              { id: "Pendente", label: "Pendente", icon: HourglassIcon, count: statusCounts["Pendente"] || 0 },
              { id: "Atrasado", label: "Atrasado", icon: AlertTriangle, count: statusCounts["Atrasado"] || 0 },
            ] as const).map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => setFiltroStatus(t.id as typeof filtroStatus)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${filtroStatus === t.id ? "bg-[var(--color-primary-blue)] text-white border-transparent shadow-sm" : "bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] border-[var(--color-border-default)] hover:text-[var(--color-text-primary)]"}`}
              >
                <t.icon className="w-3.5 h-3.5" /> {t.label}
                <span className={`min-w-5 text-center text-[10px] font-black px-1.5 py-0.5 rounded-full ${filtroStatus === t.id ? "bg-white text-[var(--color-primary-blue)]" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]"}`}>{t.count}</span>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 h-9 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] px-3">
            <ArrowUpDown className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            <span className="flex flex-col">
              <span className="text-[9px] text-[var(--color-text-faint)] leading-none">Ordenar por</span>
              <select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)} className="bg-transparent text-xs font-bold text-[var(--color-text-primary)] focus:outline-none cursor-pointer">
                <option value="data_desc">Data (mais recente)</option>
                <option value="data_asc">Data (mais antiga)</option>
                <option value="valor_desc">Valor (maior)</option>
                <option value="valor_asc">Valor (menor)</option>
              </select>
            </span>
          </label>
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)]">
            {([{ id: "lista" as const, icon: ListIcon }, { id: "grade" as const, icon: LayoutGrid }]).map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setViewMode(id)}
                className={`h-8 w-8 flex items-center justify-center rounded-md border-none cursor-pointer ${viewMode === id ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]" : "bg-transparent text-[var(--color-text-muted)]"}`}
                aria-label={id === "lista" ? "Visualização em lista" : "Visualização em grade"}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {chartsJsx}

      {viewMode === "lista" ? (
      <Card className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            Fluxo de Caixa / {type === 'Pagar' ? 'Contas a Pagar' : 'Contas a Receber'}
            {temFiltrosAtivos && <span className="ml-2 normal-case font-medium text-[var(--color-primary-blue)]">· {filteredTotal} lançamento(s) encontrado(s)</span>}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-primary-blue)] font-semibold">
            <Calendar className="w-3.5 h-3.5" /> Ciclo Atual
          </div>
        </div>

        <div className="overflow-x-auto">
          {/* Desktop Table */}
          <table className="w-full text-xs text-left hidden md:table">
            <thead className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={filteredData.length > 0 && filteredData.every((r: any) => selecionados.has(r.id))}
                    onChange={() => setSelecionados(filteredData.every((r: any) => selecionados.has(r.id)) ? new Set() : new Set(filteredData.map((r: any) => r.id)))}
                    className="w-4 h-4 accent-[var(--color-primary-blue)] cursor-pointer"
                    aria-label="Selecionar todos da página"
                  />
                </th>
                <th className="px-3 py-3">Nome</th>
                <th className="px-3 py-3">Categoria</th>
                <th className="px-3 py-3">Cliente/Fornecedor</th>
                <th className="px-3 py-3">Pagamento</th>
                <th className="px-3 py-3">
                  <button type="button" onClick={() => setOrdem((v) => (v === "data_desc" ? "data_asc" : "data_desc"))} className="inline-flex items-center gap-1 uppercase font-bold tracking-wider bg-transparent border-none cursor-pointer text-inherit p-0" title="Ordenar por vencimento">
                    Vencimento {ordem === "data_asc" ? <ArrowUpRight className="w-3 h-3 rotate-[-45deg]" /> : <ArrowDownRight className="w-3 h-3 rotate-[45deg]" />}
                  </button>
                </th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Valor</th>
                <th className="px-3 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-0">
                    <EmptyState
                      icon={DollarSign}
                      title={temFiltrosAtivos ? "Nenhum lançamento para esses filtros" : "Nenhum lançamento ainda"}
                      description={temFiltrosAtivos ? "Ajuste ou limpe os filtros para ver outros lançamentos." : "Cadastre o primeiro lançamento deste período."}
                      className="border-0 rounded-none bg-transparent"
                      action={!temFiltrosAtivos ? (
                        <Button onClick={() => { setNewContaBancariaId(contaPrincipalId); setIsModalOpen(true); }} className="h-9 px-4 text-xs font-bold gap-1.5">
                          <Plus className="w-3.5 h-3.5" /> Novo Lançamento
                        </Button>
                      ) : undefined}
                    />
                  </td>
                </tr>
              ) : (
                filteredData.map((item) => (
                  <tr key={item.id} className={`hover:bg-[var(--color-surface-sunken)]/50 transition-colors group ${selecionados.has(item.id) ? "bg-[var(--color-primary-blue)]/[0.04]" : ""}`}>
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selecionados.has(item.id)}
                        onChange={() => setSelecionados((prev) => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; })}
                        className="w-4 h-4 accent-[var(--color-primary-blue)] cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-bold text-[var(--color-text-primary)] min-w-[260px]">
                      <span className="inline-flex items-center gap-1.5 max-w-[460px]">
                        <span className="truncate cursor-pointer hover:text-[var(--color-primary-blue)]" title={item.description} onClick={() => setViewingItem(item)}>{item.description}</span>
                        <RepeatBadge item={item} />
                      </span>
                      {item.notes && (
                        <p className="text-[10px] font-normal text-[var(--color-text-faint)] mt-0.5 max-w-[220px] truncate" title={item.notes}>{item.notes}</p>
                      )}
                      {item.numero_documento && (
                        <p className="text-[10px] font-normal text-[var(--color-text-faint)] mt-0.5">NF {item.numero_documento}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-text-muted)]">
                      <span className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-md bg-[var(--color-surface-sunken)] flex items-center justify-center shrink-0"><Tag className="w-3.5 h-3.5" /></span>
                        <span className="truncate max-w-[150px]">{item.category}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-text-muted)]">{item.counterparty || "—"}</td>
                    <td className="px-3 py-2.5 text-[var(--color-text-muted)]">{item.payment_method || "—"}</td>
                    <td className="px-3 py-2.5 text-[var(--color-text-muted)] font-mono whitespace-nowrap">{parseEntryDate(item.date)?.toLocaleDateString("pt-BR") ?? item.date}</td>
                    <td className="px-3 py-2.5">
                      <span
                        title="Para alterar o status, use o lápis (editar)"
                        className={`inline-flex items-center px-2.5 py-1 text-[11px] font-bold rounded-full border cursor-default ${getStatusColor(item.status)}`}
                      >
                        {getStatusIcon(item.status)}
                        {item.status}
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-bold ${type === 'Pagar' ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {type === 'Pagar' ? '-' : '+'} {formatCurrency(item.value)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewingItem(item)}
                          className="p-1.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10 rounded-lg transition-colors cursor-pointer"
                          title="Visualizar lançamento"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="p-1.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10 rounded-lg transition-colors cursor-pointer"
                          title="Editar lançamento"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(item)}
                          className="p-1.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10 rounded-lg transition-colors cursor-pointer"
                          title="Duplicar lançamento"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          className="p-1.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-danger hover:bg-danger/10 rounded-lg transition-colors cursor-pointer"
                          title="Excluir lançamento"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-[var(--color-surface-sunken)] border-t border-[var(--color-border-subtle)] font-bold">
              <tr>
                <td colSpan={7} className="px-4 py-3 text-[var(--color-text-muted)] text-right uppercase tracking-wider text-[10px]">Total:</td>
                <td className={`px-3 py-3 font-mono font-bold text-sm text-right ${type === 'Pagar' ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {formatCurrency(totalValue)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          {/* Mobile Cards */}
          <div className="md:hidden p-4 space-y-3">
            {filteredData.length === 0 && (
              <EmptyState
                icon={DollarSign}
                title={temFiltrosAtivos ? "Nenhum lançamento para esses filtros" : "Nenhum lançamento ainda"}
                description={temFiltrosAtivos ? "Ajuste ou limpe os filtros para ver outros lançamentos." : "Cadastre o primeiro lançamento deste período."}
                className="border-0 bg-transparent py-8"
                action={!temFiltrosAtivos ? (
                  <Button onClick={() => { setNewContaBancariaId(contaPrincipalId); setIsModalOpen(true); }} className="h-9 px-4 text-xs font-bold gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Novo Lançamento
                  </Button>
                ) : undefined}
              />
            )}
            {filteredData.map((item) => (
              <div key={item.id} className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] p-4 rounded-xl flex flex-col gap-3 relative">
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewingItem(item)}
                    className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10 hover:border-[var(--color-primary-blue)]/25 p-1 transition-colors"
                    title="Visualizar lançamento"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10 hover:border-[var(--color-primary-blue)]/25 p-1 transition-colors"
                    title="Editar lançamento"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-danger hover:bg-danger/10 hover:border-danger/25 p-1 transition-colors"
                    title="Excluir lançamento"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div>
                  <p className="font-bold text-[var(--color-text-primary)] text-xs mb-1 pr-12 flex items-center gap-1.5 flex-wrap">
                    {item.description}
                    <RepeatBadge item={item} />
                  </p>
                  {item.notes && <p className="text-[10px] text-[var(--color-text-faint)] mb-1">{item.notes}</p>}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-[var(--color-text-muted)] font-semibold uppercase">{item.category}</span>
                    <span className="text-[10px] text-[var(--color-text-faint)] font-mono">{item.date}</span>
                    {item.payment_method && <span className="text-[10px] text-[var(--color-text-faint)]">· {item.payment_method}</span>}
                    {item.numero_documento && <span className="text-[10px] text-[var(--color-text-faint)]">· NF {item.numero_documento}</span>}
                  </div>
                  {item.counterparty && (
                    <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 flex items-center gap-1"><User className="w-2.5 h-2.5" /> {item.counterparty}</p>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] pt-2.5">
                  <span
                    title="Status travado — use o lápis para editar"
                    className={`inline-flex items-center px-2 py-0.5 text-[9px] font-bold rounded-md border cursor-default ${getStatusColor(item.status)}`}
                  >
                    {getStatusIcon(item.status)}
                    {item.status}
                    <Lock className="w-2.5 h-2.5 ml-1 opacity-60" />
                  </span>
                  <p className={`font-mono font-bold text-xs ${type === 'Pagar' ? 'text-danger' : 'text-success'}`}>
                    {formatCurrency(item.value)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {filteredData.map((item) => (
          <Card key={item.id} className="p-4 rounded-xl space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--color-text-primary)] truncate flex items-center gap-1.5">{item.description}<RepeatBadge item={item} /></p>
                <p className="text-[11px] text-[var(--color-text-muted)] truncate">{item.category || "Sem categoria"}{item.counterparty ? ` · ${item.counterparty}` : ""}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => setViewingItem(item)} className="p-1.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] rounded-lg cursor-pointer" title="Visualizar lançamento"><Eye className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => openEdit(item)} className="p-1.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] rounded-lg cursor-pointer" title="Editar lançamento"><Pencil className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => handleDuplicate(item)} className="p-1.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] rounded-lg cursor-pointer" title="Duplicar lançamento"><Copy className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => handleDelete(item)} className="p-1.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-danger rounded-lg cursor-pointer" title="Excluir lançamento"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-base font-black tabular-nums ${type === "Pagar" ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"}`}>{type === "Pagar" ? "− " : "+ "}{formatCurrency(item.value)}</span>
              <span className={`inline-flex items-center px-2.5 py-1 text-[11px] font-bold rounded-full border ${getStatusColor(item.status)}`}>{getStatusIcon(item.status)}{item.status}</span>
            </div>
            <p className="text-[10px] text-[var(--color-text-faint)]">{parseEntryDate(item.date)?.toLocaleDateString("pt-BR") ?? item.date}{item.payment_method ? ` · ${item.payment_method}` : ""}</p>
          </Card>
        ))}
        {filteredData.length === 0 && <p className="col-span-full py-12 text-center text-xs text-[var(--color-text-faint)]">{temFiltrosAtivos ? "Nenhum lançamento para esses filtros." : "Nenhum lançamento ainda."}</p>}
      </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <select
            value={pageSizeSel}
            onChange={(e) => setPageSizeSel(Number(e.target.value))}
            className="h-9 px-3 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-xs font-bold text-[var(--color-text-primary)] focus:outline-none cursor-pointer"
          >
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          registros por página
        </label>
        <div className="min-w-[260px] flex-1 max-w-xl">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={filteredTotal}
            pageSize={pageSize}
            loading={entriesLoading}
            onPageChange={setPage}
            itemLabel="lançamento"
          />
        </div>
      </div>


      {/* Creation Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetAddForm(); }}
        title={
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${type === 'Pagar' ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
              <DollarSign className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-black text-[var(--color-text-primary)] leading-tight">{type === 'Pagar' ? 'Novo Gasto / Despesa' : 'Novo Recebimento / Receita'}</div>
              <div className="text-xs font-normal text-[var(--color-text-muted)]">Registre um lançamento financeiro com classificação de categoria e vencimento.</div>
            </div>
          </div>
        }
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> Nome do Lançamento *</label>
            <input
              type="text"
              required
              placeholder="Ex: Servidor AWS, Licença de Software, Fatura..."
              value={newDesc}
              onChange={(e) => { setNewDesc(e.target.value); setFormErrors(prev => ({ ...prev, desc: undefined })); }}
              className={`w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] ${formErrors.desc ? "border-danger" : "border-[var(--color-border-default)]"}`}
            />
            {formErrors.desc && <p className="text-[10px] text-danger mt-1">{formErrors.desc}</p>}
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><AlignLeft className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> Descrição / Observações</label>
            <textarea
              rows={2}
              placeholder="Detalhes adicionais deste lançamento (opcional)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> Categoria Financeira *</label>
              {!showNovaCategoria ? (
                <select
                  required
                  value={newCategoryId}
                  onChange={(e) => {
                    if (e.target.value === "__nova__") { setShowNovaCategoria(true); return; }
                    setNewCategoryId(e.target.value);
                    setFormErrors(prev => ({ ...prev, category: undefined }));
                  }}
                  className={`w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer ${formErrors.category ? "border-danger" : "border-[var(--color-border-default)]"}`}
                >
                  <option value="">Selecione...</option>
                  {categoriasDoTipo.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  <option value="__nova__">+ Criar nova categoria...</option>
                </select>
              ) : (
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Nome da categoria"
                    value={novaCategoriaNome}
                    onChange={(e) => setNovaCategoriaNome(e.target.value)}
                    className="flex-1 min-w-0 bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
                  />
                  <button type="button" onClick={() => setShowNovaCategoria(false)} className="text-xs text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] px-1">✕</button>
                </div>
              )}
              {type === 'Pagar' && showNovaCategoria && (
                <select
                  value={novaCategoriaSubtipo}
                  onChange={(e) => setNovaCategoriaSubtipo(e.target.value as typeof novaCategoriaSubtipo)}
                  className="w-full mt-1.5 bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-[11px] focus:outline-none cursor-pointer"
                >
                  <option value="DESPESA_FIXA">Despesa Fixa</option>
                  <option value="DESPESA_VARIAVEL">Despesa Variável</option>
                  <option value="PESSOAS">Pessoas</option>
                  <option value="IMPOSTOS">Impostos</option>
                </select>
              )}
              {formErrors.category && <p className="text-[10px] text-danger mt-1">{formErrors.category}</p>}
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> {type === 'Pagar' ? 'Fornecedor' : 'Cliente'}</label>
              <input
                type="text"
                list="contatos-sugeridos-new"
                placeholder={type === 'Pagar' ? 'Ex: AWS, Fornecedor X' : 'Ex: Nome do cliente'}
                value={newCounterparty}
                onChange={(e) => setNewCounterparty(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
              <datalist id="contatos-sugeridos-new">
                {contatosSugeridos.map((c: any) => <option key={c.id} value={c.name} />)}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> Forma de {type === 'Pagar' ? 'Pagamento' : 'Recebimento'}</label>
              <select
                value={newPaymentMethod}
                onChange={(e) => setNewPaymentMethod(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
              >
                <option value="">Não informado</option>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> Nº da Nota Fiscal</label>
              <input
                type="text"
                placeholder="Ex: NF-e 12345"
                value={newNumeroDocumento}
                onChange={(e) => setNewNumeroDocumento(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
              <p className="text-[10px] text-[var(--color-text-faint)] mt-1">O arquivo da nota (PDF/XML) pode ser anexado depois de salvar, em "Editar → Nota Fiscal / Anexos".</p>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><Landmark className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> Conta Bancária</label>
            <select
              value={newContaBancariaId}
              onChange={(e) => setNewContaBancariaId(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
            >
              <option value="">Não vinculada</option>
              {contasAtivas.map((c: any) => <option key={c.id} value={c.id}>{c.nome}{c.is_principal ? " (Principal)" : ""}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> Centro de Custo</label>
              <select
                value={newCentroCustoId}
                onChange={(e) => setNewCentroCustoId(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
              >
                <option value="">Não informado</option>
                {(financeCentrosCusto as any[]).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><Tag className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> Tags</label>
              <input
                type="text"
                placeholder="separadas por vírgula"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
                {newRepeatMode === "parcelado" ? "Valor Total (R$) *" : "Valor (R$) *"}
              </label>
              <input
                type="number"
                required
                step="0.01"
                placeholder="0,00"
                value={newValue}
                onChange={(e) => { setNewValue(e.target.value); setFormErrors(prev => ({ ...prev, value: undefined })); }}
                className={`w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-mono ${formErrors.value ? "border-danger" : "border-[var(--color-border-default)]"}`}
              />
              {formErrors.value && <p className="text-[10px] text-danger mt-1">{formErrors.value}</p>}
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
                {newRepeatMode === "none" ? "Data de Vencimento" : "1º Vencimento"}
              </label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div className="bg-[var(--color-surface-sunken)]/60 border border-[var(--color-border-subtle)] rounded-2xl p-4 space-y-3">
            <label className="text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
              <ArrowLeftRight className="w-3.5 h-3.5 text-[var(--color-text-muted)]" /> Tipo de lançamento
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([
                { id: "none" as const, icon: DollarSign, title: "Único", desc: type === "Pagar" ? "Valor a pagar uma vez" : "Valor a receber uma vez" },
                { id: "recorrente" as const, icon: Repeat, title: "Recorrente", desc: "Repete periodicamente" },
                { id: "parcelado" as const, icon: Layers, title: "Parcelado", desc: "Dividido em parcelas" },
              ]).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setNewRepeatMode(opt.id)}
                  className={`flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-colors cursor-pointer ${newRepeatMode === opt.id ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/40" : "bg-[var(--color-surface-elevated)] border-[var(--color-border-subtle)] hover:border-[var(--color-primary-blue)]/30"}`}
                >
                  <opt.icon className={`w-5 h-5 shrink-0 ${newRepeatMode === opt.id ? "text-[var(--color-primary-blue)]" : "text-[var(--color-text-muted)]"}`} />
                  <span className="min-w-0">
                    <span className={`block text-xs font-bold ${newRepeatMode === opt.id ? "text-[var(--color-primary-blue)]" : "text-[var(--color-text-primary)]"}`}>{opt.title}</span>
                    <span className="block text-[10px] text-[var(--color-text-muted)] leading-tight">{opt.desc}</span>
                  </span>
                </button>
              ))}
            </div>

            {newRepeatMode === "recorrente" && (
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5">Frequência</label>
                  <select
                    value={newFrequency}
                    onChange={(e) => setNewFrequency(e.target.value as Frequencia)}
                    className="w-full bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
                  >
                    <option value="semanal">Semanal</option>
                    <option value="quinzenal">Quinzenal</option>
                    <option value="mensal">Mensal</option>
                    <option value="bimestral">Bimestral</option>
                    <option value="trimestral">Trimestral</option>
                    <option value="semestral">Semestral</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5">Repetir por quantas vezes</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={newOcorrencias}
                    onChange={(e) => setNewOcorrencias(e.target.value)}
                    className="w-full bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-mono"
                  />
                </div>
              </div>
            )}

            {newRepeatMode === "parcelado" && (
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5">Número de Parcelas</label>
                  <input
                    type="number"
                    min={2}
                    max={60}
                    value={newParcelas}
                    onChange={(e) => setNewParcelas(e.target.value)}
                    className="w-full bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5">Intervalo entre parcelas</label>
                  <select
                    value={newFrequency}
                    onChange={(e) => setNewFrequency(e.target.value as Frequencia)}
                    className="w-full bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
                  >
                    <option value="semanal">Semanal</option>
                    <option value="quinzenal">Quinzenal</option>
                    <option value="mensal">Mensal</option>
                    <option value="bimestral">Bimestral</option>
                    <option value="trimestral">Trimestral</option>
                    <option value="semestral">Semestral</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
                {newValue && (
                  <p className="col-span-2 text-[10px] text-[var(--color-text-muted)]">
                    {Math.max(2, parseInt(newParcelas, 10) || 2)}x de{" "}
                    <span className="font-mono font-bold text-[var(--color-text-primary)]">
                      {formatCurrency(splitInstallments(parseFloat(newValue) || 0, Math.max(2, parseInt(newParcelas, 10) || 2))[0])}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-[var(--color-border-subtle)]">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setIsModalOpen(false); resetAddForm(); }}
              className="h-10 px-5 text-xs font-bold border-[var(--color-border-default)]"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="h-10 px-6 text-xs font-bold shadow-xs gap-2"
            >
              <Save className="w-4 h-4" /> Salvar lançamento
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        title={
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]">
              <Pencil className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-black text-[var(--color-text-primary)] leading-tight">Editar Lançamento</div>
              <div className="text-xs font-normal text-[var(--color-text-muted)]">Atualize os dados e o status deste lançamento financeiro. Nenhum campo é obrigatório.</div>
            </div>
          </div>
        }
        maxWidth="max-w-2xl"
      >
        <div className="flex items-center gap-1 border-b border-[var(--color-border-subtle)] mb-4">
          {([{ id: "detalhes", label: "Detalhes", icon: FileText }, { id: "arquivos", label: "Nota Fiscal / Anexos", icon: Paperclip }] as const).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setEditModalTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold border-b-2 -mb-px transition-colors cursor-pointer bg-transparent border-x-0 border-t-0 ${editModalTab === t.id ? "border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {editModalTab === "arquivos" && editingItem ? (
          <FinanceiroAnexosTab transacaoId={editingItem.id} />
        ) : (
        <form onSubmit={handleSaveEdit} className="space-y-4">
          {editingItem?.recurring_group_id && (
            <div className="inline-flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase rounded-md bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border border-[var(--color-primary-blue)]/25">
              <Repeat className="w-2.5 h-2.5" /> Faz parte de uma recorrência {editingItem.recurring_frequency} — editar aqui só afeta esta ocorrência.
            </div>
          )}
          {editingItem?.installment_group_id && (
            <div className="inline-flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase rounded-md bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border border-[var(--color-border-default)]">
              <Layers className="w-2.5 h-2.5" /> Parcela {editingItem.installment_number} de {editingItem.installment_total} — editar aqui só afeta esta parcela.
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> Nome do Lançamento</label>
            <input
              type="text"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><AlignLeft className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> Descrição / Observações</label>
            <textarea
              rows={2}
              value={editNotes}
              maxLength={500}
              placeholder="Detalhes adicionais deste lançamento (opcional)"
              onChange={(e) => setEditNotes(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] resize-none"
            />
            <p className="text-[10px] text-[var(--color-text-faint)] text-right mt-0.5">{editNotes.length}/500</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> Categoria Financeira</label>
              <select
                value={editCategoryId}
                onChange={(e) => setEditCategoryId(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
              >
                <option value="">Selecione...</option>
                {categoriasDoTipo.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> {type === 'Pagar' ? 'Fornecedor' : 'Cliente'}</label>
              <input
                type="text"
                list="contatos-sugeridos-edit"
                value={editCounterparty}
                onChange={(e) => setEditCounterparty(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
              <datalist id="contatos-sugeridos-edit">
                {contatosSugeridos.map((c: any) => <option key={c.id} value={c.name} />)}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> Forma de {type === 'Pagar' ? 'Pagamento' : 'Recebimento'}</label>
              <select
                value={editPaymentMethod}
                onChange={(e) => setEditPaymentMethod(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
              >
                <option value="">Não informado</option>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> Nº da Nota Fiscal</label>
              <input
                type="text"
                placeholder="Ex: NF-e 12345"
                value={editNumeroDocumento}
                onChange={(e) => setEditNumeroDocumento(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
              <p className="flex items-start gap-2 text-[10px] text-[var(--color-text-muted)] mt-1.5 p-2 rounded-lg bg-[var(--color-primary-blue)]/[0.06] border border-[var(--color-primary-blue)]/15">
                <Info className="w-3.5 h-3.5 shrink-0 text-[var(--color-primary-blue)]" />
                O arquivo da nota (PDF/XML) pode ser anexado na aba "Nota Fiscal / Anexos".
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><Landmark className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> Conta Bancária</label>
            <select
              value={editContaBancariaId}
              onChange={(e) => setEditContaBancariaId(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
            >
              <option value="">Não vinculada</option>
              {contasAtivas.map((c: any) => <option key={c.id} value={c.id}>{c.nome}{c.is_principal ? " (Principal)" : ""}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> Centro de Custo</label>
              <select
                value={editCentroCustoId}
                onChange={(e) => setEditCentroCustoId(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
              >
                <option value="">Não informado</option>
                {(financeCentrosCusto as any[]).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><Tag className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> Tags</label>
              <input
                type="text"
                placeholder="separadas por vírgula"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
              <p className="text-[10px] text-[var(--color-text-faint)] mt-1">Ex: marketing, software, recorrente</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> Valor (R$)</label>
              <div className="flex items-stretch rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] overflow-hidden focus-within:ring-2 focus-within:ring-[var(--color-primary-blue)]">
                <span className="px-3 flex items-center text-xs font-bold text-[var(--color-text-muted)] border-r border-[var(--color-border-default)]">R$</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="flex-1 min-w-0 bg-transparent text-[var(--color-text-primary)] px-3 py-2.5 text-xs focus:outline-none font-mono"
                />
              </div>
              {!editingItem?.division_group_id && (
                <button
                  type="button"
                  disabled={!(parseFloat(editValue) > 0)}
                  onClick={() => setRateioOpen(true)}
                  className="text-[10px] font-semibold text-[var(--color-primary-blue)] hover:underline mt-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
                >
                  Detalhar valor (dividir em várias linhas)
                </button>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> Data de Vencimento</label>
              <input
                type="text"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                placeholder="dd/mm/aaaa"
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div className="bg-[var(--color-surface-sunken)]/60 border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] p-3.5 space-y-3">
            <Switch
              checked={editIsRecurring}
              onCheckedChange={setEditIsRecurring}
              label="Lançamento recorrente?"
              description={
                editingItem?.recurring_group_id
                  ? "Esta ocorrência já pertence a uma recorrência gerada na criação."
                  : "Marca este lançamento como recorrente (não gera novas ocorrências, só identifica este)."
              }
            />
            {editIsRecurring && (
              <div>
                <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5">Frequência</label>
                <select
                  value={editFrequency}
                  onChange={(e) => setEditFrequency(e.target.value as Frequencia)}
                  className="w-full bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
                >
                  <option value="semanal">Semanal</option>
                  <option value="quinzenal">Quinzenal</option>
                  <option value="mensal">Mensal</option>
                  <option value="bimestral">Bimestral</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" /> Status
            </label>
            <div className={`flex items-center gap-2.5 rounded-xl border px-3 ${getStatusColor(editStatus)}`}>
              {getStatusIcon(editStatus)}
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as "Pago" | "A Vencer" | "Atrasado" | "Pendente")}
                className="flex-1 bg-transparent py-2.5 text-xs font-bold focus:outline-none cursor-pointer"
              >
                <option value="A Vencer">A Vencer</option>
                <option value="Pago">Pago</option>
                <option value="Atrasado">Atrasado</option>
                <option value="Pendente">Pendente</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-4 border-t border-[var(--color-border-subtle)]">
            <Button
              type="button"
              variant="outline"
              onClick={async () => { if (editingItem) { const item = editingItem; setEditingItem(null); await handleDelete(item); } }}
              className="h-10 px-4 text-xs font-bold gap-1.5 text-rose-500 border-rose-500/30 hover:bg-rose-500/10"
            >
              <Trash2 className="w-4 h-4" /> Excluir
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingItem(null)}
                className="h-10 px-5 text-xs font-bold border-[var(--color-border-default)]"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="h-10 px-6 text-xs font-bold shadow-xs gap-2"
              >
                <Save className="w-4 h-4" /> Salvar Alterações
              </Button>
            </div>
          </div>
        </form>
        )}
      </Modal>

      <RateioModal
        isOpen={rateioOpen}
        onClose={() => setRateioOpen(false)}
        parent={editingItem ? {
          id: editingItem.id,
          description: editingItem.description,
          date: (() => { const d = parseEntryDate(editingItem.date); return d ? d.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10); })(),
          value: parseFloat(editValue) || editingItem.value,
          type,
          category_id: editCategoryId,
        } : null}
        categoriasDoTipo={categoriasDoTipo}
        onConfirm={handleConfirmRateio}
      />
      </div>

      {viewingItem && (
        <ViewModal
          isOpen
          onClose={() => setViewingItem(null)}
          icon={type === "Pagar" ? TrendingDown : TrendingUp}
          tone={type === "Pagar" ? "danger" : "success"}
          title={viewingItem.description}
          subtitle={type === "Pagar" ? "Despesa" : "Receita"}
          highlight={<span className={`text-xl font-black tabular-nums ${type === "Pagar" ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"}`}>{type === "Pagar" ? "− " : "+ "}{formatCurrency(viewingItem.value)}</span>}
          sections={viewSections(viewingItem)}
          onEdit={() => { const it = viewingItem; setViewingItem(null); openEdit(it); }}
          onNew={openNewFromView}
          newLabel={type === "Pagar" ? "Nova despesa" : "Nova receita"}
          onDelete={() => { const it = viewingItem; setViewingItem(null); handleDelete(it); }}
        />
      )}

      <DrillDownPanel
        isOpen={drillKey !== null}
        onClose={() => setDrillKey(null)}
        title={
          drillKey === "categoria" ? "Por categoria" : drillKey === "contraparte" ? (type === "Pagar" ? "Por fornecedor" : "Por cliente") :
          kpis.kind === "pipeline"
            ? (drillKey === "pago" ? "Pago" : drillKey === "aVencer" ? "A Vencer" : drillKey === "atrasado" ? "Atrasado" : drillKey === "pendente" ? "Pendente" : undefined)
            : (drillKey === "mes" ? (type === "Pagar" ? "Gasto no Mês" : "Recebido no Mês") : drillKey === "geral" ? "Total Geral (Histórico)" : undefined)
        }
        rows={
          drillKey === "categoria" || drillKey === "contraparte"
            ? agruparPor(kpis.kind === "realizado" ? kpis.rowsGeral : [], drillKey === "categoria" ? "category" : "counterparty")
            : kpis.kind === "pipeline"
            ? (drillKey === "pago" ? kpis.rowsPago : drillKey === "aVencer" ? kpis.rowsAVencer : drillKey === "atrasado" ? kpis.rowsAtrasado : drillKey === "pendente" ? kpis.rowsPendente : [])
            : (drillKey === "mes" ? kpis.rowsMesAtual : drillKey === "geral" ? kpis.rowsGeral : [])
        }
        columns={drillKey === "categoria" || drillKey === "contraparte" ? agrupadoColumns : drillColumns}
      />
    </PageContainer>
  );
}
