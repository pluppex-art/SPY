import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import {
  Download, Calendar, CheckCircle2,
  Clock, AlertTriangle, Plus, Trash2, DollarSign, Pencil, Lock, Repeat, Layers, User, Search, X, HelpCircle,
  TrendingUp, TrendingDown, BarChart3, HourglassIcon,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { Switch } from "../../components/ui/switch";
import React, { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from "recharts";
import { useData } from "../../contexts/DataContext";
import { toast } from "sonner";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { downloadCsv } from "../../lib/csvExport";
import { useLocalization } from "../../contexts/LocalizationContext";
import { RateioModal, type RateioDivisao } from "./components/RateioModal";
import { FinanceiroAnexosTab } from "./components/FinanceiroAnexosTab";
import { parseEntryDate } from "./lib/financeDates";
import { useFinanceEntriesList } from "./useFinanceEntriesList";
import { Pagination } from "../../components/ui/Pagination";
import { type Frequencia, addPeriodo, splitInstallments } from "../../lib/saleCalculator";
import { StatCell, StatCellRow } from "./components/StatCell";
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
  const { financeEntries, addFinanceEntry, deleteFinanceEntry, updateFinanceEntry, financeCategories, addFinanceCategory, financeBankAccounts, financeCentrosCusto, clienteBase } = useData();
  const { formatCurrency } = useLocalization();
  const [isModalOpen, setIsModalOpen] = useState(false);

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
  const kpis = useMemo(() => {
    const entriesDoTipo = (financeEntries as any[]).filter((e: any) => e.type === type);
    if (statusFilter === "Pago") {
      const now = new Date();
      const y = now.getFullYear(), m = now.getMonth();
      const prevRef = new Date(y, m - 1, 1);
      const py = prevRef.getFullYear(), pm = prevRef.getMonth();
      const pagos = entriesDoTipo.filter((e: any) => e.status === "Pago");
      const rowsMesAtual = pagos.filter((e: any) => isInMonth(e.date, y, m));
      const sumMes = (yy: number, mm: number) => pagos.filter((e: any) => isInMonth(e.date, yy, mm)).reduce((s: number, e: any) => s + e.value, 0);
      const totalMes = sumMes(y, m);
      const totalMesAnterior = sumMes(py, pm);
      const totalGeral = pagos.reduce((s: number, e: any) => s + e.value, 0);
      return {
        kind: "realizado" as const,
        totalMes, deltaPct: pctDelta(totalMes, totalMesAnterior),
        totalGeral, ticketMedio: pagos.length > 0 ? totalGeral / pagos.length : 0, count: pagos.length,
        rowsMesAtual, rowsGeral: pagos,
      };
    }
    const filterStatus = (status: string) => entriesDoTipo.filter((e: any) => e.status === status);
    const sumStatus = (status: string) => filterStatus(status).reduce((s: number, e: any) => s + e.value, 0);
    const countStatus = (status: string) => filterStatus(status).length;
    return {
      kind: "pipeline" as const,
      pago: sumStatus("Pago"), aVencer: sumStatus("A Vencer"), atrasado: sumStatus("Atrasado"), pendente: sumStatus("Pendente"),
      countPago: countStatus("Pago"), countAVencer: countStatus("A Vencer"), countAtrasado: countStatus("Atrasado"), countPendente: countStatus("Pendente"),
      rowsPago: filterStatus("Pago"), rowsAVencer: filterStatus("A Vencer"), rowsAtrasado: filterStatus("Atrasado"), rowsPendente: filterStatus("Pendente"),
    };
  }, [financeEntries, type, statusFilter]);

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

  const monthlySeries = useMemo(
    () => (statusFilter === "Pago" ? getMonthlyRealizedSeries(financeEntries as any[], type, 6) : []),
    [financeEntries, type, statusFilter]
  );
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
  const [filtroStatus, setFiltroStatus] = useState<"" | "Pago" | "A Vencer" | "Atrasado" | "Pendente">("");
  const [filtroContaBancariaId, setFiltroContaBancariaId] = useState("");
  const [filtroCentroCustoId, setFiltroCentroCustoId] = useState("");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  // Achado de UX 2026-09-21: os 7 filtros ficavam sempre visíveis antes de
  // qualquer dado — quem só quer ver "o que tenho a receber esse mês" caía
  // direto num formulário de 7 campos. Conta Bancária/Centro de Custo/período
  // agora ficam atrás de "Mais filtros".
  const [showMoreFiltros, setShowMoreFiltros] = useState(false);
  const temFiltrosAvancadosAtivos = !!(filtroContaBancariaId || filtroCentroCustoId || filtroDataInicio || filtroDataFim);

  const temFiltrosAtivos = !!(filtroBusca || filtroCategoriaId || filtroStatus || filtroContaBancariaId || filtroCentroCustoId || filtroDataInicio || filtroDataFim);
  const limparFiltros = () => {
    setFiltroBusca(""); setFiltroCategoriaId(""); setFiltroStatus("");
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
    refetch: refetchEntries, fetchAllForExport,
  } = useFinanceEntriesList({
    type, statusFilter,
    search: filtroBusca,
    categoriaId: filtroCategoriaId,
    status: filtroStatus,
    contaBancariaId: filtroContaBancariaId,
    centroCustoId: filtroCentroCustoId,
    dataInicio: filtroDataInicio,
    dataFim: filtroDataFim,
  });

  const [formErrors, setFormErrors] = useState<{ desc?: string; value?: string; category?: string }>({});

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
        status: defaultStatus ?? baseFields.status,
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
    const allFiltered = await fetchAllForExport();
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
    if (!editingItem || !editDesc.trim() || !(parseFloat(editValue) > 0) || !editCategoryId) {
      toast.error("Preencha descrição, valor e categoria antes de salvar.");
      return;
    }

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
      description: editDesc,
      notes: editNotes || null,
      category: categoriaSelecionada?.nome || "Geral",
      category_id: editCategoryId,
      conta_bancaria_id: editContaBancariaId || null,
      centro_custo_id: editCentroCustoId || null,
      tags: parseTags(editTags),
      counterparty: editCounterparty || null,
      contato_id: editCounterparty ? resolverContatoId(editCounterparty) : null,
      payment_method: editPaymentMethod || null,
      numero_documento: editNumeroDocumento || null,
      value: parseFloat(editValue),
      date: editDate,
      status: editStatus,
      is_recurring: editIsRecurring,
      recurring_frequency: editIsRecurring ? editFrequency : null,
    });
    toast.success("Lançamento atualizado.");
    setEditingItem(null);
    setTimeout(refetchEntries, 300);
  };

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
      case 'Pago': return "bg-success/10 text-success border-success/30";
      case 'A Vencer': return "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border-[var(--color-border-default)]";
      case 'Atrasado': return "bg-danger/10 text-danger border-danger/30";
      case 'Pendente': return "bg-warning/10 text-warning border-warning/30";
      default: return "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border-[var(--color-border-subtle)]";
    }
  };

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

  return (
    <PageContainer
      title={title}
      description={desc}
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: title }]}
      actions={
        <div className="flex items-center gap-2">
          <Button
            onClick={() => { setNewContaBancariaId(contaPrincipalId); setIsModalOpen(true); }}
            className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Novo Lançamento
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            className="h-9 px-4 text-xs font-bold gap-1.5 border-[var(--color-border-default)]"
          >
            <Download className="w-3.5 h-3.5" /> Exportar
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
      {kpis.kind === "pipeline" ? (
        <>
          <StatCellRow>
            <StatCell label="Pago" value={formatCurrency(kpis.pago)} icon={CheckCircle2} tone="success" hint={`${kpis.countPago} lançamento(s)`} onClick={() => setDrillKey("pago")} />
            <StatCell label="A Vencer" value={formatCurrency(kpis.aVencer)} icon={Clock} tone="neutral" hint={`${kpis.countAVencer} lançamento(s)`} onClick={() => setDrillKey("aVencer")} />
            <StatCell label="Atrasado" value={formatCurrency(kpis.atrasado)} icon={AlertTriangle} tone={kpis.atrasado > 0 ? "danger" : "neutral"} hint={`${kpis.countAtrasado} lançamento(s)`} onClick={() => setDrillKey("atrasado")} />
            <StatCell label="Pendente" value={formatCurrency(kpis.pendente)} icon={HourglassIcon} tone={kpis.pendente > 0 ? "warning" : "neutral"} hint={`${kpis.countPendente} lançamento(s)`} onClick={() => setDrillKey("pendente")} />
          </StatCellRow>
          {statusBreakdown.length > 0 && (
            <Card className="p-4">
              <h3 className="text-xs font-bold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[var(--color-text-faint)]" /> {type === "Pagar" ? "Pagamentos" : "Recebimentos"} por Status
              </h3>
              <div className="h-36 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusBreakdown} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="status" type="category" stroke="var(--color-text-muted)" fontSize={11} width={70} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-control)" }} itemStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {statusBreakdown.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </>
      ) : (
        <>
          <StatCellRow>
            <StatCell label={type === "Pagar" ? "Gasto no Mês" : "Recebido no Mês"} value={formatCurrency(kpis.totalMes)} icon={type === "Pagar" ? TrendingDown : TrendingUp} tone={type === "Pagar" ? (kpis.totalMes > 0 ? "danger" : "neutral") : "success"} onClick={() => setDrillKey("mes")} />
            <StatCell
              label="Vs. Mês Anterior"
              value={kpis.deltaPct === null ? "—" : `${kpis.deltaPct > 0 ? "+" : ""}${kpis.deltaPct}%`}
              icon={type === "Pagar" ? TrendingUp : TrendingDown}
              tone={kpis.deltaPct === null ? "neutral" : (type === "Pagar" ? kpis.deltaPct <= 0 : kpis.deltaPct >= 0) ? "success" : "danger"}
            />
            <StatCell label="Ticket Médio" value={formatCurrency(kpis.ticketMedio)} icon={DollarSign} />
            <StatCell label="Total Geral (Histórico)" value={formatCurrency(kpis.totalGeral)} icon={Layers} hint={`${kpis.count} lançamento(s)`} onClick={() => setDrillKey("geral")} />
          </StatCellRow>
          <Card className="p-4">
            <h3 className="text-xs font-bold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[var(--color-text-faint)]" /> {title} — Últimos 6 Meses
            </h3>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySeries} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-control)" }} itemStyle={{ fontSize: "11px" }} />
                  <Bar dataKey="value" name={type === "Pagar" ? "Pago" : "Recebido"} fill={type === "Pagar" ? "var(--color-danger)" : "var(--color-success)"} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1 block">Buscar</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-faint)]" />
              <input
                type="text"
                placeholder="Nome, categoria ou cliente/fornecedor..."
                value={filtroBusca}
                onChange={(e) => setFiltroBusca(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] pl-8 pr-3 py-2 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1 block">Categoria</label>
            <select value={filtroCategoriaId} onChange={(e) => setFiltroCategoriaId(e.target.value)} className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs cursor-pointer">
              <option value="">Todas</option>
              {categoriasDoTipo.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          {!statusFilter && (
            <div>
              <label className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1 block">Status</label>
              <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)} className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs cursor-pointer">
                <option value="">Todos</option>
                <option value="Pago">Pago</option>
                <option value="A Vencer">A Vencer</option>
                <option value="Pendente">Pendente</option>
                <option value="Atrasado">Atrasado</option>
              </select>
            </div>
          )}
          <Button
            variant="outline"
            onClick={() => setShowMoreFiltros((v) => !v)}
            className="h-9 px-3 text-xs font-bold gap-1.5 border-[var(--color-border-default)]"
          >
            {showMoreFiltros ? "Menos filtros" : "Mais filtros"}
            {!showMoreFiltros && temFiltrosAvancadosAtivos && (
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary-blue)]" />
            )}
          </Button>
          {temFiltrosAtivos && (
            <Button variant="outline" onClick={limparFiltros} className="h-9 px-3 text-xs font-bold gap-1.5 border-[var(--color-border-default)]">
              <X className="w-3.5 h-3.5" /> Limpar
            </Button>
          )}
          {showMoreFiltros && (
            <>
              <div>
                <label className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1 block">Conta Bancária</label>
                <select value={filtroContaBancariaId} onChange={(e) => setFiltroContaBancariaId(e.target.value)} className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs cursor-pointer">
                  <option value="">Todas</option>
                  {contasAtivas.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1 block">Centro de Custo</label>
                <select value={filtroCentroCustoId} onChange={(e) => setFiltroCentroCustoId(e.target.value)} className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs cursor-pointer">
                  <option value="">Todos</option>
                  {(financeCentrosCusto as any[]).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1 block">De</label>
                <input type="date" value={filtroDataInicio} onChange={(e) => setFiltroDataInicio(e.target.value)} className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1 block">Até</label>
                <input type="date" value={filtroDataFim} onChange={(e) => setFiltroDataFim(e.target.value)} className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs" />
              </div>
            </>
          )}
        </div>
      </Card>

      <Card className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] overflow-hidden shadow-sm">
        <div className="p-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] flex items-center justify-between">
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
                <th className="px-6 py-3.5">Nome</th>
                <th className="px-6 py-3.5">Categoria</th>
                <th className="px-6 py-3.5">Cliente/Fornecedor</th>
                <th className="px-6 py-3.5">Pagamento</th>
                <th className="px-6 py-3.5">Vencimento</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Valor</th>
                <th className="px-6 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-0">
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
                  <tr key={item.id} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors group">
                    <td className="px-6 py-4 font-bold text-[var(--color-text-primary)]">
                      <span className="inline-flex items-center gap-1.5">
                        {item.description}
                        <RepeatBadge item={item} />
                      </span>
                      {item.notes && (
                        <p className="text-[10px] font-normal text-[var(--color-text-faint)] mt-0.5 max-w-[220px] truncate" title={item.notes}>{item.notes}</p>
                      )}
                      {item.numero_documento && (
                        <p className="text-[10px] font-normal text-[var(--color-text-faint)] mt-0.5">NF {item.numero_documento}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-[var(--color-text-muted)]">{item.category}</td>
                    <td className="px-6 py-4 text-[var(--color-text-muted)]">{item.counterparty || "—"}</td>
                    <td className="px-6 py-4 text-[var(--color-text-muted)]">{item.payment_method || "—"}</td>
                    <td className="px-6 py-4 text-[var(--color-text-muted)] font-mono">{item.date}</td>
                    <td className="px-6 py-4">
                      <span
                        title="Status travado — use o lápis para editar"
                        className={`inline-flex items-center px-2.5 py-1 text-[10px] font-bold rounded-lg border cursor-default ${getStatusColor(item.status)}`}
                      >
                        {getStatusIcon(item.status)}
                        {item.status}
                        <Lock className="w-2.5 h-2.5 ml-1.5 opacity-60" />
                      </span>
                    </td>
                    <td className={`px-6 py-4 text-right font-mono font-bold ${type === 'Pagar' ? 'text-danger' : 'text-success'}`}>
                      {type === 'Pagar' ? '-' : '+'} {formatCurrency(item.value)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
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
                <td colSpan={6} className="px-6 py-4 text-[var(--color-text-muted)] text-right uppercase tracking-wider text-[10px]">Total:</td>
                <td className={`px-6 py-4 font-mono font-bold text-sm text-right ${type === 'Pagar' ? 'text-danger' : 'text-success'}`}>
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

      <Pagination
        page={page}
        totalPages={totalPages}
        total={filteredTotal}
        pageSize={pageSize}
        loading={entriesLoading}
        onPageChange={setPage}
        itemLabel="lançamento"
      />

      {/* Creation Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetAddForm(); }}
        title={type === 'Pagar' ? 'Novo Gasto / Despesa' : 'Novo Recebimento / Receita'}
        description="Registre um lançamento financeiro no sistema com classificação de categoria e vencimento."
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Nome do Lançamento *</label>
            <input
              type="text"
              required
              placeholder="Ex: Servidor AWS, Licença de Software, Fatura..."
              value={newDesc}
              onChange={(e) => { setNewDesc(e.target.value); setFormErrors(prev => ({ ...prev, desc: undefined })); }}
              className={`w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] ${formErrors.desc ? "border-danger" : "border-[var(--color-border-default)]"}`}
            />
            {formErrors.desc && <p className="text-[10px] text-danger mt-1">{formErrors.desc}</p>}
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Descrição / Observações</label>
            <textarea
              rows={2}
              placeholder="Detalhes adicionais deste lançamento (opcional)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Categoria Financeira *</label>
              {!showNovaCategoria ? (
                <select
                  required
                  value={newCategoryId}
                  onChange={(e) => {
                    if (e.target.value === "__nova__") { setShowNovaCategoria(true); return; }
                    setNewCategoryId(e.target.value);
                    setFormErrors(prev => ({ ...prev, category: undefined }));
                  }}
                  className={`w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer ${formErrors.category ? "border-danger" : "border-[var(--color-border-default)]"}`}
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
                    className="flex-1 min-w-0 bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
                  />
                  <button type="button" onClick={() => setShowNovaCategoria(false)} className="text-xs text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] px-1">✕</button>
                </div>
              )}
              {type === 'Pagar' && showNovaCategoria && (
                <select
                  value={novaCategoriaSubtipo}
                  onChange={(e) => setNovaCategoriaSubtipo(e.target.value as typeof novaCategoriaSubtipo)}
                  className="w-full mt-1.5 bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-1.5 text-[11px] focus:outline-none cursor-pointer"
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
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">{type === 'Pagar' ? 'Fornecedor' : 'Cliente'}</label>
              <input
                type="text"
                list="contatos-sugeridos-new"
                placeholder={type === 'Pagar' ? 'Ex: AWS, Fornecedor X' : 'Ex: Nome do cliente'}
                value={newCounterparty}
                onChange={(e) => setNewCounterparty(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
              <datalist id="contatos-sugeridos-new">
                {contatosSugeridos.map((c: any) => <option key={c.id} value={c.name} />)}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Forma de {type === 'Pagar' ? 'Pagamento' : 'Recebimento'}</label>
              <select
                value={newPaymentMethod}
                onChange={(e) => setNewPaymentMethod(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
              >
                <option value="">Não informado</option>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Nº da Nota Fiscal</label>
              <input
                type="text"
                placeholder="Ex: NF-e 12345"
                value={newNumeroDocumento}
                onChange={(e) => setNewNumeroDocumento(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
              <p className="text-[10px] text-[var(--color-text-faint)] mt-1">O arquivo da nota (PDF/XML) pode ser anexado depois de salvar, em "Editar → Nota Fiscal / Anexos".</p>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Conta Bancária</label>
            <select
              value={newContaBancariaId}
              onChange={(e) => setNewContaBancariaId(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
            >
              <option value="">Não vinculada</option>
              {contasAtivas.map((c: any) => <option key={c.id} value={c.id}>{c.nome}{c.is_principal ? " (Principal)" : ""}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Centro de Custo</label>
              <select
                value={newCentroCustoId}
                onChange={(e) => setNewCentroCustoId(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
              >
                <option value="">Não informado</option>
                {(financeCentrosCusto as any[]).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Tags</label>
              <input
                type="text"
                placeholder="separadas por vírgula"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">
                {newRepeatMode === "parcelado" ? "Valor Total (R$) *" : "Valor (R$) *"}
              </label>
              <input
                type="number"
                required
                step="0.01"
                placeholder="0,00"
                value={newValue}
                onChange={(e) => { setNewValue(e.target.value); setFormErrors(prev => ({ ...prev, value: undefined })); }}
                className={`w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-mono ${formErrors.value ? "border-danger" : "border-[var(--color-border-default)]"}`}
              />
              {formErrors.value && <p className="text-[10px] text-danger mt-1">{formErrors.value}</p>}
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">
                {newRepeatMode === "none" ? "Data de Vencimento" : "1º Vencimento"}
              </label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div className="bg-[var(--color-surface-sunken)]/60 border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] p-3.5 space-y-3">
            <label className="text-xs font-bold text-[var(--color-text-muted)] block">Tipo de lançamento</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setNewRepeatMode("none")}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-[var(--radius-control)] border text-[10px] font-bold uppercase transition-colors cursor-pointer ${newRepeatMode === "none" ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/40 text-[var(--color-primary-blue)]" : "bg-[var(--color-surface)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
              >
                <DollarSign className="w-3.5 h-3.5" /> Único
              </button>
              <button
                type="button"
                onClick={() => setNewRepeatMode("recorrente")}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-[var(--radius-control)] border text-[10px] font-bold uppercase transition-colors cursor-pointer ${newRepeatMode === "recorrente" ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/40 text-[var(--color-primary-blue)]" : "bg-[var(--color-surface)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
              >
                <Repeat className="w-3.5 h-3.5" /> Recorrente
              </button>
              <button
                type="button"
                onClick={() => setNewRepeatMode("parcelado")}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-[var(--radius-control)] border text-[10px] font-bold uppercase transition-colors cursor-pointer ${newRepeatMode === "parcelado" ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/40 text-[var(--color-primary-blue)]" : "bg-[var(--color-surface)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
              >
                <Layers className="w-3.5 h-3.5" /> Parcelado
              </button>
            </div>

            {newRepeatMode === "recorrente" && (
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Frequência</label>
                  <select
                    value={newFrequency}
                    onChange={(e) => setNewFrequency(e.target.value as Frequencia)}
                    className="w-full bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
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
                  <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Repetir por quantas vezes</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={newOcorrencias}
                    onChange={(e) => setNewOcorrencias(e.target.value)}
                    className="w-full bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-mono"
                  />
                </div>
              </div>
            )}

            {newRepeatMode === "parcelado" && (
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Número de Parcelas</label>
                  <input
                    type="number"
                    min={2}
                    max={60}
                    value={newParcelas}
                    onChange={(e) => setNewParcelas(e.target.value)}
                    className="w-full bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Intervalo entre parcelas</label>
                  <select
                    value={newFrequency}
                    onChange={(e) => setNewFrequency(e.target.value as Frequencia)}
                    className="w-full bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
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
              className="h-9 px-4 text-xs font-bold border-[var(--color-border-default)]"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="h-9 px-5 text-xs font-bold shadow-xs"
            >
              Confirmar Lançamento
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        title="Editar Lançamento"
        description="Atualize os dados e o status deste lançamento financeiro."
        maxWidth="max-w-lg"
      >
        <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] w-fit mb-4">
          {([{ id: "detalhes", label: "Detalhes" }, { id: "arquivos", label: "Nota Fiscal / Anexos" }] as const).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setEditModalTab(t.id)}
              className={`px-3 h-7 rounded text-xs font-medium transition-colors cursor-pointer ${editModalTab === t.id ? "bg-[var(--color-primary-blue)] text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
            >
              {t.label}
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
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Nome do Lançamento *</label>
            <input
              type="text"
              required
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Descrição / Observações</label>
            <textarea
              rows={2}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Categoria Financeira *</label>
              <select
                required
                value={editCategoryId}
                onChange={(e) => setEditCategoryId(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
              >
                <option value="">Selecione...</option>
                {categoriasDoTipo.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">{type === 'Pagar' ? 'Fornecedor' : 'Cliente'}</label>
              <input
                type="text"
                list="contatos-sugeridos-edit"
                value={editCounterparty}
                onChange={(e) => setEditCounterparty(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
              <datalist id="contatos-sugeridos-edit">
                {contatosSugeridos.map((c: any) => <option key={c.id} value={c.name} />)}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Forma de {type === 'Pagar' ? 'Pagamento' : 'Recebimento'}</label>
              <select
                value={editPaymentMethod}
                onChange={(e) => setEditPaymentMethod(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
              >
                <option value="">Não informado</option>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Nº da Nota Fiscal</label>
              <input
                type="text"
                placeholder="Ex: NF-e 12345"
                value={editNumeroDocumento}
                onChange={(e) => setEditNumeroDocumento(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Conta Bancária</label>
            <select
              value={editContaBancariaId}
              onChange={(e) => setEditContaBancariaId(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
            >
              <option value="">Não vinculada</option>
              {contasAtivas.map((c: any) => <option key={c.id} value={c.id}>{c.nome}{c.is_principal ? " (Principal)" : ""}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Centro de Custo</label>
              <select
                value={editCentroCustoId}
                onChange={(e) => setEditCentroCustoId(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
              >
                <option value="">Não informado</option>
                {(financeCentrosCusto as any[]).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Tags</label>
              <input
                type="text"
                placeholder="separadas por vírgula"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Valor (R$) *</label>
              <input
                type="number"
                required
                step="0.01"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-mono"
              />
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
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Data de Vencimento</label>
              <input
                type="text"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                placeholder="dd/mm/aaaa"
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
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
                <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Frequência</label>
                <select
                  value={editFrequency}
                  onChange={(e) => setEditFrequency(e.target.value as Frequencia)}
                  className="w-full bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
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
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 flex items-center gap-1.5">
              Status
              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">
                <Lock className="w-2.5 h-2.5" /> só muda por aqui
              </span>
            </label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as "Pago" | "A Vencer" | "Atrasado" | "Pendente")}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
            >
              <option value="A Vencer">A Vencer</option>
              <option value="Pago">Pago</option>
              <option value="Atrasado">Atrasado</option>
              <option value="Pendente">Pendente</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-[var(--color-border-subtle)]">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingItem(null)}
              className="h-9 px-4 text-xs font-bold border-[var(--color-border-default)]"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="h-9 px-5 text-xs font-bold shadow-xs"
            >
              Salvar Alterações
            </Button>
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

      <DrillDownPanel
        isOpen={drillKey !== null}
        onClose={() => setDrillKey(null)}
        title={
          kpis.kind === "pipeline"
            ? (drillKey === "pago" ? "Pago" : drillKey === "aVencer" ? "A Vencer" : drillKey === "atrasado" ? "Atrasado" : drillKey === "pendente" ? "Pendente" : undefined)
            : (drillKey === "mes" ? (type === "Pagar" ? "Gasto no Mês" : "Recebido no Mês") : drillKey === "geral" ? "Total Geral (Histórico)" : undefined)
        }
        rows={
          kpis.kind === "pipeline"
            ? (drillKey === "pago" ? kpis.rowsPago : drillKey === "aVencer" ? kpis.rowsAVencer : drillKey === "atrasado" ? kpis.rowsAtrasado : drillKey === "pendente" ? kpis.rowsPendente : [])
            : (drillKey === "mes" ? kpis.rowsMesAtual : drillKey === "geral" ? kpis.rowsGeral : [])
        }
        columns={drillColumns}
      />
    </PageContainer>
  );
}
