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
  UserPlus, Share2, Copy, ExternalLink, QrCode, Send, MessageCircle, Link, Check, Users, BarChart3
} from "lucide-react";

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

  const resetForm = () => {
    setReferrerType("colaborador");
    setReferrerId("");
    setReferredName("");
    setReferredContact("");
    setCommissionValue(String(defaultCommission || ""));
    setNotes("");
  };

  const openModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleSaveDefault = async () => {
    const v = parseFloat(defaultDraft.replace(",", "."));
    if (isNaN(v) || v < 0) { toast.error("Informe um valor válido."); return; }
    await saveAppSetting(DEFAULT_COMMISSION_KEY, v);
    toast.success("Valor padrão de comissão por indicação atualizado.");
    setEditingDefault(false);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!referrerId) { toast.error("Selecione quem fez a indicação."); return; }
    if (!referredName.trim()) { toast.error("Informe o nome do cliente indicado."); return; }
    const value = parseFloat(commissionValue.replace(",", "."));
    if (isNaN(value) || value < 0) { toast.error("Informe um valor de comissão válido."); return; }

    const referrer = referrerOptions.find((r: any) => r.id === referrerId);
    const referrerName = referrerType === "colaborador" ? referrer?.nome : referrer?.name;
    if (!referrerName) { toast.error("Indicador inválido."); return; }

    addIndicacao({
      referrer_type: referrerType,
      referrer_colaborador_id: referrerType === "colaborador" ? referrerId : null,
      referrer_cliente_id: referrerType === "cliente" ? referrerId : null,
      referrer_name: referrerName,
      referred_name: referredName.trim(),
      referred_contact: referredContact.trim() || null,
      commission_value: value,
      status: "Pendente",
      date_indicated: new Date().toISOString().split("T")[0],
      notes: notes.trim() || null,
    });

    toast.success("Indicação registrada com sucesso!");
    setIsModalOpen(false);
  };

  const handleSaveAffiliate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!affName.trim() || !affCode.trim()) {
      toast.error("Preencha ao menos o Nome e o Código do Afiliado.");
      return;
    }

    const cleanCode = affCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
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

    const updated = [...affiliates, newAff];
    await saveAppSetting(AFFILIATES_KEY, updated);

    toast.success(`🎉 Afiliado "${newAff.name}" cadastrado! Link gerado: ref=${cleanCode}`);
    setSelectedAffiliateCode(cleanCode);
    setAffName("");
    setAffEmail("");
    setAffPhone("");
    setAffPix("");
    setAffCode("");
    setAffCommission("");
    setIsAffiliateModalOpen(false);
    setIsLinkModalOpen(true);
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
    if (!previewLeadName.trim() || !previewLeadPhone.trim()) {
      toast.error("Preencha nome e WhatsApp.");
      return;
    }

    const affiliateName = currentAffiliate?.name || "Afiliado Externo";
    const affiliateComm = currentAffiliate?.commission || defaultCommission || 100;

    // 1. Cadastra no módulo de Indicações
    addIndicacao({
      referrer_type: "colaborador",
      referrer_colaborador_id: null,
      referrer_cliente_id: null,
      referrer_name: `[Afiliado] ${affiliateName}`,
      referred_name: previewLeadName.trim(),
      referred_contact: `${previewLeadPhone.trim()} · ${previewLeadEmail.trim()}`,
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

  const handleDelete = async (item: (typeof indicacoes)[number]) => {
    if (!(await confirmDialog({
      title: "Excluir indicação",
      description: `Excluir a indicação de "${item.referred_name}"? Essa ação não pode ser desfeita.`,
    }))) return;
    deleteIndicacao(item.id);
    toast.success("Indicação excluída.");
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
                  <tr key={item.id} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors">
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
                    <td className="p-3 text-right">
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
        onClose={() => setIsAffiliateModalOpen(false)}
        title="Cadastrar Afiliado / Indicador Oficial"
      >
        <form onSubmit={handleSaveAffiliate} className="space-y-3.5">
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            Cadastre parceiros, influenciadores, clientes ou colaboradores como afiliados para que recebam comissão por cada cliente indicado.
          </p>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Nome do Afiliado / Parceiro *</label>
            <input
              type="text"
              required
              placeholder="Ex: Carlos Mendonça ou Agência Impacto"
              value={affName}
              onChange={(e) => {
                setAffName(e.target.value);
                if (!affCode) {
                  const slug = e.target.value.toLowerCase().trim().split(" ")[0].replace(/[^a-z0-9]/g, "");
                  setAffCode(slug);
                }
              }}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">WhatsApp / Telefone</label>
              <input
                type="text"
                placeholder="(11) 99999-9999"
                value={affPhone}
                onChange={(e) => setAffPhone(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">E-mail</label>
              <input
                type="email"
                placeholder="afiliado@email.com"
                value={affEmail}
                onChange={(e) => setAffEmail(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Código / Slug do Link *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] font-mono text-xs">ref=</span>
                <input
                  type="text"
                  required
                  placeholder="carlos"
                  value={affCode}
                  onChange={(e) => setAffCode(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                  className="w-full pl-11 bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] font-mono font-bold border border-[var(--color-border-default)] rounded-[var(--radius-control)] pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Comissão por Venda (R$)</label>
              <input
                type="number"
                step="0.01"
                placeholder={String(defaultCommission || "100,00")}
                value={affCommission}
                onChange={(e) => setAffCommission(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] font-mono font-bold border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Chave Pix para Pagamentos</label>
            <input
              type="text"
              placeholder="CPF, E-mail, Telefone ou Chave Aleatória"
              value={affPix}
              onChange={(e) => setAffPix(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-[var(--color-border-subtle)]">
            <Button type="button" variant="outline" onClick={() => setIsAffiliateModalOpen(false)} className="h-9 px-4 text-xs font-bold">
              Cancelar
            </Button>
            <Button type="submit" className="h-9 px-5 text-xs font-bold shadow-xs">
              Salvar Afiliado
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL 2: LINK & FORMULÁRIO DE INDICAÇÃO ── */}
      <Modal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        title="Link & Formulário de Indicação / Afiliados"
      >
        <div className="space-y-4">
          {/* Seletor de Afiliado */}
          {affiliates.length > 0 && (
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Selecione o Afiliado:</label>
              <select
                value={selectedAffiliateCode}
                onChange={(e) => setSelectedAffiliateCode(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
              >
                {affiliates.map((a: any) => (
                  <option key={a.code} value={a.code}>
                    {a.name} (ref={a.code} — {currency(a.commission)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Card com o Link Gerado */}
          <div className="p-3.5 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-primary-blue)]/25 space-y-2.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-primary-blue)] block">
              Link de Indicação Rastreável
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={currentReferralUrl}
                className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-primary)] font-mono focus:outline-none"
              />
              <Button
                type="button"
                onClick={handleCopyLink}
                className="h-9 px-3 text-xs font-bold gap-1"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedLink ? "Copiado!" : "Copiar"}
              </Button>
            </div>

            {/* Ações de Compartilhamento WhatsApp e Instagram */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={handleShareWhatsApp}
                className="h-8 text-[11px] font-bold gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleShareInstagram}
                className="h-8 text-[11px] font-bold gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" /> Instagram (Bio)
              </Button>
            </div>
          </div>

          {/* Visualização / Teste do Formulário que o Cliente / Indicado vê */}
          <div className="p-4 rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-2">
              <span className="text-[11px] font-black uppercase text-[var(--color-text-primary)] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Formulário de Cadastro do Indicado
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)] font-mono font-bold">Rastreio: {currentAffiliate ? currentAffiliate.name : "Geral"}</span>
            </div>

            <p className="text-[11px] text-[var(--color-text-muted)] leading-tight">
              Quando o indicado acessa pelo WhatsApp ou Instagram, ele preenche este formulário e entra automaticamente no CRM:
            </p>

            <form onSubmit={handleTestSubmitForm} className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Nome do indicado *"
                  value={previewLeadName}
                  onChange={(e) => setPreviewLeadName(e.target.value)}
                  className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-3 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none"
                />
                <input
                  type="text"
                  required
                  placeholder="WhatsApp com DDD *"
                  value={previewLeadPhone}
                  onChange={(e) => setPreviewLeadPhone(e.target.value)}
                  className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-3 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="email"
                  placeholder="E-mail"
                  value={previewLeadEmail}
                  onChange={(e) => setPreviewLeadEmail(e.target.value)}
                  className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-3 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Nome da Empresa"
                  value={previewLeadCompany}
                  onChange={(e) => setPreviewLeadCompany(e.target.value)}
                  className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-3 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none"
                />
              </div>

              <div className="flex justify-end pt-1">
                <Button type="submit" className="h-8 px-4 text-xs font-bold gap-1.5">
                  <Send className="w-3 h-3" /> Testar Envio do Formulário
                </Button>
              </div>
            </form>
          </div>
        </div>
      </Modal>

      {/* ── MODAL INDICAÇÃO MANUAL ── */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Nova Indicação Manual">
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Quem Indicou? *</label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button
                type="button"
                onClick={() => { setReferrerType("colaborador"); setReferrerId(""); }}
                className={`h-9 rounded-[var(--radius-control)] text-xs font-bold border transition-colors cursor-pointer ${referrerType === "colaborador" ? "bg-[var(--color-primary-blue)] text-white border-[var(--color-primary-blue)]" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border-[var(--color-border-default)]"}`}
              >
                Colaborador
              </button>
              <button
                type="button"
                onClick={() => { setReferrerType("cliente"); setReferrerId(""); }}
                className={`h-9 rounded-[var(--radius-control)] text-xs font-bold border transition-colors cursor-pointer ${referrerType === "cliente" ? "bg-[var(--color-primary-blue)] text-white border-[var(--color-primary-blue)]" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border-[var(--color-border-default)]"}`}
              >
                Cliente
              </button>
            </div>
            <select
              required
              value={referrerId}
              onChange={(e) => setReferrerId(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
            >
              <option value="">Selecione {referrerType === "colaborador" ? "o colaborador" : "o cliente"}...</option>
              {referrerOptions.map((r: any) => (
                <option key={r.id} value={r.id}>{referrerType === "colaborador" ? r.nome : r.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Nome do Indicado (Lead / Cliente) *</label>
            <input
              type="text"
              required
              placeholder="Ex: Pedro Henrique"
              value={referredName}
              onChange={(e) => setReferredName(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Contato (opcional)</label>
            <input
              type="text"
              placeholder="Telefone ou e-mail do indicado"
              value={referredContact}
              onChange={(e) => setReferredContact(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Valor da Comissão (R$) *</label>
            <input
              type="number"
              required
              step="0.01"
              placeholder="0,00"
              value={commissionValue}
              onChange={(e) => setCommissionValue(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Observações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Contexto adicional sobre a indicação..."
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-[var(--color-border-subtle)]">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="h-9 px-4 text-xs font-bold border-[var(--color-border-default)]">
              Cancelar
            </Button>
            <Button type="submit" className="h-9 px-5 text-xs font-bold shadow-xs">
              Registrar Indicação
            </Button>
          </div>
        </form>
      </Modal>
      </div>
    </PageContainer>
  );
}
