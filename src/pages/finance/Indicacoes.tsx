import { useMemo, useState } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { FinanceKpiFilter } from "./components/FinanceKpiFilter";
import { FinancePeriodFilter } from "./components/FinancePeriodFilter";
import { useFinanceiroFiltro } from "./FinanceiroFilterContext";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { downloadCsv } from "../../lib/csvExport";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from "recharts";
import {
  Plus, X, Trash2, Download, CheckCircle2, Clock, XCircle, DollarSign,
  UserPlus, Share2, Copy, ExternalLink, QrCode, Send, MessageCircle, Link, Check, Users, BarChart3,
  Pencil, User, Phone, Mail, Calendar, AlignLeft, Save, Info, Eye
} from "lucide-react";
import type { Indicacao } from "../../contexts/DataContextTypes";
import { Field, FormSection, ModalFooter, ModalTitle, inputCls, selectCls, textareaCls } from "./components/ModalKit";
import { formatPhone } from "../../lib/utils";
import { ViewModal } from "./components/ViewModal";

const DEFAULT_COMMISSION_KEY = "indicacao_comissao_padrao";
const AFFILIATES_KEY = "afiliados_sistema";

const STATUS_FLOW: Record<string, string> = {
  Pendente: "Aprovada",
  Aprovada: "Paga",
  Paga: "Pendente",
  Cancelada: "Pendente",
};

function statusStyle(status: string) {
  switch (status) {
    case "Paga": return "bg-success/10 text-success border-success/30";
    case "Aprovada": return "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/30";
    case "Cancelada": return "bg-danger/10 text-danger border-danger/30";
    default: return "bg-warning/10 text-warning border-warning/30";
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "Paga": return <CheckCircle2 className="w-3 h-3 mr-1" />;
    case "Cancelada": return <XCircle className="w-3 h-3 mr-1" />;
    default: return <Clock className="w-3 h-3 mr-1" />;
  }
}
import { useRowOpen } from "./components/useRowOpen";

