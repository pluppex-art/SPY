import React, { useMemo, useState } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users, TrendingUp, TrendingDown, BarChart3, UserPlus, IdCard, FileText, Hash, Phone, Mail, MapPin, Save, Loader2, Search, Building2, Briefcase, Eye } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useIbgeLocalidades } from "../../lib/ibgeLocalidades";
import { FilterBar, FilterSearch, FilterChips } from "../../components/ui/kpi-filter-card";
import { FinanceKpiFilter } from "./components/FinanceKpiFilter";
import { FinancePeriodFilter } from "./components/FinancePeriodFilter";
import { useFinanceiroFiltro } from "./FinanceiroFilterContext";
import { parseEntryDate } from "./lib/financeDates";
import { DrillDownPanel } from "../../components/ui/DrillDownPanel";
import { financeEntryDrillColumns } from "../../components/ui/drillColumns";
import { ViewModal } from "./components/ViewModal";
import { Field, FormSection, ModalFooter, ModalTitle, inputCls, selectCls } from "./components/ModalKit";
import { fetchCnpj, formatCepMask, formatCnpjMask, onlyDigits } from "../../lib/brLookup";
import { formatPhone } from "../../lib/utils";

type Tipo = "CLIENTE" | "FORNECEDOR" | "FUNCIONARIO";
const TIPO_LABEL: Record<Tipo, string> = { CLIENTE: "Cliente", FORNECEDOR: "Fornecedor", FUNCIONARIO: "Funcionário" };
const TIPO_ICON: Record<Tipo, React.ComponentType<{ className?: string }>> = { CLIENTE: Users, FORNECEDOR: Building2, FUNCIONARIO: Briefcase };

const maskDocumento = (v: string) => {
  const d = onlyDigits(v).slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return formatCnpjMask(d);
};

interface Contato {
  id: string;
  name: string;
  tipos: Tipo[];
  tipo_pessoa: "PF" | "PJ" | null;
  documento: string | null;
  email: string | null;
  phone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  complemento: string | null;
  city: string | null;
  state: string | null;
}

const emptyForm = {
  name: "", tipos: [] as Tipo[], tipo_pessoa: "" as "" | "PF" | "PJ", documento: "", email: "", phone: "",
  cep: "", logradouro: "", numero: "", bairro: "", complemento: "", city: "", state: "",
};
import { useRowOpen } from "./components/useRowOpen";

