import { useState, useMemo, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Receipt, Plus, QrCode, Copy, CheckCircle2, Clock,
  AlertTriangle, ExternalLink, DollarSign, X, Trash2, Check, Download,
  Send, MessageCircle, Mail, Eye, User, FolderOpen, Landmark, Wallet, CreditCard, Hash, AlignLeft, Calendar, FileText, Save, Info, Loader2
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { Card } from "../../components/ui/card";
import { FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { FinanceKpiFilter } from "./components/FinanceKpiFilter";
import { Modal } from "../../components/ui/modal";
import { Pagination } from "../../components/ui/Pagination";
import { toast } from "sonner";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { FinancePeriodFilter } from "./components/FinancePeriodFilter";
import { useFinanceiroFiltro } from "./FinanceiroFilterContext";
import { parseEntryDate } from "./lib/financeDates";
import { Field, FormSection, InfoRow, ModalFooter, ModalTitle, inputCls, selectCls, textareaCls } from "./components/ModalKit";
import { formatPhone } from "../../lib/utils";

const PAYMENT_METHODS = ["Pix", "Boleto", "Cartão de Crédito", "Cartão de Débito", "Transferência/TED", "Dinheiro", "Cheque", "Outro"];
const todayIso = () => new Date().toISOString().split("T")[0];
const emptyCobranca = () => ({
  cliente: "", valor: "", vencimento: todayIso(), metodo: "Pix", categoryId: "",
  notes: "", numeroDocumento: "", contaBancariaId: "", centroCustoId: "",
});

const PAGE_SIZE = 50;

export default function FinanceiroCobrancas() {
  const { financeEntries, addFinanceEntry, updateFinanceEntry, deleteFinanceEntry, appSettings, clienteBase, financeCategories, financeBankAccounts, financeCentrosCusto } = useData();
  const { user, activeTenantName } = useAuth();
  const { formatCurrency } = useLocalization();
  const { dataInicio, dataFim, label: periodoLabel } = useFinanceiroFiltro();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [metodoFilter, setMetodoFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [novaCobranca, setNovaCobranca] = useState(emptyCobranca);
  const [formErrors, setFormErrors] = useState<{ cliente?: string; valor?: string }>({});
  const [saving, setSaving] = useState(false);
  const [detalhe, setDetalhe] = useState<any | null>(null);
  const categoriasReceita = useMemo(() => (financeCategories as any[]).filter(c => c.tipo === "Receita"), [financeCategories]);
  const contasAtivas = useMemo(() => (financeBankAccounts as any[]).filter(c => !c.arquivada), [financeBankAccounts]);
  const clientesSugeridos = useMemo(() => (clienteBase as any[]).filter(c => c.tipos?.includes("CLIENTE")), [clienteBase]);
  const resolverCliente = (nome: string) => clientesSugeridos.find(c => c.name?.toLowerCase() === nome.trim().toLowerCase()) || null;
  const clienteResolvido = novaCobranca.cliente.trim() ? resolverCliente(novaCobranca.cliente) : null;

  const empresaDados = appSettings?.empresa_dados || {};
  const tenantName = empresaDados?.nomeFantasia || empresaDados?.razaoSocial || activeTenantName || "nossa empresa";

  const [sendingCobranca, setSendingCobranca] = useState<{ id: string; cliente: string; valor: number; vencimento: string; contatoId?: string | null } | null>(null);
  const [sendPhone, setSendPhone] = useState("");
  const [sendEmail, setSendEmail] = useState("");

  const cobrancas = useMemo(() => {
    return financeEntries
      .filter(f => f.type === "Receber")
      .map(f => ({
        id: f.id,
        cliente: f.description,
        valor: f.value,
        vencimento: f.date,
        metodo: f.payment_method || (f.value > 2000 ? "Boleto" : "Pix"),
        status: f.status === "Pago" ? "Liquidada" : "Pendente",
        categoria: f.category,
        contatoId: f.contato_id || null,
        entry: f,
      }));
  }, [financeEntries]);

  // KPIs e tabela seguem o seletor de período do cabeçalho (por vencimento).
  const cobrancasKpis = useMemo(() => {
    const doPeriodo = cobrancas.filter(c => {
      const d = parseEntryDate(c.vencimento);
      return !!d && d >= dataInicio && d <= dataFim;
    });
    const liquidadas = doPeriodo.filter(c => c.status === "Liquidada");
    const pendentes = doPeriodo.filter(c => c.status === "Pendente");
    return {
      valorTotal: doPeriodo.reduce((s, c) => s + c.valor, 0),
      valorLiquidado: liquidadas.reduce((s, c) => s + c.valor, 0),
      valorPendente: pendentes.reduce((s, c) => s + c.valor, 0),
      countLiquidadas: liquidadas.length,
      countPendentes: pendentes.length,
      countPix: doPeriodo.filter(c => c.metodo === "Pix").length,
      count: doPeriodo.length,
    };
  }, [cobrancas, dataInicio, dataFim]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return cobrancas.filter(c => {
      const matchQ = c.cliente.toLowerCase().includes(q) || c.metodo.toLowerCase().includes(q);
      const matchSt = statusFilter === "Todos" || c.status === statusFilter;
      const matchMet = !metodoFilter || c.metodo === metodoFilter;
      const d = parseEntryDate(c.vencimento);
      const matchPeriodo = !!d && d >= dataInicio && d <= dataFim;
      return matchQ && matchSt && matchMet && matchPeriodo;
    });
  }, [cobrancas, search, statusFilter, metodoFilter, dataInicio, dataFim]);

  // Tabela renderizava TODAS as cobranças filtradas de uma vez — com
  // milhares de lançamentos "Receber", trava o navegador. Pagina só a
  // renderização (os dados já estão em memória); exportação CSV continua
  // usando `filtered` completo.
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [search, statusFilter, metodoFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const handleCopyPix = (cliente: string, valor: number) => {
    const pixPayload = `00020126580014br.gov.bcb.pix0136${Math.random().toString(36).substring(2, 15)}520400005303986540${valor.toFixed(2)}5802BR5913SPY GESTAO6009SAO PAULO62070503***6304${Math.floor(1000 + Math.random() * 9000)}`;
    navigator.clipboard.writeText(pixPayload);
    toast.success(`Chave Copia e Cola Pix gerada para ${cliente}!`);
  };

  const openSendCobranca = (c: { id: string; cliente: string; valor: number; vencimento: string; contatoId?: string | null }) => {
    setSendingCobranca(c);
    // Se a cobrança está ligada a um Contato cadastrado, aproveita o telefone/e-mail dele.
    const contato = c.contatoId ? (clienteBase as any[]).find(x => x.id === c.contatoId) : resolverCliente(c.cliente);
    setSendPhone(contato?.phone ? formatPhone(contato.phone) : "");
    setSendEmail(contato?.email || "");
  };

  const buildCobrancaMessage = (c: { cliente: string; valor: number; vencimento: string }) => {
    const valorFmt = formatCurrency(c.valor);
    const vencFmt = (() => {
      try { return new Date(c.vencimento).toLocaleDateString("pt-BR"); } catch { return c.vencimento; }
    })();
    return `Olá, ${c.cliente}! Aqui é da ${tenantName}. Passando para lembrar da cobrança no valor de ${valorFmt}, com vencimento em ${vencFmt}. Qualquer dúvida, estamos à disposição!`;
  };

  const handleSendWhatsApp = () => {
    if (!sendingCobranca) return;
    const digits = sendPhone.replace(/\D/g, "");
    if (digits.length < 10) {
      toast.error("Informe o WhatsApp do cliente com DDD.");
      return;
    }
    const phone = digits.length <= 11 ? `55${digits}` : digits;
    const text = encodeURIComponent(buildCobrancaMessage(sendingCobranca));
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank", "noopener,noreferrer");
    toast.success("WhatsApp aberto com a mensagem de cobrança pronta para enviar.");
  };

  const handleSendEmail = () => {
    if (!sendingCobranca) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sendEmail.trim())) {
      toast.error("Informe um e-mail válido do cliente.");
      return;
    }
    const subject = encodeURIComponent(`Cobrança ${tenantName} — ${sendingCobranca.cliente}`);
    const body = encodeURIComponent(buildCobrancaMessage(sendingCobranca));
    window.open(`mailto:${sendEmail.trim()}?subject=${subject}&body=${body}`, "_blank");
    toast.success("Cliente de e-mail aberto com a cobrança pronta para enviar.");
  };

  const handleToggleStatus = (id: string, currentStatus: string) => {
    const nextStatus: "Pago" | "A Vencer" = currentStatus === "Liquidada" || currentStatus === "Pago" ? "A Vencer" : "Pago";
    updateFinanceEntry(id, { status: nextStatus });
    toast.success(nextStatus === "Pago" ? "Cobrança marcada como Liquidada!" : "Cobrança retornada para A Vencer.");
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Cancelar Cobrança",
      message: "Deseja realmente excluir este título a receber?",
      confirmText: "Sim, Excluir",
      cancelText: "Voltar",
      variant: "danger",
    });
    if (!ok) return;

    deleteFinanceEntry(id);
    toast.success("Cobrança removida.");
  };

  const closeNovaCobranca = () => { if (saving) return; setShowModal(false); setNovaCobranca(emptyCobranca()); setFormErrors({}); };

  const handleCreateCobranca = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof formErrors = {};
    if (!novaCobranca.cliente.trim()) errs.cliente = "Informe o cliente / sacado.";
    const val = parseFloat(novaCobranca.valor) || 0;
    if (val <= 0) errs.valor = "Informe um valor maior que zero.";
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const categoria = categoriasReceita.find(c => c.id === novaCobranca.categoryId);
    const contato = resolverCliente(novaCobranca.cliente);
    setSaving(true);
    try {
      await addFinanceEntry({
        description: novaCobranca.cliente.trim(),
        counterparty: novaCobranca.cliente.trim(),
        contato_id: contato?.id || null,
        value: val,
        type: "Receber",
        category: categoria?.nome || "Serviços / Honorários",
        category_id: categoria?.id || null,
        date: novaCobranca.vencimento || todayIso(),
        status: "A Vencer",
        payment_method: novaCobranca.metodo || null,
        notes: novaCobranca.notes.trim() || null,
        numero_documento: novaCobranca.numeroDocumento.trim() || null,
        conta_bancaria_id: novaCobranca.contaBancariaId || null,
        centro_custo_id: novaCobranca.centroCustoId || null,
      });
      toast.success("Cobrança emitida e vinculada ao Contas a Receber!");
      setShowModal(false);
      setNovaCobranca(emptyCobranca());
      setFormErrors({});
    } finally {
      setSaving(false);
    }
  };

  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast.info("Nenhuma cobrança para exportar.");
      return;
    }
    const headers = ["Cliente / Sacado", "Valor (R$)", "Vencimento", "Método", "Status", "Categoria"];
    const rows = filtered.map(c => [
      `"${c.cliente.replace(/"/g, '""')}"`,
      c.valor,
      `"${c.vencimento}"`,
      `"${c.metodo}"`,
      `"${c.status}"`,
      `"${(c.categoria || "").replace(/"/g, '""')}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `cobrancas_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Cobranças exportadas com sucesso!");
  };

  return (
    <PageContainer
      title="Gestão de Cobranças & Faturamento"
      description="Emissão e acompanhamento de faturas, boletos bancários e cobranças via Pix com conciliação automática."
      actions={
        <div className="flex items-center gap-2">
          <FinancePeriodFilter />
          <Button
            onClick={handleExportCSV}
            variant="outline"
            className="h-9 px-3.5 text-xs font-bold gap-1.5 border-[var(--color-border-default)]"
          >
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </Button>
          <Button
            onClick={() => setShowModal(true)}
            className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs bg-[var(--color-primary-blue)] text-white hover:opacity-95"
          >
            <Plus className="w-3.5 h-3.5" /> Nova Cobrança
          </Button>
        </div>
      }
    >
      {/* KPIs recortadas pelo filtro global de período (vencimento); busca/status/método filtram só a tabela */}
      <FinanceKpiFilter
        id="finCobrancas"
        className="mb-6"
        kpis={[
          { icon: Receipt, label: `Emitido (${periodoLabel})`, value: formatCurrency(cobrancasKpis.valorTotal), hint: `${cobrancasKpis.count} cobrança(s)`, tone: "primary" },
          { icon: CheckCircle2, label: "Liquidadas", value: formatCurrency(cobrancasKpis.valorLiquidado), hint: `${cobrancasKpis.countLiquidadas} cobrança(s)`, tone: "success" },
          { icon: Clock, label: "Pendentes", value: formatCurrency(cobrancasKpis.valorPendente), hint: `${cobrancasKpis.countPendentes} cobrança(s)`, tone: "warning" },
          { icon: QrCode, label: "Cobranças Pix", value: cobrancasKpis.countPix, hint: "por quantidade", tone: "neutral" },
        ]}
        activeCount={(search ? 1 : 0) + (statusFilter !== "Todos" ? 1 : 0) + (metodoFilter ? 1 : 0)}
        onClear={() => { setSearch(""); setStatusFilter("Todos"); setMetodoFilter(""); }}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar cobrança por cliente ou método..." />
          <FilterSelect icon={QrCode} value={metodoFilter} onChange={setMetodoFilter} options={Array.from(new Set(cobrancas.map(c => c.metodo))).sort()} allLabel="Todos os métodos" />
          <FilterChips value={statusFilter} onChange={setStatusFilter} allValue="Todos" allLabel="Todos" options={["Liquidada", "Pendente"]} />
        </FilterBar>
      </FinanceKpiFilter>

      {(cobrancasKpis.valorLiquidado > 0 || cobrancasKpis.valorPendente > 0) && (
        <Card className="p-4 bg-[var(--color-surface-elevated)]/40 border border-[var(--color-border-subtle)] mb-6">
          <h3 className="text-xs font-bold text-[var(--color-text-primary)] mb-2">Liquidado x Pendente (por valor)</h3>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: "Liquidado", value: cobrancasKpis.valorLiquidado, fill: "var(--color-success)" },
                    { name: "Pendente", value: cobrancasKpis.valorPendente, fill: "var(--color-warning)" },
                  ]}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={35}
                  outerRadius={60}
                  paddingAngle={2}
                >
                  <Cell fill="var(--color-success)" />
                  <Cell fill="var(--color-warning)" />
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-control)" }} itemStyle={{ fontSize: "11px" }} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Table */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]/60 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                <th className="px-5 py-3">Cliente / Sacado</th>
                <th className="px-4 py-3">Método</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {pageItems.map(c => (
                <tr key={c.id} className="hover:bg-[var(--color-surface-sunken)]/40 transition-colors">
                  <td className="px-5 py-3.5 font-bold text-[var(--color-text-primary)]"><button type="button" onClick={() => setDetalhe(c)} className="text-left hover:text-[var(--color-primary-blue)] cursor-pointer">{c.cliente}</button></td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">
                      {c.metodo}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-[var(--color-text-muted)]">{c.vencimento}</td>
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => handleToggleStatus(c.id, c.status)}
                      className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border transition-all inline-flex items-center gap-1 ${
                        c.status === "Liquidada"
                          ? "bg-success/10 text-success border-success/20 hover:bg-success/20"
                          : "bg-warning/10 text-warning border-warning/20 hover:bg-warning/20"
                      }`}
                      title="Clique para alternar o status"
                    >
                      {c.status === "Liquidada" ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {c.status}
                    </button>
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-[var(--color-text-primary)] font-mono">
                    {formatCurrency(c.valor)}
                  </td>
                  <td className="px-5 py-3.5 text-right flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => setDetalhe(c)}
                      title="Ver detalhes da cobrança"
                      className="p-1 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleCopyPix(c.cliente, c.valor)}
                      className="px-2.5 py-1 rounded-lg bg-[var(--color-surface-sunken)] hover:bg-[var(--color-primary-blue)] hover:text-white border border-[var(--color-border-default)] text-[11px] font-bold transition-all inline-flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> Pix
                    </button>
                    <button
                      onClick={() => openSendCobranca(c)}
                      title="Enviar cobrança por WhatsApp ou E-mail"
                      className="px-2.5 py-1 rounded-lg bg-[var(--color-primary-blue)]/10 hover:bg-[var(--color-primary-blue)]/20 border border-[var(--color-primary-blue)]/30 text-[var(--color-primary-blue)] text-[11px] font-bold transition-all inline-flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" /> Enviar
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="p-1 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-danger hover:bg-danger/10 hover:border-danger/25 transition-colors"
                      title="Excluir Cobrança"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[var(--color-text-muted)]">
                    Nenhuma cobrança encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="cobrança" />

      <Modal
        isOpen={showModal}
        onClose={closeNovaCobranca}
        title={<ModalTitle icon={Receipt} tone="success" title="Nova Cobrança" subtitle="Emita um título a receber — ele entra direto em Contas a Receber." />}
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleCreateCobranca} className="space-y-4" noValidate>
          <FormSection icon={User} title="Cliente e valor">
            <Field
              label="Cliente / sacado"
              icon={User}
              required
              error={formErrors.cliente}
              hint={novaCobranca.cliente.trim() ? (clienteResolvido ? "Cliente cadastrado: a cobrança será vinculada ao contato." : "Não está nos Contatos: será salvo só como nome.") : "Digite ou escolha um cliente cadastrado."}
            >
              <input
                list="cobranca-clientes"
                autoFocus
                value={novaCobranca.cliente}
                onChange={e => { setNovaCobranca({ ...novaCobranca, cliente: e.target.value }); setFormErrors(p => ({ ...p, cliente: undefined })); }}
                placeholder="Nome do cliente ou empresa"
                className={inputCls(!!formErrors.cliente)}
              />
              <datalist id="cobranca-clientes">{clientesSugeridos.map((c: any) => <option key={c.id} value={c.name} />)}</datalist>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Valor (R$)" icon={DollarSign} required error={formErrors.valor}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={novaCobranca.valor}
                  onChange={e => { setNovaCobranca({ ...novaCobranca, valor: e.target.value }); setFormErrors(p => ({ ...p, valor: undefined })); }}
                  placeholder="1500,00"
                  className={`${inputCls(!!formErrors.valor)} font-mono`}
                />
              </Field>
              <Field label="Vencimento" icon={Calendar} hint={!novaCobranca.vencimento ? "Em branco = hoje." : undefined}>
                <input type="date" value={novaCobranca.vencimento} onChange={e => setNovaCobranca({ ...novaCobranca, vencimento: e.target.value })} className={inputCls()} />
              </Field>
            </div>
          </FormSection>

          <FormSection icon={CreditCard} title="Cobrança">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Forma de recebimento" icon={CreditCard} hint="Fica gravada no lançamento.">
                <select value={novaCobranca.metodo} onChange={e => setNovaCobranca({ ...novaCobranca, metodo: e.target.value })} className={selectCls()}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Categoria" icon={FolderOpen} hint={categoriasReceita.length === 0 ? "Nenhuma categoria de receita cadastrada." : undefined}>
                <select value={novaCobranca.categoryId} onChange={e => setNovaCobranca({ ...novaCobranca, categoryId: e.target.value })} className={selectCls()}>
                  <option value="">Padrão (Serviços / Honorários)</option>
                  {categoriasReceita.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Field>
              <Field label="Conta bancária" icon={Landmark}>
                <select value={novaCobranca.contaBancariaId} onChange={e => setNovaCobranca({ ...novaCobranca, contaBancariaId: e.target.value })} className={selectCls()}>
                  <option value="">Não vinculada</option>
                  {contasAtivas.map((c: any) => <option key={c.id} value={c.id}>{c.nome}{c.is_principal ? " (Principal)" : ""}</option>)}
                </select>
              </Field>
              <Field label="Centro de custo" icon={Wallet}>
                <select value={novaCobranca.centroCustoId} onChange={e => setNovaCobranca({ ...novaCobranca, centroCustoId: e.target.value })} className={selectCls()}>
                  <option value="">Não informado</option>
                  {(financeCentrosCusto as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Field>
              <Field label="Nº da nota fiscal / documento" icon={Hash} className="sm:col-span-2">
                <input value={novaCobranca.numeroDocumento} onChange={e => setNovaCobranca({ ...novaCobranca, numeroDocumento: e.target.value })} placeholder="Ex: NF-e 12345" className={inputCls()} />
              </Field>
            </div>
            <Field label="Observações" icon={AlignLeft} hint={`${novaCobranca.notes.length}/500`}>
              <textarea rows={2} maxLength={500} value={novaCobranca.notes} onChange={e => setNovaCobranca({ ...novaCobranca, notes: e.target.value })} placeholder="Detalhes da cobrança (opcional)" className={textareaCls} />
            </Field>
          </FormSection>

          {(parseFloat(novaCobranca.valor) || 0) > 0 && (
            <div className="rounded-xl border border-[var(--color-primary-blue)]/20 bg-[var(--color-primary-blue)]/[0.05] p-3 text-xs text-[var(--color-text-primary)] flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-[var(--color-primary-blue)] shrink-0 mt-0.5" />
              <span>Será emitida uma cobrança de <b className="font-mono">{formatCurrency(parseFloat(novaCobranca.valor) || 0)}</b> via <b>{novaCobranca.metodo}</b> com vencimento em <b>{(novaCobranca.vencimento ? new Date(novaCobranca.vencimento + "T12:00:00") : new Date()).toLocaleDateString("pt-BR")}</b>, com status “A Vencer”.</span>
            </div>
          )}

          <ModalFooter onCancel={closeNovaCobranca} saving={saving} submitLabel="Emitir cobrança" submitIcon={Save} />
        </form>
      </Modal>

      {/* Detalhes da cobrança */}
      <Modal
        isOpen={!!detalhe}
        onClose={() => setDetalhe(null)}
        title={<ModalTitle icon={Receipt} tone={detalhe?.status === "Liquidada" ? "success" : "warning"} title={detalhe?.cliente || "Cobrança"} subtitle="Detalhes da cobrança" />}
        maxWidth="max-w-lg"
      >
        {detalhe && (() => {
          const e = detalhe.entry || {};
          const venc = parseEntryDate(detalhe.vencimento);
          const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
          const diasAtraso = venc && detalhe.status === "Pendente" && venc < hoje ? Math.floor((hoje.getTime() - venc.getTime()) / 86400000) : 0;
          const conta = e.conta_bancaria_id ? (financeBankAccounts as any[]).find(c => c.id === e.conta_bancaria_id)?.nome : null;
          const centro = e.centro_custo_id ? (financeCentrosCusto as any[]).find(c => c.id === e.centro_custo_id)?.nome : null;
          const contato = e.contato_id ? (clienteBase as any[]).find(c => c.id === e.contato_id) : null;
          return (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]/60 p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Valor</div>
                  <div className="text-xl font-black font-mono text-[var(--color-text-primary)]">{formatCurrency(detalhe.valor)}</div>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border inline-flex items-center gap-1 ${detalhe.status === "Liquidada" ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"}`}>
                  {detalhe.status === "Liquidada" ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                  {detalhe.status}
                </span>
              </div>
              {diasAtraso > 0 && (
                <p className="text-[11px] text-danger flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Vencida há {diasAtraso} dia(s).</p>
              )}
              <FormSection icon={FileText} title="Informações">
                <div className="space-y-2">
                  <InfoRow label="Vencimento" value={venc ? venc.toLocaleDateString("pt-BR") : detalhe.vencimento} />
                  <InfoRow label="Forma de recebimento" value={detalhe.metodo} />
                  <InfoRow label="Categoria" value={detalhe.categoria} />
                  <InfoRow label="Contato vinculado" value={contato ? `${contato.name}${contato.phone ? ` · ${contato.phone}` : ""}` : e.counterparty} />
                  <InfoRow label="Conta bancária" value={conta} />
                  <InfoRow label="Centro de custo" value={centro} />
                  <InfoRow label="Nº da nota / documento" value={e.numero_documento} mono />
                  {e.installment_total ? <InfoRow label="Parcela" value={`${e.installment_number} de ${e.installment_total}`} /> : null}
                  {e.is_recurring ? <InfoRow label="Recorrência" value={e.recurring_frequency} /> : null}
                </div>
                {e.notes && <p className="text-xs text-[var(--color-text-muted)] whitespace-pre-wrap border-t border-[var(--color-border-subtle)] pt-2">{e.notes}</p>}
              </FormSection>
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--color-border-subtle)] flex-wrap">
                <Button type="button" variant="outline" onClick={() => { handleToggleStatus(detalhe.id, detalhe.status); setDetalhe(null); }} className="h-9 px-3 text-xs font-bold gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {detalhe.status === "Liquidada" ? "Voltar para A Vencer" : "Marcar como liquidada"}
                </Button>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => { setDetalhe(null); setShowModal(true); }} className="h-9 px-3 text-xs font-bold gap-1.5"><Plus className="w-3.5 h-3.5" /> Nova cobrança</Button>
                  <Button type="button" variant="outline" onClick={() => handleCopyPix(detalhe.cliente, detalhe.valor)} className="h-9 px-3 text-xs font-bold gap-1.5"><Copy className="w-3.5 h-3.5" /> Pix</Button>
                  <Button type="button" onClick={() => { const c = detalhe; setDetalhe(null); openSendCobranca(c); }} className="h-9 px-4 text-xs font-bold gap-1.5"><Send className="w-3.5 h-3.5" /> Enviar</Button>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal
        isOpen={!!sendingCobranca}
        onClose={() => setSendingCobranca(null)}
        title={<ModalTitle icon={Send} title="Enviar Cobrança ao Cliente" subtitle="Abre a mensagem pronta no WhatsApp ou no seu e-mail." />}
        maxWidth="max-w-lg"
      >
        {sendingCobranca && (
          <div className="space-y-4">
            <FormSection icon={MessageCircle} title="Mensagem">
              <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-muted)] leading-relaxed whitespace-pre-wrap">
                {buildCobrancaMessage(sendingCobranca)}
              </div>
              <p className="text-[10px] text-[var(--color-text-faint)]">O envio é feito por você, no app aberto: nada é enviado automaticamente.</p>
            </FormSection>

            <FormSection icon={Send} title="Destinatário">
              <Field label="WhatsApp do cliente" icon={MessageCircle} hint={sendPhone ? undefined : "Informe com DDD."}>
                <div className="flex gap-2">
                  <input value={sendPhone} onChange={e => setSendPhone(formatPhone(e.target.value))} inputMode="tel" placeholder="(00) 00000-0000" className={`${inputCls()} font-mono flex-1`} />
                  <Button type="button" onClick={handleSendWhatsApp} className="h-9 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shrink-0">
                    <Send className="w-3.5 h-3.5" /> WhatsApp
                  </Button>
                </div>
              </Field>
              <Field label="E-mail do cliente" icon={Mail}>
                <div className="flex gap-2">
                  <input type="email" value={sendEmail} onChange={e => setSendEmail(e.target.value)} placeholder="cliente@empresa.com" className={`${inputCls()} flex-1`} />
                  <Button type="button" onClick={handleSendEmail} variant="outline" className="h-9 text-xs font-bold gap-1.5 shrink-0">
                    <Send className="w-3.5 h-3.5" /> E-mail
                  </Button>
                </div>
              </Field>
              {(sendPhone || sendEmail) && sendingCobranca.contatoId && <p className="text-[10px] text-[var(--color-text-faint)]">Preenchido a partir do contato cadastrado.</p>}
            </FormSection>

            <div className="flex justify-end pt-3 border-t border-[var(--color-border-subtle)]">
              <Button type="button" variant="outline" onClick={() => setSendingCobranca(null)} className="h-9 px-4 text-xs font-bold border-[var(--color-border-default)]">Fechar</Button>
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}
