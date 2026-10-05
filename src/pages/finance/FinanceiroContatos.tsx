import { useMemo, useState } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, Users, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useIbgeLocalidades } from "../../lib/ibgeLocalidades";
import { StatCell, StatCellRow } from "./components/StatCell";
import { FinanceiroFilterBar } from "./components/FinanceiroFilterBar";
import { useFinanceiroFiltro } from "./FinanceiroFilterContext";
import { parseEntryDate } from "./lib/financeDates";

type Tipo = "CLIENTE" | "FORNECEDOR" | "FUNCIONARIO";
const TIPO_LABEL: Record<Tipo, string> = { CLIENTE: "Cliente", FORNECEDOR: "Fornecedor", FUNCIONARIO: "Funcionário" };

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

export default function FinanceiroContatos() {
  const { clienteBase, addClienteBase, updateClienteBase, deleteClienteBase, financeEntries } = useData();
  const { formatCurrency } = useLocalization();
  const { dataInicio, dataFim, label: periodoLabel } = useFinanceiroFiltro();
  const contatos = clienteBase as Contato[];

  const [aba, setAba] = useState<"todos" | Tipo>("todos");
  const [busca, setBusca] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
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
    const totalRecebido = clientes.reduce((s, c) => s + (totaisPorContato.get(c.id) || 0), 0);
    const totalPago = fornecedores.reduce((s, c) => s + (totaisPorContato.get(c.id) || 0), 0);
    return { totalRecebido, totalPago };
  }, [contatos, totaisPorContato]);

  const topContatosChart = useMemo(() => {
    if (aba !== "CLIENTE" && aba !== "FORNECEDOR") return [];
    return contatos
      .filter(c => c.tipos?.includes(aba))
      .map(c => ({ nome: c.name, valor: totaisPorContato.get(c.id) || 0 }))
      .filter(c => c.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);
  }, [contatos, aba, totaisPorContato]);

  const resetForm = () => { setForm(emptyForm); setEditingId(null); setFormError(""); };

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

    if (editingId) {
      await updateClienteBase(editingId, payload);
      toast.success("Contato atualizado.");
    } else {
      await addClienteBase(payload);
      toast.success("Contato criado.");
    }
    setIsModalOpen(false);
    resetForm();
  };

  const handleDelete = async (c: Contato) => {
    if (emUso.has(c.id)) { toast.error("Este contato tem lançamentos vinculados e não pode ser excluído."); return; }
    if (!(await confirmDialog({ title: "Excluir contato", description: `Excluir "${c.name}"? Essa ação não pode ser desfeita.` }))) return;
    // Mesmo bug já corrigido em Propostas.tsx: toast de sucesso disparava mesmo
    // quando a exclusão falhava de verdade (deleteClienteBase já mostra seu
    // próprio toast de erro quando retorna false, então só confirma aqui).
    const ok = await deleteClienteBase(c.id);
    if (ok) toast.success("Contato excluído.");
  };

  return (
    <PageContainer
      title="Contatos"
      description="Clientes, fornecedores e funcionários — usados em lançamentos, cobranças e relatórios."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Contatos" }]}
      actions={<Button onClick={openNew} className="h-9 px-4 text-xs font-medium gap-1.5"><Plus className="w-3.5 h-3.5" /> Novo Contato</Button>}
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        <FinanceiroFilterBar />
        <StatCellRow>
          <StatCell label={`Recebido de Clientes (${periodoLabel})`} value={formatCurrency(financeiroKpis.totalRecebido)} icon={TrendingUp} tone="success" hint="Lançamentos pagos, vinculados a um cliente" />
          <StatCell label={`Pago a Fornecedores (${periodoLabel})`} value={formatCurrency(financeiroKpis.totalPago)} icon={TrendingDown} tone={financeiroKpis.totalPago > 0 ? "danger" : "neutral"} hint="Lançamentos pagos, vinculados a um fornecedor" />
        </StatCellRow>

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

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]">
            {([
              { id: "todos", label: `Todos (${contatos.length})` },
              { id: "CLIENTE", label: `Clientes (${contatos.filter(c => c.tipos?.includes("CLIENTE")).length})` },
              { id: "FORNECEDOR", label: `Fornecedores (${contatos.filter(c => c.tipos?.includes("FORNECEDOR")).length})` },
              { id: "FUNCIONARIO", label: `Funcionários (${contatos.filter(c => c.tipos?.includes("FUNCIONARIO")).length})` },
            ] as const).map(t => (
              <Button key={t.id} size="sm" variant={aba === t.id ? "default" : "ghost"} onClick={() => setAba(t.id as any)} className="h-7 px-3 text-xs font-medium">{t.label}</Button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-faint)]" />
            <input type="text" placeholder="Buscar por nome, documento ou e-mail..." value={busca} onChange={(e) => setBusca(e.target.value)} className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] pl-9 pr-3 py-2 text-xs focus:outline-none" />
          </div>
        </div>

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
                  <tr key={c.id} className="hover:bg-[var(--color-surface-sunken)]/50">
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

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); resetForm(); }} title={editingId ? "Editar Contato" : "Novo Contato"} maxWidth="max-w-lg">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Tipo de Contato</label>
            <div className="flex gap-2">
              {(["CLIENTE", "FORNECEDOR", "FUNCIONARIO"] as Tipo[]).map(t => (
                <button key={t} type="button" onClick={() => toggleTipo(t)} className={`px-3 py-1.5 rounded-[var(--radius-control)] text-xs font-medium border transition-colors ${form.tipos.includes(t) ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/40 text-[var(--color-primary-blue)]" : "bg-[var(--color-surface-sunken)] border-[var(--color-border-default)] text-[var(--color-text-muted)]"}`}>
                  {TIPO_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Nome / Razão Social *</label>
            <input type="text" value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setFormError(""); }} maxLength={115} className={`w-full bg-[var(--color-surface-sunken)] border rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none ${formError ? "border-danger" : "border-[var(--color-border-default)]"}`} />
            {formError && <p className="text-[10px] text-danger mt-1">{formError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Tipo de Pessoa</label>
              <select value={form.tipo_pessoa} onChange={(e) => setForm({ ...form, tipo_pessoa: e.target.value as any })} className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs cursor-pointer">
                <option value="">Não informado</option>
                <option value="PF">Pessoa Física</option>
                <option value="PJ">Pessoa Jurídica</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">CPF/CNPJ</label>
              <input type="text" value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">E-mail</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs" />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Telefone</label>
              <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs" />
            </div>
          </div>

          <details>
            <summary className="text-xs font-semibold text-[var(--color-text-muted)] cursor-pointer">Endereço (opcional)</summary>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <input type="text" placeholder="CEP" value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs" />
              <input type="text" placeholder="Logradouro" value={form.logradouro} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs" />
              <input type="text" placeholder="Número" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs" />
              <input type="text" placeholder="Bairro" value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs" />
              <input type="text" placeholder="Complemento" value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs" />
              <select
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value, city: "" })}
                className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs uppercase"
              >
                <option value="">UF...</option>
                {estados.map((uf) => <option key={uf.sigla} value={uf.sigla}>{uf.sigla}</option>)}
              </select>
              {form.state && municipios.length > 0 ? (
                <select
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs"
                >
                  <option value="">{loadingMunicipios ? "Carregando..." : "Cidade..."}</option>
                  {municipios.map((m) => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder={form.state ? "Digite a cidade" : "Cidade (escolha a UF primeiro)"}
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs"
                />
              )}
            </div>
          </details>

          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border-subtle)]">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm(); }} className="h-9 px-4 text-xs font-medium">Cancelar</Button>
            <Button type="submit" className="h-9 px-5 text-xs font-medium">{editingId ? "Salvar Alterações" : "Criar Contato"}</Button>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
}
