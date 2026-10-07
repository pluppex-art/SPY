import { useState, useMemo, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Receipt, Plus, QrCode, Copy, CheckCircle2, Clock,
  AlertTriangle, ExternalLink, DollarSign, X, Trash2, Check, Download,
  Send, MessageCircle, Mail
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

const PAGE_SIZE = 50;

export default function FinanceiroCobrancas() {
  const { financeEntries, addFinanceEntry, updateFinanceEntry, deleteFinanceEntry, appSettings } = useData();
  const { user, activeTenantName } = useAuth();
  const { formatCurrency } = useLocalization();
  const { dataInicio, dataFim, label: periodoLabel } = useFinanceiroFiltro();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [metodoFilter, setMetodoFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [novaCobranca, setNovaCobranca] = useState({
    cliente: "",
    valor: "",
    vencimento: new Date().toISOString().split("T")[0],
    metodo: "Pix",
    categoria: "Receita de Vendas",
  });

  const empresaDados = appSettings?.empresa_dados || {};
  const tenantName = empresaDados?.nomeFantasia || empresaDados?.razaoSocial || activeTenantName || "nossa empresa";

  const [sendingCobranca, setSendingCobranca] = useState<{ id: string; cliente: string; valor: number; vencimento: string } | null>(null);
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
        metodo: f.value > 2000 ? "Boleto" : "Pix",
        status: f.status === "Pago" ? "Liquidada" : "Pendente",
        categoria: f.category,
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

  const openSendCobranca = (c: { id: string; cliente: string; valor: number; vencimento: string }) => {
    setSendingCobranca(c);
    setSendPhone("");
    setSendEmail("");
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
    if (!digits) {
      toast.error("Informe o número de WhatsApp do cliente.");
      return;
    }
    const phone = digits.length <= 11 ? `55${digits}` : digits;
    const text = encodeURIComponent(buildCobrancaMessage(sendingCobranca));
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank", "noopener,noreferrer");
    toast.success("WhatsApp aberto com a mensagem de cobrança pronta para enviar.");
  };

  const handleSendEmail = () => {
    if (!sendingCobranca) return;
    if (!sendEmail.trim()) {
      toast.error("Informe o e-mail do cliente.");
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

  const handleCreateCobranca = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaCobranca.cliente.trim()) {
      toast.error("Informe o cliente / sacado.");
      return;
    }
    const val = parseFloat(novaCobranca.valor.replace(/\./g, "").replace(",", ".")) || 0;
    if (val <= 0) {
      toast.error("Informe um valor positivo.");
      return;
    }

    addFinanceEntry({
      description: novaCobranca.cliente.trim(),
      value: val,
      type: "Receber",
      category: novaCobranca.categoria || "Serviços / Honorários",
      date: novaCobranca.vencimento,
      status: "A Vencer",
    });

    toast.success("Cobrança emitida e vinculada ao Contas a Receber!");
    setShowModal(false);
    setNovaCobranca({
      cliente: "",
      valor: "",
      vencimento: new Date().toISOString().split("T")[0],
      metodo: "Pix",
      categoria: "Receita de Vendas",
    });
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
          <FilterSelect icon={QrCode} value={metodoFilter} onChange={setMetodoFilter} options={["Pix", "Boleto"]} allLabel="Todos os métodos" />
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
                  <td className="px-5 py-3.5 font-bold text-[var(--color-text-primary)]">{c.cliente}</td>
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
        onClose={() => setShowModal(false)}
        title="Nova Cobrança"
        description="Emita uma nova ordem de cobrança via Pix, Boleto ou Cartão com conciliação automática."
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateCobranca} className="space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">
              Cliente / Sacado *
            </label>
            <input
              value={novaCobranca.cliente}
              onChange={e => setNovaCobranca({ ...novaCobranca, cliente: e.target.value })}
              placeholder="Nome do cliente ou empresa"
              required
              className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">
                Valor (R$) *
              </label>
              <input
                value={novaCobranca.valor}
                onChange={e => setNovaCobranca({ ...novaCobranca, valor: e.target.value })}
                placeholder="1500.00"
                required
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] font-mono focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">
                Método
              </label>
              <select
                value={novaCobranca.metodo}
                onChange={e => setNovaCobranca({ ...novaCobranca, metodo: e.target.value })}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              >
                <option value="Pix">Pix Dinâmico</option>
                <option value="Boleto">Boleto Bancário</option>
                <option value="Cartao">Cartão de Crédito</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">
                Vencimento
              </label>
              <input
                type="date"
                value={novaCobranca.vencimento}
                onChange={e => setNovaCobranca({ ...novaCobranca, vencimento: e.target.value })}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">
                Categoria
              </label>
              <input
                value={novaCobranca.categoria}
                onChange={e => setNovaCobranca({ ...novaCobranca, categoria: e.target.value })}
                placeholder="Honorários, Produtos..."
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border-subtle)]">
            <Button type="button" variant="ghost" onClick={() => setShowModal(false)} className="text-xs">
              Cancelar
            </Button>
            <Button type="submit" className="text-xs font-bold bg-[var(--color-primary-blue)] text-white">
              Emitir Cobrança
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!sendingCobranca}
        onClose={() => setSendingCobranca(null)}
        title="Enviar Cobrança ao Cliente"
        description="Monta a mensagem de cobrança e abre pronta no WhatsApp ou no seu e-mail para envio."
        maxWidth="max-w-md"
      >
        {sendingCobranca && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-muted)] leading-relaxed whitespace-pre-wrap">
              {buildCobrancaMessage(sendingCobranca)}
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] flex items-center gap-1.5 mb-1">
                <MessageCircle className="w-3 h-3" /> WhatsApp do Cliente
              </label>
              <div className="flex gap-2">
                <input
                  value={sendPhone}
                  onChange={e => setSendPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                  className="flex-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] font-mono focus:outline-none focus:border-[var(--color-primary-blue)]"
                />
                <Button type="button" onClick={handleSendWhatsApp} className="text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shrink-0">
                  <Send className="w-3.5 h-3.5" /> WhatsApp
                </Button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] flex items-center gap-1.5 mb-1">
                <Mail className="w-3 h-3" /> E-mail do Cliente
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={sendEmail}
                  onChange={e => setSendEmail(e.target.value)}
                  placeholder="cliente@empresa.com"
                  className="flex-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
                />
                <Button type="button" onClick={handleSendEmail} variant="outline" className="text-xs font-bold gap-1.5 shrink-0">
                  <Send className="w-3.5 h-3.5" /> E-mail
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}