export default function FinanceiroContatos() {
  const { clienteBase, addClienteBase, updateClienteBase, deleteClienteBase, financeEntries } = useData();
  const { formatCurrency } = useLocalization();
  const { dataInicio, dataFim, label: periodoLabel } = useFinanceiroFiltro();
  const contatos = clienteBase as Contato[];

  const [aba, setAba] = useState<"todos" | Tipo>("todos");
  const [busca, setBusca] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Contato | null>(null);
  const rowOpen = useRowOpen<Contato>(setViewing, (x) => openEdit(x));
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const { estados, municipios, loadingMunicipios } = useIbgeLocalidades(form.state);

  const emUso = useMemo(() => new Set((financeEntries as any[]).map(e => e.contato_id).filter(Boolean)), [financeEntries]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return contatos.filter(c => {
      const tipos = c.tipos && c.tipos.length > 0 ? c.tipos : [];
      if (aba !== "todos" && !tipos.includes(aba)) return false;
      if (!q) return true;
      return c.name?.toLowerCase().includes(q) || c.documento?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q);
    });
  }, [contatos, aba, busca]);

  const semTipo = contatos.filter(c => !c.tipos || c.tipos.length === 0);

  // Só entra aqui o que já foi de fato pago/recebido, dentro do período do
  // filtro global (barra no topo), e está vinculado a um contato real
  // (contato_id) — nunca soma lançamento avulso sem vínculo, pra não
  // misturar "total por contato" com o total geral do financeiro.
  const totaisPorContato = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of financeEntries as any[]) {
      if (e.status !== "Pago" || !e.contato_id) continue;
      const d = parseEntryDate(e.date);
      if (!d || d < dataInicio || d > dataFim) continue;
      map.set(e.contato_id, (map.get(e.contato_id) || 0) + e.value);
    }
    return map;
  }, [financeEntries, dataInicio, dataFim]);

  const financeiroKpis = useMemo(() => {
    const clientes = contatos.filter(c => c.tipos?.includes("CLIENTE"));
    const fornecedores = contatos.filter(c => c.tipos?.includes("FORNECEDOR"));
    const clienteIds = new Set(clientes.map(c => c.id));
    const fornecedorIds = new Set(fornecedores.map(c => c.id));
    const totalRecebido = clientes.reduce((s, c) => s + (totaisPorContato.get(c.id) || 0), 0);
    const totalPago = fornecedores.reduce((s, c) => s + (totaisPorContato.get(c.id) || 0), 0);
    const inPeriodoPago = (e: any) => {
      if (e.status !== "Pago" || !e.contato_id) return false;
      const d = parseEntryDate(e.date);
      return !!d && d >= dataInicio && d <= dataFim;
    };
    const recebidoRows = (financeEntries as any[]).filter(e => inPeriodoPago(e) && clienteIds.has(e.contato_id));
    const pagoRows = (financeEntries as any[]).filter(e => inPeriodoPago(e) && fornecedorIds.has(e.contato_id));
    return { totalRecebido, totalPago, recebidoRows, pagoRows };
  }, [contatos, totaisPorContato, financeEntries, dataInicio, dataFim]);

  const [drillKey, setDrillKey] = useState<"recebido" | "pago" | null>(null);
  const entryColumns = financeEntryDrillColumns(formatCurrency);

  const topContatosChart = useMemo(() => {
    if (aba !== "CLIENTE" && aba !== "FORNECEDOR") return [];
    return contatos
      .filter(c => c.tipos?.includes(aba))
      .map(c => ({ nome: c.name, valor: totaisPorContato.get(c.id) || 0 }))
      .filter(c => c.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);
  }, [contatos, aba, totaisPorContato]);

  const resetForm = () => { setForm(emptyForm); setEditingId(null); setFormError(""); setSaving(false); };
  const closeModal = () => { if (saving) return; setIsModalOpen(false); resetForm(); };

  // Resumo dos lançamentos ligados ao contato em edição (dados reais de finance_entries).
  const vinculos = useMemo(() => {
    if (!editingId) return null;
    let count = 0, totalPeriodo = 0, emAberto = 0;
    for (const e of financeEntries as any[]) {
      if (e.contato_id !== editingId) continue;
      count++;
      if (e.status === "Pago") {
        const d = parseEntryDate(e.date);
        if (d && d >= dataInicio && d <= dataFim) totalPeriodo += Number(e.value) || 0;
      } else emAberto += Number(e.value) || 0;
    }
    return { count, totalPeriodo, emAberto };
  }, [editingId, financeEntries, dataInicio, dataFim]);

  const viewVinculos = useMemo(() => {
    if (!viewing) return null;
    let count = 0, totalPeriodo = 0, emAberto = 0;
    for (const e of financeEntries as any[]) {
      if (e.contato_id !== viewing.id) continue;
      count++;
      if (e.status === "Pago") {
        const d = parseEntryDate(e.date);
        if (d && d >= dataInicio && d <= dataFim) totalPeriodo += Number(e.value) || 0;
      } else emAberto += Number(e.value) || 0;
    }
    return { count, totalPeriodo, emAberto };
  }, [viewing, financeEntries, dataInicio, dataFim]);

  const docDigits = onlyDigits(form.documento);
  const docWarning = !docDigits ? "" :
    docDigits.length !== 11 && docDigits.length !== 14 ? "CPF tem 11 dígitos e CNPJ tem 14." :
    form.tipo_pessoa === "PF" && docDigits.length === 14 ? "Pessoa Física normalmente usa CPF (11 dígitos)." :
    form.tipo_pessoa === "PJ" && docDigits.length === 11 ? "Pessoa Jurídica normalmente usa CNPJ (14 dígitos)." : "";
  const emailError = form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? "E-mail com formato inválido." : "";
  const phoneDigits = onlyDigits(form.phone);
  const phoneError = phoneDigits && (phoneDigits.length < 10 || phoneDigits.length > 11) ? "Telefone deve ter DDD + 8 ou 9 dígitos." : "";

  const handleBuscarCnpj = async () => {
    setBuscandoCnpj(true);
    try {
      const info = await fetchCnpj(docDigits);
      setForm(prev => ({
        ...prev,
        tipo_pessoa: prev.tipo_pessoa || "PJ",
        name: prev.name || info.razao_social || info.nome_fantasia,
        email: prev.email || info.email,
        phone: prev.phone || (info.telefone ? formatPhone(info.telefone) : ""),
        cep: prev.cep || (info.cep ? formatCepMask(info.cep) : ""),
      }));
      toast.success(`Dados de "${info.razao_social || info.nome_fantasia}" carregados (campos já preenchidos foram mantidos).`);
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível consultar o CNPJ.");
    } finally {
      setBuscandoCnpj(false);
    }
  };

  const openNew = () => { resetForm(); setIsModalOpen(true); };
  const openEdit = (c: Contato) => {
    setEditingId(c.id);
    setForm({
      name: c.name || "", tipos: c.tipos || [], tipo_pessoa: c.tipo_pessoa || "", documento: c.documento || "",
      email: c.email || "", phone: c.phone || "", cep: c.cep || "", logradouro: c.logradouro || "",
      numero: c.numero || "", bairro: c.bairro || "", complemento: c.complemento || "", city: c.city || "", state: c.state || "",
    });
    setFormError("");
    setIsModalOpen(true);
  };

  const toggleTipo = (t: Tipo) => {
    setForm(prev => ({ ...prev, tipos: prev.tipos.includes(t) ? prev.tipos.filter(x => x !== t) : [...prev.tipos, t] }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("Informe o nome / razão social."); return; }
    if (form.name.length > 115) { setFormError("Nome muito longo (máximo 115 caracteres)."); return; }
    setFormError("");

    const payload = {
      name: form.name.trim(),
      tipos: form.tipos,
      tipo_pessoa: form.tipo_pessoa || null,
      documento: form.documento || null,
      email: form.email || null,
      phone: form.phone || null,
      cep: form.cep || null,
      logradouro: form.logradouro || null,
      numero: form.numero || null,
      bairro: form.bairro || null,
      complemento: form.complemento || null,
      city: form.city || null,
      state: form.state || null,
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateClienteBase(editingId, payload);
        toast.success("Contato atualizado.");
      } else {
        await addClienteBase(payload);
        toast.success("Contato criado.");
      }
      setIsModalOpen(false);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: Contato, fromModal = false) => {
    if (emUso.has(c.id)) { toast.error("Este contato tem lançamentos vinculados e não pode ser excluído."); return; }
    if (!(await confirmDialog({ title: "Excluir contato", description: `Excluir "${c.name}"? Essa ação não pode ser desfeita.` }))) return;
    // Mesmo bug já corrigido em Propostas.tsx: toast de sucesso disparava mesmo
    // quando a exclusão falhava de verdade (deleteClienteBase já mostra seu
    // próprio toast de erro quando retorna false, então só confirma aqui).
    const ok = await deleteClienteBase(c.id);
    if (ok) {
      toast.success("Contato excluído.");
      if (fromModal) { setIsModalOpen(false); resetForm(); }
    }
  };

  return (
    <PageContainer
      title="Contatos"
      description="Clientes, fornecedores e funcionários — usados em lançamentos, cobranças e relatórios."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Contatos" }]}
      actions={<div className="flex items-center gap-2"><FinancePeriodFilter /><Button onClick={openNew} className="h-9 px-4 text-xs font-medium gap-1.5"><Plus className="w-3.5 h-3.5" /> Novo Contato</Button></div>}
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        <FinanceKpiFilter
          id="finContatos"
          kpis={[
            { label: `Recebido de Clientes (${periodoLabel})`, value: formatCurrency(financeiroKpis.totalRecebido), icon: TrendingUp, tone: "success", hint: "Lançamentos pagos, vinculados a um cliente" },
            { label: `Pago a Fornecedores (${periodoLabel})`, value: formatCurrency(financeiroKpis.totalPago), icon: TrendingDown, tone: financeiroKpis.totalPago > 0 ? "danger" : "neutral", hint: "Lançamentos pagos, vinculados a um fornecedor" },
            { label: "Contatos", value: contatos.length, icon: Users, tone: "primary" },
            { label: "Clientes", value: contatos.filter(c => c.tipos?.includes("CLIENTE")).length, icon: Users, tone: "info" },
            { label: "Fornecedores", value: contatos.filter(c => c.tipos?.includes("FORNECEDOR")).length, icon: Users, tone: "accent" },
          ]}
          activeCount={(busca ? 1 : 0) + (aba !== "todos" ? 1 : 0)}
          onClear={() => { setBusca(""); setAba("todos"); }}
        >
          <FilterBar>
            <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar por nome, documento ou e-mail..." />
            <FilterChips
              value={aba}
              onChange={v => setAba(v as "todos" | Tipo)}
              allValue="todos"
              allLabel={`Todos (${contatos.length})`}
              options={[
                { value: "CLIENTE", label: `Clientes (${contatos.filter(c => c.tipos?.includes("CLIENTE")).length})` },
                { value: "FORNECEDOR", label: `Fornecedores (${contatos.filter(c => c.tipos?.includes("FORNECEDOR")).length})` },
                { value: "FUNCIONARIO", label: `Funcionários (${contatos.filter(c => c.tipos?.includes("FUNCIONARIO")).length})` },
              ]}
            />
            <Button size="sm" variant="outline" onClick={() => setDrillKey("recebido")} className="h-[38px] px-3 text-xs font-medium gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> Ver recebido
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDrillKey("pago")} className="h-[38px] px-3 text-xs font-medium gap-1.5">
              <TrendingDown className="w-3.5 h-3.5" /> Ver pago
            </Button>
          </FilterBar>
        </FinanceKpiFilter>

        {topContatosChart.length > 0 && (
          <Card className="p-6">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[var(--color-text-faint)]" /> Top {aba === "CLIENTE" ? "Clientes (Recebido)" : "Fornecedores (Pago)"}
            </h3>
            <div className="w-full" style={{ height: Math.max(120, topContatosChart.length * 32) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topContatosChart} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="nome" type="category" stroke="var(--color-text-muted)" fontSize={11} width={120} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-control)" }} itemStyle={{ fontSize: "11px" }} />
                  <Bar dataKey="valor" radius={[0, 4, 4, 0]} fill={aba === "CLIENTE" ? "var(--color-success)" : "var(--color-danger)"} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        <Card className="overflow-hidden">
          {filtrados.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-8 h-8 text-[var(--color-text-faint)] mx-auto mb-3" />
              <p className="text-sm text-[var(--color-text-muted)]">Nenhum contato encontrado.</p>
            </div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
                <tr><th className="px-6 py-3">Nome</th><th className="px-6 py-3">Tipo</th><th className="px-6 py-3">Documento</th><th className="px-6 py-3">Contato</th><th className="px-6 py-3 text-right">Ações</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {filtrados.map(c => (
                  <tr key={c.id} {...rowOpen(c)} className="hover:bg-[var(--color-surface-sunken)]/50 cursor-pointer">
                    <td className="px-6 py-3 font-medium text-[var(--color-text-primary)]">{c.name}</td>
                    <td className="px-6 py-3">
                      {(!c.tipos || c.tipos.length === 0) ? <span className="text-[10px] text-[var(--color-text-faint)]">Outros</span> : (
                        <div className="flex gap-1 flex-wrap">
                          {c.tipos.map(t => <span key={t} className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">{TIPO_LABEL[t]}</span>)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-3 text-[var(--color-text-muted)] font-mono">{c.documento || "—"}</td>
                    <td className="px-6 py-3 text-[var(--color-text-muted)]">{c.email || c.phone || "—"}</td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" title="Visualizar" onClick={() => setViewing(c)} className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"><Eye className="w-3.5 h-3.5" /></button>
                        <button type="button" onClick={() => openEdit(c)} className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"><Pencil className="w-3.5 h-3.5" /></button>
                        <button type="button" onClick={() => handleDelete(c)} className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        {semTipo.length > 0 && aba === "todos" && <p className="text-[11px] text-[var(--color-text-faint)]">{semTipo.length} contato(s) sem tipo definido aparecem no grupo "Outros".</p>}
      </div>

      {viewing && (
        <ViewModal
          isOpen
          onClose={() => setViewing(null)}
          icon={Users}
          title={viewing.name}
          subtitle={viewing.tipos && viewing.tipos.length > 0 ? viewing.tipos.map(t => TIPO_LABEL[t]).join(" · ") : "Outros"}
          sections={[
            { icon: IdCard, title: "Identificação", rows: [
              { label: "Tipo de pessoa", value: viewing.tipo_pessoa === "PF" ? "Pessoa Física" : viewing.tipo_pessoa === "PJ" ? "Pessoa Jurídica" : null },
              { label: "CPF / CNPJ", value: viewing.documento || null, mono: true },
            ] },
            { icon: Phone, title: "Contato", rows: [
              { label: "E-mail", value: viewing.email || null },
              { label: "Telefone", value: viewing.phone || null },
            ] },
            { icon: MapPin, title: "Endereço", rows: [
              { label: "CEP", value: viewing.cep || null, mono: true },
              { label: "Logradouro", value: [viewing.logradouro, viewing.numero].filter(Boolean).join(", ") || null },
              { label: "Bairro", value: viewing.bairro || null },
              { label: "Complemento", value: viewing.complemento || null },
              { label: "Cidade / UF", value: [viewing.city, viewing.state].filter(Boolean).join(" / ") || null },
            ] },
            ...(viewVinculos ? [{ icon: BarChart3, title: "Lançamentos vinculados", rows: [
              { label: "Lançamentos", value: String(viewVinculos.count) },
              { label: `Movimentado (${periodoLabel})`, value: formatCurrency(viewVinculos.totalPeriodo), mono: true },
              { label: "Em aberto", value: formatCurrency(viewVinculos.emAberto), mono: true },
            ] }] : []),
          ]}
          newLabel="Novo contato"
          onEdit={() => { const c = viewing; setViewing(null); openEdit(c); }}
          onNew={() => { setViewing(null); openNew(); }}
          onDelete={() => { const c = viewing; setViewing(null); handleDelete(c); }}
        />
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={<ModalTitle icon={editingId ? Pencil : UserPlus} title={editingId ? "Editar Contato" : "Novo Contato"} subtitle={editingId ? "Atualize os dados deste contato. Só o nome é necessário para salvar." : "Cadastre um cliente, fornecedor ou funcionário para usar em lançamentos e cobranças."} />}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSave} className="space-y-4" noValidate>
          {editingId && vinculos && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Lançamentos vinculados", value: String(vinculos.count) },
                { label: `Movimentado (${periodoLabel})`, value: formatCurrency(vinculos.totalPeriodo) },
                { label: "Em aberto", value: formatCurrency(vinculos.emAberto) },
              ].map(s => (
                <div key={s.label} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]/60 px-3 py-2">
                  <div className="text-[10px] text-[var(--color-text-muted)] leading-tight">{s.label}</div>
                  <div className="text-xs font-mono font-bold text-[var(--color-text-primary)] mt-0.5">{s.value}</div>
                </div>
              ))}
            </div>
          )}

          <FormSection icon={IdCard} title="Identificação">
            <Field label="Tipo de contato" hint="Um contato pode ter mais de um tipo. Sem tipo, aparece em “Outros”.">
              <div className="flex gap-2 flex-wrap">
                {(["CLIENTE", "FORNECEDOR", "FUNCIONARIO"] as Tipo[]).map(t => {
                  const TIcon = TIPO_ICON[t];
                  const on = form.tipos.includes(t);
                  return (
                    <button key={t} type="button" onClick={() => toggleTipo(t)} aria-pressed={on} className={`h-9 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${on ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/40 text-[var(--color-primary-blue)]" : "bg-[var(--color-surface)] border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}>
                      <TIcon className="w-3.5 h-3.5" /> {TIPO_LABEL[t]}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Nome / Razão Social" icon={FileText} required error={formError} hint={`${form.name.length}/115 caracteres`}>
              <input type="text" autoFocus value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setFormError(""); }} maxLength={115} placeholder="Ex: Maria Silva ou Empresa LTDA" className={inputCls(!!formError)} />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Tipo de pessoa" icon={Users}>
                <select value={form.tipo_pessoa} onChange={(e) => setForm({ ...form, tipo_pessoa: e.target.value as any })} className={selectCls()}>
                  <option value="">Não informado</option>
                  <option value="PF">Pessoa Física</option>
                  <option value="PJ">Pessoa Jurídica</option>
                </select>
              </Field>
              <Field label="CPF / CNPJ" icon={Hash} error={docWarning} hint={!docWarning ? "Opcional. Apenas números ou com máscara." : undefined}>
                <div className="flex gap-1.5">
                  <input type="text" inputMode="numeric" value={form.documento} onChange={(e) => setForm({ ...form, documento: maskDocumento(e.target.value) })} placeholder="000.000.000-00" className={`${inputCls(!!docWarning)} font-mono`} />
                  {docDigits.length === 14 && (
                    <button type="button" onClick={handleBuscarCnpj} disabled={buscandoCnpj} title="Preencher nome, e-mail, telefone e CEP pela Receita" className="h-9 px-2.5 shrink-0 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] disabled:opacity-60 cursor-pointer">
                      {buscandoCnpj ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </Field>
            </div>
          </FormSection>

          <FormSection icon={Phone} title="Contato">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="E-mail" icon={Mail} error={emailError}>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contato@empresa.com" className={inputCls(!!emailError)} />
              </Field>
              <Field label="Telefone / WhatsApp" icon={Phone} error={phoneError}>
                <input type="text" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })} placeholder="(11) 99999-9999" className={inputCls(!!phoneError)} />
              </Field>
            </div>
          </FormSection>

          <FormSection icon={MapPin} title="Endereço" hint="opcional">
            <div className="grid grid-cols-6 gap-3">
              <Field label="CEP" className="col-span-6 sm:col-span-2">
                <input type="text" inputMode="numeric" placeholder="00000-000" value={form.cep} onChange={(e) => setForm({ ...form, cep: formatCepMask(e.target.value) })} className={`${inputCls()} font-mono`} />
              </Field>
              <Field label="Logradouro" className="col-span-6 sm:col-span-3">
                <input type="text" placeholder="Rua, avenida..." value={form.logradouro} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} className={inputCls()} />
              </Field>
              <Field label="Número" className="col-span-3 sm:col-span-1">
                <input type="text" placeholder="123" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className={inputCls()} />
              </Field>
              <Field label="Bairro" className="col-span-3 sm:col-span-3">
                <input type="text" value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} className={inputCls()} />
              </Field>
              <Field label="Complemento" className="col-span-6 sm:col-span-3">
                <input type="text" placeholder="Sala, bloco, apto..." value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} className={inputCls()} />
              </Field>
              <Field label="UF" className="col-span-2 sm:col-span-2">
                <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value, city: "" })} className={`${selectCls()} uppercase`}>
                  <option value="">UF...</option>
                  {estados.map((uf) => <option key={uf.sigla} value={uf.sigla}>{uf.sigla}</option>)}
                </select>
              </Field>
              <Field label="Cidade" className="col-span-4 sm:col-span-4" hint={!form.state ? "Escolha a UF para listar as cidades." : undefined}>
                {form.state && municipios.length > 0 ? (
                  <select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={selectCls()}>
                    <option value="">{loadingMunicipios ? "Carregando..." : "Cidade..."}</option>
                    {municipios.map((m) => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                  </select>
                ) : (
                  <input type="text" placeholder={form.state ? "Digite a cidade" : "Cidade"} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputCls()} />
                )}
              </Field>
            </div>
          </FormSection>

          <ModalFooter
            onCancel={closeModal}
            saving={saving}
            submitLabel={editingId ? "Salvar alterações" : "Criar contato"}
            submitIcon={Save}
            left={editingId ? (
              <Button type="button" variant="ghost" onClick={() => { const c = contatos.find(x => x.id === editingId); if (c) handleDelete(c, true); }} disabled={saving} className="h-9 px-3 text-xs font-bold gap-1.5 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10">
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </Button>
            ) : undefined}
          />
        </form>
      </Modal>

      <DrillDownPanel
        isOpen={drillKey !== null}
        onClose={() => setDrillKey(null)}
        title={drillKey === "recebido" ? "Recebido de Clientes" : drillKey === "pago" ? "Pago a Fornecedores" : undefined}
        subtitle={periodoLabel}
        rows={drillKey === "recebido" ? financeiroKpis.recebidoRows : drillKey === "pago" ? financeiroKpis.pagoRows : []}
        columns={entryColumns}
      />
    </PageContainer>
  );
}
