import { useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  FileHeart, Plus, DollarSign, Stethoscope, Calendar,
  User, CheckCircle2, Clock, Trash2, X, Download
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";

interface PlanoTratamentoItem {
  id: string;
  paciente: string;
  telefone?: string;
  descricao: string;
  profissional: string;
  valorTotal: number;
  sessoesConcluidas: number;
  totalSessoes: number;
  status: "Em Elaboração" | "Aprovado pelo Paciente" | "Em Andamento" | "Concluído";
  data: string;
}

function rowToPlano(row: any): PlanoTratamentoItem {
  return {
    id: row.id,
    paciente: row.paciente,
    telefone: row.telefone || "",
    descricao: row.descricao || "",
    profissional: row.profissional || "",
    valorTotal: Number(row.valor_total) || 0,
    sessoesConcluidas: row.sessoes_concluidas ?? 0,
    totalSessoes: row.total_sessoes ?? 0,
    status: row.status,
    data: row.data ? new Date(row.data + "T00:00:00").toLocaleDateString("pt-BR") : "",
  };
}

export default function PlanosTratamento() {
  const { activeTenantId } = useAuth();

  const [planos, setPlanos] = useState<PlanoTratamentoItem[]>([]);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("clinica_planos_tratamento")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false });
      if (!cancelled && !error && data) {
        setPlanos(data.map(rowToPlano));
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [profFilter, setProfFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [paciente, setPaciente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [descricao, setDescricao] = useState("");
  const [profissional, setProfissional] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [totalSessoes, setTotalSessoes] = useState("4");
  const [status, setStatus] = useState<PlanoTratamentoItem["status"]>("Aprovado pelo Paciente");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paciente.trim() || !descricao.trim()) {
      toast.error("Informe o paciente e a descrição do plano.");
      return;
    }
    if (!supabase || !activeTenantId) {
      toast.error("Sem conexão com o banco de dados.");
      return;
    }

    const val = parseFloat(valorTotal.replace(/[^\d.]/g, "").replace(",", ".")) || 0;
    const sessoes = parseInt(totalSessoes, 10) || 1;
    const hoje = new Date();
    const dataIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

    const { data, error } = await supabase
      .from("clinica_planos_tratamento")
      .insert({
        tenant_id: activeTenantId,
        paciente: paciente.trim(),
        telefone: telefone.trim(),
        descricao: descricao.trim(),
        profissional: profissional.trim() || "Corpo Clínico",
        valor_total: val,
        sessoes_concluidas: 0,
        total_sessoes: sessoes,
        status,
        data: dataIso,
      })
      .select()
      .maybeSingle();

    if (error || !data) {
      toast.error("Erro ao registrar plano de tratamento.");
      return;
    }

    setPlanos(prev => [rowToPlano(data), ...prev]);
    toast.success("Plano de tratamento registrado com sucesso!");
    setModalOpen(false);

    setPaciente("");
    setTelefone("");
    setDescricao("");
    setProfissional("");
    setValorTotal("");
    setTotalSessoes("4");
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    const plano = planos.find(p => p.id === id);
    if (!(await confirmDialog({
      title: "Excluir plano de tratamento",
      description: `Excluir o plano de tratamento de "${plano?.paciente || "este paciente"}"? Essa ação não pode ser desfeita.`,
    }))) return;
    const { error } = await supabase.from("clinica_planos_tratamento").delete().eq("id", id);
    if (error) { toast.error("Erro ao remover plano."); return; }
    setPlanos(prev => prev.filter(p => p.id !== id));
    toast.info("Plano removido.");
  };

  const handleUpdateStatus = async (id: string, newStatus: PlanoTratamentoItem["status"]) => {
    if (!supabase) return;
    const { error } = await supabase.from("clinica_planos_tratamento").update({ status: newStatus }).eq("id", id);
    if (error) { toast.error("Erro ao atualizar status."); return; }
    setPlanos(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));
    toast.success(`Status do plano atualizado: ${newStatus}`);
  };

  const handleNextSession = async (id: string) => {
    if (!supabase) return;
    const plano = planos.find(p => p.id === id);
    if (!plano) return;
    const next = Math.min(plano.totalSessoes, plano.sessoesConcluidas + 1);
    const nextStatus = next === plano.totalSessoes ? "Concluído" : "Em Andamento";
    const { error } = await supabase
      .from("clinica_planos_tratamento")
      .update({ sessoes_concluidas: next, status: nextStatus })
      .eq("id", id);
    if (error) { toast.error("Erro ao registrar sessão."); return; }
    setPlanos(prev => prev.map(p => {
      if (p.id === id) {
        return { ...p, sessoesConcluidas: next, status: nextStatus };
      }
      return p;
    }));
    toast.success("Sessão concluída registrada!");
  };

  const handleExportCSV = () => {
    if (planos.length === 0) {
      toast.error("Nenhum plano para exportar.");
      return;
    }
    const headers = ["ID", "Paciente", "Telefone", "Descricao", "Profissional", "Valor_Total_BRL", "Sessoes_Concluidas", "Total_Sessoes", "Status", "Data_Inicio"];
    const rows = planos.map(p => [
      p.id,
      `"${p.paciente.replace(/"/g, '""')}"`,
      p.telefone || "",
      `"${p.descricao.replace(/"/g, '""')}"`,
      `"${p.profissional.replace(/"/g, '""')}"`,
      p.valorTotal.toFixed(2),
      p.sessoesConcluidas,
      p.totalSessoes,
      p.status,
      p.data,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `planos_tratamento_clinicos_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Relatório de planos de tratamento exportado!");
  };

  const profissionalOptions = Array.from(new Set(planos.map(p => p.profissional).filter(Boolean))).sort();
  const activeFilters = (search ? 1 : 0) + (filterStatus !== "Todos" ? 1 : 0) + (profFilter ? 1 : 0);
  const clearFilters = () => { setSearch(""); setFilterStatus("Todos"); setProfFilter(""); };

  const filtered = planos.filter(p => {
    if (profFilter && p.profissional !== profFilter) return false;
    const matchSearch = (
      p.paciente.toLowerCase().includes(search.toLowerCase()) ||
      p.descricao.toLowerCase().includes(search.toLowerCase()) ||
      p.profissional.toLowerCase().includes(search.toLowerCase())
    );
    const matchStatus = filterStatus === "Todos" || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <PageContainer
      title="Planos de Tratamento & Orçamentos"
      description="Elaboração de planos terapêuticos multidisciplinares, sessões, aprovação e evolução clínica."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="h-9 px-3.5 text-xs font-semibold gap-1.5 border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface-elevated)]"
          >
            <Download className="w-3.5 h-3.5 text-[var(--color-text-muted)]" /> Exportar CSV
          </Button>
          <Button onClick={() => setModalOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white">
            <Plus className="w-3.5 h-3.5" /> Novo Plano
          </Button>
        </div>
      }
    >
      <KpiFilterCard
        id="clinicaPlanosTratamento"
        className="mb-4"
        kpis={[
          { label: "Planos", value: filtered.length, icon: FileHeart, tone: "primary" },
          { label: "Em Andamento", value: filtered.filter(p => p.status === "Em Andamento").length, icon: Clock, tone: "warning" },
          { label: "Valor Total", value: `R$ ${filtered.reduce((sum, p) => sum + p.valorTotal, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, tone: "success" },
          { label: "Concluídos", value: filtered.filter(p => p.status === "Concluído").length, icon: CheckCircle2, tone: "info" },
        ]}
        activeCount={activeFilters}
        onClear={clearFilters}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por paciente, tratamento ou médico..." />
          <FilterSelect icon={Stethoscope} value={profFilter} onChange={setProfFilter} options={profissionalOptions} allLabel="Todos os profissionais" />
          <FilterChips value={filterStatus} onChange={setFilterStatus} allValue="Todos" allLabel="Todos" options={["Em Elaboração", "Aprovado pelo Paciente", "Em Andamento", "Concluído"]} />
        </FilterBar>
      </KpiFilterCard>

      {/* List */}
      <div className="space-y-3">
        {filtered.map(p => (
          <div key={p.id} className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-[var(--color-text-primary)]">{p.paciente}</h4>
                <span className="text-[10px] text-[var(--color-text-muted)]">• Resp.: {p.profissional}</span>
              </div>
              <p className="text-xs font-medium text-[var(--color-text-primary)]">{p.descricao}</p>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-muted)] pt-1">
                <span>Valor: <strong className="text-emerald-500 font-bold font-mono">R$ {p.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></span>
                <span>•</span>
                <span>Sessões: <strong className="text-[var(--color-text-primary)] font-mono">{p.sessoesConcluidas}/{p.totalSessoes}</strong></span>
                <span>•</span>
                <span>Início: {p.data}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {p.sessoesConcluidas < p.totalSessoes && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleNextSession(p.id)}
                  className="h-8 px-2.5 text-[11px] font-semibold gap-1 text-blue-600 dark:text-blue-400 border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> +1 Sessão
                </Button>
              )}

              <select
                value={p.status}
                onChange={e => handleUpdateStatus(p.id, e.target.value as any)}
                className="text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] focus:outline-none"
              >
                <option value="Em Elaboração">Em Elaboração</option>
                <option value="Aprovado pelo Paciente">Aprovado pelo Paciente</option>
                <option value="Em Andamento">Em Andamento</option>
                <option value="Concluído">Concluído</option>
              </select>

              <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)} className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10 rounded-xl">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="p-8 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl">
            Nenhum plano de tratamento encontrado para este filtro.
          </div>
        )}
      </div>

      {/* Standardized Modal: Novo Plano */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="max-w-md"
        title={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
              <FileHeart className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Novo Plano de Tratamento</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Defina as sessões, procedimentos inclusos e orçamento</p>
            </div>
          </div>
        }
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
              className="h-9 px-4 text-xs font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-plano-tratamento"
              className="h-9 px-4 text-xs font-semibold bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white"
            >
              Registrar Plano
            </Button>
          </div>
        }
      >
        <form id="form-plano-tratamento" onSubmit={handleCreate} className="space-y-3.5 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Paciente</label>
              <input
                type="text"
                required
                placeholder="Nome do paciente"
                value={paciente}
                onChange={e => setPaciente(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Telefone / WhatsApp</label>
              <input
                type="text"
                placeholder="(11) 90000-0000"
                value={telefone}
                onChange={e => setTelefone(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Descrição do Tratamento</label>
            <textarea
              rows={2}
              required
              placeholder="Ex: Harmonização Orofacial com Toxina e Ácido Hialurônico"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)] resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Médico Responsável</label>
            <input
              type="text"
              placeholder="Nome do médico ou especialista"
              value={profissional}
              onChange={e => setProfissional(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Total de Sessões</label>
              <input
                type="number"
                min="1"
                max="50"
                value={totalSessoes}
                onChange={e => setTotalSessoes(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Valor Total Orçado (R$)</label>
              <input
                type="text"
                required
                placeholder="Ex: 4800.00"
                value={valorTotal}
                onChange={e => setValorTotal(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono font-bold bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
}