export default function Indicacoes() {
  const {
    indicacoes, addIndicacao, updateIndicacao, deleteIndicacao,
    colaboradores, clienteBase, appSettings, saveAppSetting, addLead
  } = useData();
  const { formatCurrency } = useLocalization();
  const currency = (v: number) => formatCurrency(v || 0);

  // Modais
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAffiliateModalOpen, setIsAffiliateModalOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);

  // Manual Indicação Form
  const [referrerType, setReferrerType] = useState<"colaborador" | "cliente">("colaborador");
  const [referrerId, setReferrerId] = useState("");
  const [referredName, setReferredName] = useState("");
  const [referredContact, setReferredContact] = useState("");
  const [commissionValue, setCommissionValue] = useState("");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Indicacao | null>(null);
  const rowOpen = useRowOpen<Indicacao>(setViewing, (x) => openEdit(x));
  const [dateIndicated, setDateIndicated] = useState("");
  const [datePaid, setDatePaid] = useState("");
  const [statusEdit, setStatusEdit] = useState<Indicacao["status"]>("Pendente");
  const [formErrors, setFormErrors] = useState<{ referrer?: string; referred?: string; commission?: string }>({});
  const [affCodeTouched, setAffCodeTouched] = useState(false);
  const [affErrors, setAffErrors] = useState<{ name?: string; code?: string; email?: string; phone?: string }>({});
  const [savingAff, setSavingAff] = useState(false);
  const [previewErrors, setPreviewErrors] = useState<{ name?: string; phone?: string; email?: string }>({});

  // Default Commission State
  const defaultCommission = Number(appSettings?.[DEFAULT_COMMISSION_KEY] ?? 0);
  const [editingDefault, setEditingDefault] = useState(false);
  const [defaultDraft, setDefaultDraft] = useState(String(defaultCommission || ""));

  // Affiliate Cadastro Form
  const [affName, setAffName] = useState("");
  const [affEmail, setAffEmail] = useState("");
  const [affPhone, setAffPhone] = useState("");
  const [affPix, setAffPix] = useState("");
  const [affCode, setAffCode] = useState("");
  const [affCommission, setAffCommission] = useState("");

  // Public Form Preview inside Link Modal
  const [previewLeadName, setPreviewLeadName] = useState("");
  const [previewLeadPhone, setPreviewLeadPhone] = useState("");
  const [previewLeadEmail, setPreviewLeadEmail] = useState("");
  const [previewLeadCompany, setPreviewLeadCompany] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  // Selected affiliate in Link modal
  const affiliates: any[] = useMemo(() => {
    return Array.isArray(appSettings?.[AFFILIATES_KEY]) ? appSettings[AFFILIATES_KEY] : [];
  }, [appSettings]);

  const [selectedAffiliateCode, setSelectedAffiliateCode] = useState<string>("");

  const currentAffiliate = useMemo(() => {
    return affiliates.find((a: any) => a.code === selectedAffiliateCode) || affiliates[0] || null;
  }, [affiliates, selectedAffiliateCode]);

  const currentReferralUrl = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://app.axis.com";
    const code = currentAffiliate ? currentAffiliate.code : "oficial";
    return `${origin}/indicacao?ref=${encodeURIComponent(code)}`;
  }, [currentAffiliate]);

  const { dataInicio, dataFim } = useFinanceiroFiltro();
  const [busca, setBusca] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [indicadorFilter, setIndicadorFilter] = useState("");
  const indicadores = useMemo(
    () => Array.from(new Set(indicacoes.map(i => i.referrer_name).filter(Boolean))).sort() as string[],
    [indicacoes]
  );
  // Indicações dentro do período escolhido no cabeçalho (por data da indicação).
  const indicacoesNoPeriodo = useMemo(() => indicacoes.filter(i => {
    if (!i.date_indicated) return true;
    const d = new Date(i.date_indicated.length <= 10 ? i.date_indicated + "T12:00:00" : i.date_indicated);
    return isNaN(d.getTime()) || (d >= dataInicio && d <= dataFim);
  }), [indicacoes, dataInicio, dataFim]);
  const indicacoesFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return indicacoesNoPeriodo.filter(i => {
      if (statusFilter && i.status !== statusFilter) return false;
      if (indicadorFilter && i.referrer_name !== indicadorFilter) return false;
      if (!q) return true;
      return (i.referrer_name || "").toLowerCase().includes(q) || (i.referred_name || "").toLowerCase().includes(q) || (i.referred_contact || "").toLowerCase().includes(q);
    });
  }, [indicacoesNoPeriodo, busca, statusFilter, indicadorFilter]);

  const kpis = useMemo(() => {
    const total = indicacoesNoPeriodo.length;
    const pendentes = indicacoesNoPeriodo.filter(i => i.status === "Pendente" || i.status === "Aprovada").length;
    const totalPago = indicacoesNoPeriodo.filter(i => i.status === "Paga").reduce((acc, i) => acc + Number(i.commission_value || 0), 0);
    const totalPendente = indicacoesNoPeriodo.filter(i => i.status === "Pendente" || i.status === "Aprovada").reduce((acc, i) => acc + Number(i.commission_value || 0), 0);
    return { total, pendentes, totalPago, totalPendente };
  }, [indicacoesNoPeriodo]);

  const STATUS_COLORS: Record<string, string> = {
    Pendente: "var(--color-warning)", Aprovada: "var(--color-primary-blue)", Paga: "var(--color-success)", Cancelada: "var(--color-danger)",
  };
  const statusBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of indicacoesNoPeriodo) counts.set(i.status, (counts.get(i.status) || 0) + 1);
    return Array.from(counts.entries()).map(([status, count]) => ({ status, count, fill: STATUS_COLORS[status] || "var(--color-text-faint)" }));
  }, [indicacoesNoPeriodo]);

  const referrerOptions = referrerType === "colaborador" ? colaboradores : clienteBase;
  const referrerNomeSelecionado = (() => {
    const r: any = referrerOptions.find((x: any) => x.id === referrerId);
    return referrerType === "colaborador" ? r?.nome : r?.name;
  })();
  const affCodeClean = affCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const resetForm = () => {
    setEditingId(null);
    setReferrerType("colaborador");
    setReferrerId("");
    setReferredName("");
    setReferredContact("");
    setCommissionValue(String(defaultCommission || ""));
    setNotes("");
    setDateIndicated(new Date().toISOString().split("T")[0]);
    setDatePaid("");
    setStatusEdit("Pendente");
    setFormErrors({});
  };

  const openModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (item: Indicacao) => {
    setEditingId(item.id);
    setReferrerType(item.referrer_type);
    setReferrerId((item.referrer_type === "colaborador" ? item.referrer_colaborador_id : item.referrer_cliente_id) || "");
    setReferredName(item.referred_name || "");
    setReferredContact(item.referred_contact || "");
    setCommissionValue(String(item.commission_value ?? ""));
    setNotes(item.notes || "");
    setDateIndicated(item.date_indicated ? item.date_indicated.slice(0, 10) : "");
    setDatePaid(item.date_paid ? item.date_paid.slice(0, 10) : "");
    setStatusEdit(item.status);
    setFormErrors({});
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingId(null); };
  const closeAffiliateModal = () => { if (savingAff) return; setIsAffiliateModalOpen(false); setAffErrors({}); setAffCodeTouched(false); };

  const handleSaveDefault = async () => {
    const v = parseFloat(defaultDraft.replace(",", "."));
    if (isNaN(v) || v < 0) { toast.error("Informe um valor válido."); return; }
    await saveAppSetting(DEFAULT_COMMISSION_KEY, v);
    toast.success("Valor padrão de comissão por indicação atualizado.");
    setEditingDefault(false);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof formErrors = {};
    const editingItem = editingId ? indicacoes.find(i => i.id === editingId) : null;
    // Ao editar, indicadores antigos podem não estar mais na lista (ex.: colaborador removido): mantém o nome gravado.
    if (!referrerId && !editingItem) errs.referrer = "Selecione quem fez a indicação.";
    if (!referredName.trim()) errs.referred = "Informe o nome do cliente indicado.";
    const value = parseFloat(commissionValue.replace(",", "."));
    if (commissionValue === "" || isNaN(value) || value < 0) errs.commission = "Informe um valor de comissão válido (zero ou mais).";
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const referrerName = referrerNomeSelecionado || editingItem?.referrer_name;
    if (!referrerName) { setFormErrors({ referrer: "Indicador inválido." }); return; }

    const common = {
      referrer_type: referrerType,
      referrer_colaborador_id: referrerType === "colaborador" ? (referrerId || null) : null,
      referrer_cliente_id: referrerType === "cliente" ? (referrerId || null) : null,
      referrer_name: referrerName,
      referred_name: referredName.trim(),
      referred_contact: referredContact.trim() || null,
      commission_value: value,
      date_indicated: dateIndicated || new Date().toISOString().split("T")[0],
      notes: notes.trim() || null,
    };

    if (editingId) {
      updateIndicacao(editingId, { ...common, status: statusEdit, date_paid: statusEdit === "Paga" ? (datePaid || new Date().toISOString().split("T")[0]) : null });
      toast.success("Indicação atualizada.");
    } else {
      addIndicacao({ ...common, status: "Pendente" });
      toast.success("Indicação registrada com sucesso!");
    }
    closeModal();
  };

  const handleSaveAffiliate = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof affErrors = {};
    if (!affName.trim()) errs.name = "Informe o nome do afiliado.";
    if (!affCodeClean) errs.code = "Informe um código para o link.";
    else if (affiliates.some((a: any) => a.code === affCodeClean)) errs.code = "Já existe um afiliado com esse código.";
    if (affEmail.trim() && !isEmail(affEmail)) errs.email = "E-mail com formato inválido.";
    const ph = affPhone.replace(/\D/g, "");
    if (ph && (ph.length < 10 || ph.length > 11)) errs.phone = "Telefone deve ter DDD + 8 ou 9 dígitos.";
    setAffErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const cleanCode = affCodeClean;
    const newAff = {
      id: crypto.randomUUID(),
      name: affName.trim(),
      email: affEmail.trim(),
      phone: affPhone.trim(),
      pix: affPix.trim(),
      code: cleanCode,
      commission: parseFloat(affCommission.replace(",", ".")) || defaultCommission || 100,
      createdAt: new Date().toISOString(),
    };

    setSavingAff(true);
    try {
      await saveAppSetting(AFFILIATES_KEY, [...affiliates, newAff]);
    } finally {
      setSavingAff(false);
    }

    toast.success(`Afiliado "${newAff.name}" cadastrado! Link gerado: ref=${cleanCode}`);
    setSelectedAffiliateCode(cleanCode);
    setAffName("");
    setAffEmail("");
    setAffPhone("");
    setAffPix("");
    setAffCode("");
    setAffCommission("");
    setAffCodeTouched(false);
    setAffErrors({});
    setIsAffiliateModalOpen(false);
    setIsLinkModalOpen(true);
  };

  const handleRemoveAffiliate = async (aff: any) => {
    if (!(await confirmDialog({
      title: "Remover afiliado",
      description: `Remover "${aff.name}" (ref=${aff.code})? Links já compartilhados com esse código deixam de ser reconhecidos como afiliado. Indicações já registradas são mantidas.`,
      confirmText: "Remover",
      variant: "danger",
    }))) return;
    await saveAppSetting(AFFILIATES_KEY, affiliates.filter((a: any) => a.code !== aff.code));
    toast.success("Afiliado removido.");
  };

  const handleCopyLink = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(currentReferralUrl);
      setCopiedLink(true);
      toast.success("Link copiado para a área de transferência!");
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleShareWhatsApp = () => {
    const text = `Olá! Conheça as soluções da nossa empresa através do meu link exclusivo de indicação: ${currentReferralUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleShareInstagram = () => {
    if (navigator?.clipboard) {
      const bioText = `🚀 Garanta sua consultoria pelo meu link oficial de parceiro: ${currentReferralUrl}`;
      navigator.clipboard.writeText(bioText);
      toast.success("Texto pronto para Bio/Stories do Instagram copiado!");
    }
  };

  // Simulação / Teste do formulário público de indicação
  const handleTestSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof previewErrors = {};
    if (!previewLeadName.trim()) errs.name = "Informe o nome do indicado.";
    const ph = previewLeadPhone.replace(/\D/g, "");
    if (ph.length < 10 || ph.length > 11) errs.phone = "Informe o WhatsApp com DDD.";
    if (previewLeadEmail.trim() && !isEmail(previewLeadEmail)) errs.email = "E-mail com formato inválido.";
    setPreviewErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const affiliateName = currentAffiliate?.name || "Afiliado Externo";
    const affiliateComm = currentAffiliate?.commission || defaultCommission || 100;

    // 1. Cadastra no módulo de Indicações
    addIndicacao({
      referrer_type: "colaborador",
      referrer_colaborador_id: null,
      referrer_cliente_id: null,
      referrer_name: `[Afiliado] ${affiliateName}`,
      referred_name: previewLeadName.trim(),
      referred_contact: [previewLeadPhone.trim(), previewLeadEmail.trim()].filter(Boolean).join(" · "),
      commission_value: Number(affiliateComm),
      status: "Pendente",
      date_indicated: new Date().toISOString().split("T")[0],
      notes: `Lead cadastrado via formulário de indicação online. Empresa: ${previewLeadCompany || "Não informada"}. Ref: ${currentAffiliate?.code || "oficial"}`,
    });

    // 2. Se a função addLead estiver disponível, adiciona ao CRM
    if (addLead) {
      addLead({
        name: previewLeadName.trim(),
        phone: previewLeadPhone.trim(),
        email: previewLeadEmail.trim(),
        company: previewLeadCompany.trim() || "Indicação",
        source: `Indicação (${affiliateName})`,
        stageId: "1",
        status: "Lead Qualificado",
        title: `Indicação - ${previewLeadCompany.trim() || previewLeadName.trim()}`,
        value: 0,
        date: new Date().toISOString().split("T")[0],
        seller: "Equipe Comercial",
      });
    }

    toast.success("✅ Lead registrado via formulário de indicação!", {
      description: `Comissão provisionada para ${affiliateName}.`,
    });

    setPreviewLeadName("");
    setPreviewLeadPhone("");
    setPreviewLeadEmail("");
    setPreviewLeadCompany("");
    setIsLinkModalOpen(false);
  };

  const handleCycleStatus = (item: (typeof indicacoes)[number]) => {
    const next = STATUS_FLOW[item.status] || "Pendente";
    const updates: any = { status: next };
    if (next === "Paga") updates.date_paid = new Date().toISOString().split("T")[0];
    updateIndicacao(item.id, updates);
    toast.success(`Indicação marcada como ${next}.`);
  };

  const handleDelete = async (item: (typeof indicacoes)[number], fromModal = false) => {
    if (!(await confirmDialog({
      title: "Excluir indicação",
      description: `Excluir a indicação de "${item.referred_name}"? Essa ação não pode ser desfeita.`,
    }))) return;
    deleteIndicacao(item.id);
    toast.success("Indicação excluída.");
    if (fromModal) closeModal();
  };

  const handleExport = () => {
    downloadCsv(
      `indicacoes_${Date.now()}.csv`,
      ["Indicador", "Tipo", "Cliente Indicado", "Contato", "Comissão", "Status", "Data"],
      indicacoes.map(i => [
        i.referrer_name,
        i.referrer_type === "colaborador" ? "Colaborador" : "Cliente",
        i.referred_name,
        i.referred_contact || "",
        Number(i.commission_value || 0).toFixed(2),
        i.status,
        i.date_indicated || "",
      ])
    );
    toast.success("Arquivo CSV exportado com sucesso!");
  };

  return (
    <PageContainer
      title="Indicações & Parcerias"
      description="Cadastre afiliados, gere links rastreáveis com formulário para Instagram/WhatsApp e controle comissões."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Indicações & Parcerias" }]}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <FinancePeriodFilter />
          {/* Botão 1 Solicitado: Cadastrar Afiliado */}
          <Button
            onClick={() => setIsAffiliateModalOpen(true)}
            className="h-9 px-4 text-xs font-black gap-1.5 shadow-md cursor-pointer"
          >
            <UserPlus className="w-4 h-4" /> Cadastrar Afiliado
          </Button>

          {/* Botão 2 Solicitado: Link & Formulário de Indicação */}
          <Button
            variant="secondary"
            onClick={() => setIsLinkModalOpen(true)}
            className="h-9 px-4 text-xs font-black gap-1.5 shadow-md cursor-pointer"
          >
            <Share2 className="w-4 h-4" /> Link & Formulário
          </Button>

          <Button onClick={openModal} variant="outline" className="h-9 px-3 text-xs font-bold gap-1.5 border-[var(--color-border-default)]">
            <Plus className="w-3.5 h-3.5" /> Indicação Manual
          </Button>
          <Button variant="outline" onClick={handleExport} className="h-9 px-3 text-xs font-bold gap-1.5 border-[var(--color-border-default)]">
            <Download className="w-3.5 h-3.5" /> Exportar
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
      <FinanceKpiFilter
        id="finIndicacoes"
        kpis={[
          { label: "Total de Indicações", value: kpis.total, icon: Users, tone: "primary" },
          { label: "Em Aberto", value: kpis.pendentes, icon: Clock, tone: "warning" },
          { label: "Comissão Paga", value: currency(kpis.totalPago), icon: CheckCircle2, tone: "success" },
          { label: "Comissão a Pagar", value: currency(kpis.totalPendente), icon: DollarSign, tone: "info" },
        ]}
        activeCount={(busca ? 1 : 0) + (statusFilter ? 1 : 0) + (indicadorFilter ? 1 : 0)}
        onClear={() => { setBusca(""); setStatusFilter(""); setIndicadorFilter(""); }}
      >
        <FilterBar>
          <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar por indicador, indicado ou contato..." />
          <FilterSelect icon={UserPlus} value={indicadorFilter} onChange={setIndicadorFilter} options={indicadores} allLabel="Todos os indicadores" />
          <FilterChips value={statusFilter} onChange={setStatusFilter} options={["Pendente", "Aprovada", "Paga", "Cancelada"]} />
        </FilterBar>
      </FinanceKpiFilter>

      {indicacoes.length > 0 && (
        <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
          <h3 className="text-xs font-bold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[var(--color-text-faint)]" /> Indicações por Status
          </h3>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusBreakdown} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                <XAxis dataKey="status" stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-control)" }} itemStyle={{ fontSize: "11px" }} />
                <Bar dataKey="count" name="Indicações" radius={[4, 4, 0, 0]}>
                  {statusBreakdown.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Configuração de Comissão Padrão */}
      <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <DollarSign className="w-4 h-4 text-[var(--color-primary-blue)]" />
          Valor padrão de comissão por indicação:
          {!editingDefault && <span className="font-bold text-[var(--color-text-primary)]">{currency(defaultCommission)}</span>}
        </div>
        {editingDefault ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              autoFocus
              value={defaultDraft}
              onChange={(e) => setDefaultDraft(e.target.value)}
              className="w-32 bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
            />
            <Button onClick={handleSaveDefault} className="h-8 px-3 text-xs font-bold">Salvar</Button>
            <Button variant="outline" onClick={() => setEditingDefault(false)} className="h-8 px-3 text-xs font-bold border-[var(--color-border-default)]">Cancelar</Button>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => { setDefaultDraft(String(defaultCommission || "")); setEditingDefault(true); }}
            className="h-8 px-3 text-xs font-bold border-[var(--color-border-default)]"
          >
            Editar valor padrão
          </Button>
        )}
      </Card>

      {/* Tabela de Indicações */}
      <Card className="p-0 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Histórico de Indicações ({indicacoesFiltradas.length === indicacoes.length ? indicacoes.length : `${indicacoesFiltradas.length} de ${indicacoes.length}`})</h3>
          <span className="text-[10px] text-[var(--color-text-muted)] uppercase font-mono">Clique no status para avançar o fluxo</span>
        </div>

        {indicacoes.length === 0 ? (
          <div className="p-12 text-center text-xs text-[var(--color-text-muted)]">
            Nenhuma indicação registrada ainda. Cadastre afiliados ou compartilhe o link público de formulário.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--color-border-subtle)]">
                <tr>
                  <th className="p-3">Indicador / Afiliado</th>
                  <th className="p-3">Cliente Indicado</th>
                  <th className="p-3">Contato</th>
                  <th className="p-3">Comissão</th>
                  <th className="p-3">Data</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)] text-[var(--color-text-primary)] font-medium">
                {indicacoesFiltradas.map((item) => (
                  <tr key={item.id} {...rowOpen(item)} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors cursor-pointer">
                    <td className="p-3 font-bold flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center text-[10px] font-bold">
                        {item.referrer_name.charAt(0).toUpperCase()}
                      </span>
                      {item.referrer_name}
                    </td>
                    <td className="p-3 text-[var(--color-text-primary)] font-bold">{item.referred_name}</td>
                    <td className="p-3 text-[var(--color-text-muted)]">{item.referred_contact || "—"}</td>
                    <td className="p-3 font-mono font-bold text-[var(--color-primary-blue)]">{currency(Number(item.commission_value || 0))}</td>
                    <td className="p-3 text-[var(--color-text-muted)] font-mono">{item.date_indicated || "—"}</td>
                    <td className="p-3">
                      <button
                        onClick={() => handleCycleStatus(item)}
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border cursor-pointer hover:brightness-110 transition-all ${statusStyle(item.status)}`}
                      >
                        {statusIcon(item.status)}
                        {item.status}
                      </button>
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setViewing(item)}
                        className="p-1.5 mr-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] transition-colors cursor-pointer rounded-lg"
                        title="Visualizar"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 mr-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] transition-colors cursor-pointer rounded-lg"
                        title="Editar / ver detalhes"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="p-1.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-danger transition-colors cursor-pointer rounded-lg hover:bg-danger/10 hover:border-danger/25"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── MODAL 1: CADASTRAR AFILIADO / INDICADOR ── */}
      <Modal
        isOpen={isAffiliateModalOpen}
        onClose={closeAffiliateModal}
        title={<ModalTitle icon={UserPlus} title="Cadastrar Afiliado / Indicador" subtitle="Parceiros, influenciadores, clientes ou colaboradores que recebem comissão por cada cliente indicado." />}
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSaveAffiliate} className="space-y-4" noValidate>
          <FormSection icon={User} title="Dados do afiliado">
            <Field label="Nome do afiliado / parceiro" icon={User} required error={affErrors.name}>
              <input
                type="text"
                autoFocus
                placeholder="Ex: Carlos Mendonça ou Agência Impacto"
                value={affName}
                onChange={(e) => {
                  setAffName(e.target.value);
                  setAffErrors(p => ({ ...p, name: undefined }));
                  if (!affCodeTouched) {
                    const slug = e.target.value.toLowerCase().trim().split(" ")[0].replace(/[^a-z0-9]/g, "");
                    setAffCode(slug);
                  }
                }}
                className={inputCls(!!affErrors.name)}
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="WhatsApp / Telefone" icon={Phone} error={affErrors.phone}>
                <input type="text" inputMode="tel" placeholder="(11) 99999-9999" value={affPhone} onChange={(e) => { setAffPhone(formatPhone(e.target.value)); setAffErrors(p => ({ ...p, phone: undefined })); }} className={inputCls(!!affErrors.phone)} />
              </Field>
              <Field label="E-mail" icon={Mail} error={affErrors.email}>
                <input type="email" placeholder="afiliado@email.com" value={affEmail} onChange={(e) => { setAffEmail(e.target.value); setAffErrors(p => ({ ...p, email: undefined })); }} className={inputCls(!!affErrors.email)} />
              </Field>
            </div>
          </FormSection>

          <FormSection icon={Link} title="Link e comissão">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Código / slug do link" icon={Link} required error={affErrors.code} hint={!affErrors.code && affCodeClean ? `Link: …/indicacao?ref=${affCodeClean}` : "Letras minúsculas, números, - e _."}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] font-mono text-xs">ref=</span>
                  <input
                    type="text"
                    placeholder="carlos"
                    value={affCode}
                    onChange={(e) => { setAffCodeTouched(true); setAffCode(e.target.value.toLowerCase().replace(/\s+/g, "-")); setAffErrors(p => ({ ...p, code: undefined })); }}
                    className={`${inputCls(!!affErrors.code)} pl-11 font-mono font-bold`}
                  />
                </div>
              </Field>
              <Field label="Comissão por venda (R$)" icon={DollarSign} hint={defaultCommission ? `Em branco = padrão (${currency(defaultCommission)}).` : "Em branco = R$ 100,00 (nenhum padrão definido)."}>
                <input type="number" step="0.01" min="0" placeholder={String(defaultCommission || "100,00")} value={affCommission} onChange={(e) => setAffCommission(e.target.value)} className={`${inputCls()} font-mono font-bold`} />
              </Field>
            </div>
            <Field label="Chave Pix para pagamentos" icon={QrCode}>
              <input type="text" placeholder="CPF, e-mail, telefone ou chave aleatória" value={affPix} onChange={(e) => setAffPix(e.target.value)} className={inputCls()} />
            </Field>
          </FormSection>

          {affiliates.length > 0 && (
            <FormSection icon={Users} title={`Afiliados cadastrados (${affiliates.length})`}>
              <ul className="divide-y divide-[var(--color-border-subtle)] max-h-36 overflow-y-auto">
                {affiliates.map((a: any) => (
                  <li key={a.id || a.code} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                    <span className="min-w-0 truncate"><b className="text-[var(--color-text-primary)]">{a.name}</b> <span className="font-mono text-[var(--color-text-faint)]">ref={a.code}</span> <span className="text-[var(--color-text-muted)]">· {currency(a.commission)}</span></span>
                    <button type="button" onClick={() => handleRemoveAffiliate(a)} title="Remover afiliado" className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 cursor-pointer shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
              </ul>
            </FormSection>
          )}

          <ModalFooter onCancel={closeAffiliateModal} saving={savingAff} submitLabel="Salvar afiliado" submitIcon={Save} />
        </form>
      </Modal>

      {/* ── MODAL 2: LINK & FORMULÁRIO DE INDICAÇÃO ── */}
      <Modal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        title={<ModalTitle icon={Share2} title="Link & Formulário de Indicação" subtitle="Compartilhe o link rastreável e teste o formulário que o indicado preenche." />}
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <FormSection icon={Link} title="Link rastreável">
            {affiliates.length > 0 ? (
              <Field label="Afiliado" icon={User}>
                <select value={currentAffiliate?.code || ""} onChange={(e) => setSelectedAffiliateCode(e.target.value)} className={selectCls()}>
                  {affiliates.map((a: any) => (
                    <option key={a.code} value={a.code}>{a.name} (ref={a.code} — {currency(a.commission)})</option>
                  ))}
                </select>
              </Field>
            ) : (
              <p className="text-[11px] text-[var(--color-text-muted)] flex items-start gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--color-primary-blue)]" /> Nenhum afiliado cadastrado: o link usa o código geral “oficial”. Cadastre afiliados para rastrear cada parceiro.</p>
            )}
            <div className="flex items-center gap-2">
              <input type="text" readOnly value={currentReferralUrl} onFocus={(e) => e.currentTarget.select()} className={`${inputCls()} font-mono flex-1`} />
              <Button type="button" onClick={handleCopyLink} className="h-9 px-3 text-xs font-bold gap-1 shrink-0">
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedLink ? "Copiado!" : "Copiar"}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={handleShareWhatsApp} className="h-9 text-xs font-bold gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</Button>
              <Button type="button" variant="outline" onClick={handleShareInstagram} className="h-9 text-xs font-bold gap-1.5"><Share2 className="w-3.5 h-3.5" /> Instagram (Bio)</Button>
            </div>
            {currentAffiliate && (
              <p className="text-[10px] text-[var(--color-text-faint)]">Comissão deste afiliado: <b className="font-mono">{currency(currentAffiliate.commission)}</b> por indicação{currentAffiliate.pix ? " · Pix cadastrado" : " · sem chave Pix cadastrada"}.</p>
            )}
          </FormSection>

          <FormSection icon={Users} title="Formulário do indicado" hint={`rastreio: ${currentAffiliate ? currentAffiliate.name : "Geral"}`}>
            <p className="text-[11px] text-[var(--color-text-muted)] leading-snug">É assim que o indicado se cadastra. Ao testar, o envio é real: cria uma indicação (Pendente) e um lead no CRM.</p>
            <form onSubmit={handleTestSubmitForm} className="space-y-3" noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nome do indicado" required error={previewErrors.name}>
                  <input type="text" placeholder="Nome completo" value={previewLeadName} onChange={(e) => { setPreviewLeadName(e.target.value); setPreviewErrors(p => ({ ...p, name: undefined })); }} className={inputCls(!!previewErrors.name)} />
                </Field>
                <Field label="WhatsApp com DDD" required error={previewErrors.phone}>
                  <input type="text" inputMode="tel" placeholder="(11) 99999-9999" value={previewLeadPhone} onChange={(e) => { setPreviewLeadPhone(formatPhone(e.target.value)); setPreviewErrors(p => ({ ...p, phone: undefined })); }} className={inputCls(!!previewErrors.phone)} />
                </Field>
                <Field label="E-mail" error={previewErrors.email}>
                  <input type="email" placeholder="email@exemplo.com" value={previewLeadEmail} onChange={(e) => { setPreviewLeadEmail(e.target.value); setPreviewErrors(p => ({ ...p, email: undefined })); }} className={inputCls(!!previewErrors.email)} />
                </Field>
                <Field label="Empresa">
                  <input type="text" placeholder="Nome da empresa" value={previewLeadCompany} onChange={(e) => setPreviewLeadCompany(e.target.value)} className={inputCls()} />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button type="submit" className="h-9 px-4 text-xs font-bold gap-1.5"><Send className="w-3.5 h-3.5" /> Testar envio do formulário</Button>
              </div>
            </form>
          </FormSection>
        </div>
      </Modal>

      {/* ── MODAL INDICAÇÃO (NOVA / EDITAR) ── */}
      {viewing && (
        <ViewModal
          isOpen
          onClose={() => setViewing(null)}
          icon={Users}
          title={viewing.referred_name}
          subtitle={`Indicado por ${viewing.referrer_name}`}
          tone={viewing.status === "Paga" ? "success" : viewing.status === "Cancelada" ? "danger" : viewing.status === "Aprovada" ? "primary" : "warning"}
          highlight={
            <>
              <span className="text-lg font-black font-mono text-[var(--color-primary-blue)]">{currency(Number(viewing.commission_value || 0))}</span>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusStyle(viewing.status)}`}>{statusIcon(viewing.status)}{viewing.status}</span>
            </>
          }
          sections={[
            { icon: User, title: "Indicador", rows: [
              { label: "Nome", value: viewing.referrer_name || null },
              { label: "Tipo", value: viewing.referrer_type === "colaborador" ? "Colaborador" : "Cliente" },
            ] },
            { icon: UserPlus, title: "Indicado", rows: [
              { label: "Nome", value: viewing.referred_name || null },
              { label: "Contato", value: viewing.referred_contact || null },
            ] },
            { icon: DollarSign, title: "Comissão e acompanhamento", rows: [
              { label: "Comissão", value: currency(Number(viewing.commission_value || 0)), mono: true },
              { label: "Data da indicação", value: viewing.date_indicated ? viewing.date_indicated.slice(0, 10).split("-").reverse().join("/") : null },
              { label: "Data do pagamento", value: viewing.date_paid ? viewing.date_paid.slice(0, 10).split("-").reverse().join("/") : null },
              { label: "Observações", value: viewing.notes || null },
            ] },
          ]}
          newLabel="Nova indicação"
          onEdit={() => { const it = viewing; setViewing(null); openEdit(it); }}
          onNew={() => { setViewing(null); openModal(); }}
          onDelete={() => { const it = viewing; setViewing(null); handleDelete(it); }}
        />
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={<ModalTitle icon={editingId ? Pencil : UserPlus} title={editingId ? "Editar Indicação" : "Nova Indicação Manual"} subtitle={editingId ? "Atualize os dados, o status e as datas desta indicação." : "Registre uma indicação feita por um colaborador ou cliente."} />}
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleAdd} className="space-y-4" noValidate>
          <FormSection icon={Users} title="Quem indicou">
            <div className="grid grid-cols-2 gap-2">
              {(["colaborador", "cliente"] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setReferrerType(t); setReferrerId(""); setFormErrors(p => ({ ...p, referrer: undefined })); }}
                  className={`h-9 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${referrerType === t ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/40" : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border-default)]"}`}
                >
                  {t === "colaborador" ? "Colaborador" : "Cliente"}
                </button>
              ))}
            </div>
            <Field label={referrerType === "colaborador" ? "Colaborador" : "Cliente"} icon={User} required error={formErrors.referrer} hint={referrerOptions.length === 0 ? `Nenhum ${referrerType} cadastrado ainda.` : undefined}>
              <select value={referrerId} onChange={(e) => { setReferrerId(e.target.value); setFormErrors(p => ({ ...p, referrer: undefined })); }} className={selectCls(!!formErrors.referrer)}>
                <option value="">Selecione {referrerType === "colaborador" ? "o colaborador" : "o cliente"}...</option>
                {referrerOptions.map((r: any) => (
                  <option key={r.id} value={r.id}>{referrerType === "colaborador" ? r.nome : r.name}</option>
                ))}
              </select>
            </Field>
          </FormSection>

          <FormSection icon={UserPlus} title="Indicado">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nome do indicado (lead / cliente)" icon={User} required error={formErrors.referred}>
                <input type="text" placeholder="Ex: Pedro Henrique" value={referredName} onChange={(e) => { setReferredName(e.target.value); setFormErrors(p => ({ ...p, referred: undefined })); }} className={inputCls(!!formErrors.referred)} />
              </Field>
              <Field label="Contato" icon={Phone} hint="Telefone ou e-mail (opcional).">
                <input type="text" placeholder="Telefone ou e-mail do indicado" value={referredContact} onChange={(e) => setReferredContact(e.target.value)} className={inputCls()} />
              </Field>
            </div>
          </FormSection>

          <FormSection icon={DollarSign} title="Comissão e acompanhamento">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Valor da comissão (R$)"
                icon={DollarSign}
                required
                error={formErrors.commission}
                hint={defaultCommission > 0 && !editingId ? (
                  <span>Padrão: {currency(defaultCommission)}. {commissionValue !== String(defaultCommission) && <button type="button" onClick={() => setCommissionValue(String(defaultCommission))} className="text-[var(--color-primary-blue)] font-bold hover:underline cursor-pointer">Usar padrão</button>}</span>
                ) : undefined}
              >
                <input type="number" step="0.01" min="0" placeholder="0,00" value={commissionValue} onChange={(e) => { setCommissionValue(e.target.value); setFormErrors(p => ({ ...p, commission: undefined })); }} className={`${inputCls(!!formErrors.commission)} font-mono`} />
              </Field>
              <Field label="Data da indicação" icon={Calendar} hint={!dateIndicated ? "Em branco = hoje." : undefined}>
                <input type="date" value={dateIndicated} onChange={(e) => setDateIndicated(e.target.value)} className={inputCls()} />
              </Field>
              {editingId && (
                <>
                  <Field label="Status" icon={Clock}>
                    <select value={statusEdit} onChange={(e) => { const v = e.target.value as Indicacao["status"]; setStatusEdit(v); if (v === "Paga" && !datePaid) setDatePaid(new Date().toISOString().split("T")[0]); }} className={selectCls()}>
                      {["Pendente", "Aprovada", "Paga", "Cancelada"].map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </Field>
                  <Field label="Data do pagamento" icon={CheckCircle2} hint={statusEdit !== "Paga" ? "Só é gravada quando o status é “Paga”." : undefined}>
                    <input type="date" value={datePaid} disabled={statusEdit !== "Paga"} onChange={(e) => setDatePaid(e.target.value)} className={inputCls()} />
                  </Field>
                </>
              )}
            </div>
            <Field label="Observações" icon={AlignLeft} hint={`${notes.length}/500`}>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} placeholder="Contexto adicional sobre a indicação (opcional)" className={textareaCls} />
            </Field>
          </FormSection>

          {(referrerId && referredName.trim()) && (
            <div className="rounded-xl border border-[var(--color-primary-blue)]/20 bg-[var(--color-primary-blue)]/[0.05] p-3 text-xs text-[var(--color-text-primary)] flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-[var(--color-primary-blue)] shrink-0 mt-0.5" />
              <span><b>{referrerNomeSelecionado}</b> indicou <b>{referredName.trim()}</b>{parseFloat(commissionValue) >= 0 && commissionValue !== "" ? <> — comissão de <b className="font-mono">{currency(parseFloat(commissionValue) || 0)}</b></> : null}.</span>
            </div>
          )}

          <ModalFooter
            onCancel={closeModal}
            submitLabel={editingId ? "Salvar alterações" : "Registrar indicação"}
            submitIcon={Save}
            left={editingId ? (<>
              <Button type="button" variant="ghost" onClick={openModal} className="h-9 px-3 text-xs font-bold gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Nova indicação
              </Button>
              <Button type="button" variant="ghost" onClick={() => { const it = indicacoes.find(i => i.id === editingId); if (it) handleDelete(it, true); }} className="h-9 px-3 text-xs font-bold gap-1.5 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10">
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </Button>
            </>) : undefined}
          />
        </form>
      </Modal>
      </div>
    </PageContainer>
  );
}
